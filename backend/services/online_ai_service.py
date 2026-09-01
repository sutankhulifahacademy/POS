"""AI Online Profitability Analysis — data-driven insights.

Distinguishes ACTUAL DATA, ESTIMATED DATA, and MARKET BENCHMARK.
No hallucination — all numbers come from database queries.
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from database import q_one, q_all
from routes.auth import get_user_outlets

JAKARTA = ZoneInfo("Asia/Jakarta")

# Market benchmark (ESTIMATED — labeled as such, not actual)
MARKET_BENCHMARKS = {
    "grabfood": {"min_pct": 15, "max_pct": 30, "label": "ESTIMATED"},
    "gofood": {"min_pct": 20, "max_pct": 25, "label": "ESTIMATED"},
    "shopeefood": {"min_pct": 12, "max_pct": 20, "label": "ESTIMATED"},
}


def _outlet_filter(user, outlet_id=None):
    if outlet_id:
        return " AND o.outlet_id = :outlet_id ", {"outlet_id": outlet_id}
    if user["role"] == "owner":
        return "", {}
    outlets = user.get("outlet_ids", [])
    if not outlets:
        return " AND 1=0 ", {}
    ids = ",".join(f"'{o}'" for o in outlets)
    return f" AND o.outlet_id IN ({ids}) ", {}


async def ai_online_analysis(user: dict, outlet_id: str = None, target_margin: float = 25.0) -> dict:
    """
    AI analysis of online profitability.

    Returns:
        - platform_comparison
        - fee_trends
        - product_warnings
        - recommendations
        - market_benchmark (labeled as ESTIMATED)
    """
    now = datetime.now(JAKARTA)
    date_from = (now - timedelta(days=30)).strftime("%Y-%m-%d")
    date_to = now.strftime("%Y-%m-%d")

    df_dt = datetime.strptime(date_from, "%Y-%m-%d")
    dt_dt = datetime.strptime(date_to, "%Y-%m-%d").replace(hour=23, minute=59, second=59)

    clause, clause_params = _outlet_filter(user, outlet_id)
    params = {"df": df_dt, "dt": dt_dt}
    params.update(clause_params)

    # ============ PLATFORM COMPARISON ============
    platform_rows = await q_all(f"""
        SELECT
            p.code AS platform_code, p.name AS platform_name,
            COUNT(*) AS order_count,
            COALESCE(SUM(o.gross_sales), 0) AS total_gross,
            COALESCE(SUM(o.total_deduction), 0) AS total_deduction,
            COALESCE(SUM(o.expected_settlement), 0) AS total_settlement,
            COALESCE(SUM(o.total_cogs), 0) AS total_cogs,
            COALESCE(SUM(o.gross_profit), 0) AS total_profit
        FROM online_orders o
        JOIN online_platforms p ON o.platform_id = p.id
        WHERE o.created_at >= :df AND o.created_at <= :dt {clause}
        GROUP BY p.code, p.name
        ORDER BY total_gross DESC
    """, **params)

    platform_comparison = []
    for r in platform_rows:
        g = float(r["total_gross"] or 0)
        d = float(r["total_deduction"] or 0)
        pr = float(r["total_profit"] or 0)
        s = float(r["total_settlement"] or 0)
        eff_fee = d / g * 100 if g > 0 else 0
        margin = pr / g * 100 if g > 0 else 0

        # Market benchmark comparison
        benchmark = MARKET_BENCHMARKS.get(r["platform_code"], {})
        benchmark_label = benchmark.get("label", "ESTIMATED")
        benchmark_min = benchmark.get("min_pct", 0)
        benchmark_max = benchmark.get("max_pct", 0)

        benchmark_status = "within"
        if eff_fee > benchmark_max:
            benchmark_status = "above_benchmark"
        elif eff_fee < benchmark_min:
            benchmark_status = "below_benchmark"

        platform_comparison.append({
            "platform": r["platform_name"],
            "platform_code": r["platform_code"],
            "order_count": int(r["order_count"] or 0),
            "total_gross": round(g, 2),
            "total_deduction": round(d, 2),
            "effective_fee_pct": round(eff_fee, 2),
            "total_settlement": round(s, 2),
            "total_cogs": round(float(r["total_cogs"] or 0), 2),
            "total_profit": round(pr, 2),
            "profit_margin": round(margin, 2),
            "market_benchmark": {
                "label": benchmark_label,
                "min_pct": benchmark_min,
                "max_pct": benchmark_max,
            },
            "benchmark_status": benchmark_status,
        })

    # ============ FEE TRENDS (monthly) ============
    trend_rows = await q_all(f"""
        SELECT
            p.code AS platform_code, p.name AS platform_name,
            DATE_TRUNC('month', o.created_at) AS month,
            COALESCE(SUM(o.gross_sales), 0) AS gross,
            COALESCE(SUM(o.total_deduction), 0) AS deduction
        FROM online_orders o
        JOIN online_platforms p ON o.platform_id = p.id
        WHERE o.created_at >= :df AND o.created_at <= :dt {clause}
        GROUP BY p.code, p.name, month
        ORDER BY p.code, month
    """, **params)

    # Group by platform
    trends_by_platform = {}
    for r in trend_rows:
        code = r["platform_code"]
        if code not in trends_by_platform:
            trends_by_platform[code] = {"platform": r["platform_name"], "months": []}
        g = float(r["gross"] or 0)
        d = float(r["deduction"] or 0)
        eff = d / g * 100 if g > 0 else 0
        trends_by_platform[code]["months"].append({
            "month": r["month"].strftime("%Y-%m") if r["month"] else "",
            "effective_fee_pct": round(eff, 2),
        })

    # Calculate trend direction
    fee_trends = []
    for code, data in trends_by_platform.items():
        months = data["months"]
        if len(months) >= 2:
            recent = months[-1]["effective_fee_pct"]
            previous = months[-2]["effective_fee_pct"]
            diff = recent - previous
            if diff > 0.5:
                trend = "increasing"
            elif diff < -0.5:
                trend = "decreasing"
            else:
                trend = "stable"
            avg = sum(m["effective_fee_pct"] for m in months) / len(months)
            fee_trends.append({
                "platform": data["platform"],
                "platform_code": code,
                "average_fee": round(avg, 2),
                "recent_fee": recent,
                "previous_fee": previous,
                "trend": trend,
                "change": round(diff, 2),
                "months": months,
            })

    # ============ PRODUCT WARNINGS ============
    product_rows = await q_all(f"""
        SELECT
            i.product_name,
            i.variant_name,
            p.code AS platform_code, p.name AS platform_name,
            SUM(i.gross_sales) AS gross,
            SUM(i.cogs) AS cogs,
            SUM(i.profit) AS profit
        FROM online_order_items i
        JOIN online_orders o ON i.order_id = o.id
        JOIN online_platforms p ON o.platform_id = p.id
        WHERE o.created_at >= :df AND o.created_at <= :dt {clause}
        GROUP BY i.product_name, i.variant_name, p.code, p.name
        HAVING SUM(i.gross_sales) > 0
    """, **params)

    product_warnings = []
    for r in product_rows:
        g = float(r["gross"] or 0)
        pr = float(r["profit"] or 0)
        margin = pr / g * 100 if g > 0 else 0
        if margin < target_margin:
            severity = "critical" if margin < 0 else "warning"
            product_warnings.append({
                "product": r["product_name"],
                "variant": r["variant_name"],
                "platform": r["platform_name"],
                "platform_code": r["platform_code"],
                "margin": round(margin, 2),
                "target_margin": target_margin,
                "severity": severity,
                "message": f"{r['product_name']} di {r['platform_name']} memiliki margin {margin:.1f}%, di bawah target {target_margin}%",
            })

    # ============ RECOMMENDATIONS ============
    recommendations = []
    observations = []
    facts = []

    # Best platform
    if platform_comparison:
        best = max(platform_comparison, key=lambda x: x["profit_margin"])
        worst = max(platform_comparison, key=lambda x: x["effective_fee_pct"])
        facts.append(f"Platform paling profitable: {best['platform']} dengan margin {best['profit_margin']}%")
        recommendations.append(f"Prioritaskan penjualan di {best['platform']} untuk margin terbaik")

        if worst["benchmark_status"] == "above_benchmark":
            observations.append(
                f"⚠️ {worst['platform']} memiliki effective fee {worst['effective_fee_pct']}%, "
                f"di atas market benchmark {worst['market_benchmark']['min_pct']}-{worst['market_benchmark']['max_pct']}% (ESTIMATED)"
            )

    # Fee trend warnings
    for t in fee_trends:
        if t["trend"] == "increasing":
            observations.append(
                f"⚠️ {t['platform']} effective fee meningkat {t['change']}% "
                f"dibanding bulan sebelumnya ({t['previous_fee']}% → {t['recent_fee']}%)"
            )

    # Product warnings
    if product_warnings:
        observations.append(f"⚠️ {len(product_warnings)} produk memiliki margin di bawah target {target_margin}%")
        critical = [w for w in product_warnings if w["severity"] == "critical"]
        if critical:
            observations.append(f"⚠️ {len(critical)} produk berpotensi RUGI pada platform tertentu")

    # Summary
    total_gross = sum(p["total_gross"] for p in platform_comparison)
    total_profit = sum(p["total_profit"] for p in platform_comparison)
    overall_margin = total_profit / total_gross * 100 if total_gross > 0 else 0

    if overall_margin < target_margin:
        recommendations.append(
            f"Overall margin online ({overall_margin:.1f}%) di bawah target ({target_margin}%). "
            "Pertimbangkan menaikkan Online Price atau bernegosiasi ulang fee platform."
        )

    return {
        "platform_comparison": platform_comparison,
        "fee_trends": fee_trends,
        "product_warnings": product_warnings,
        "recommendations": recommendations,
        "observations": observations,
        "facts": facts,
        "summary": {
            "total_gross": round(total_gross, 2),
            "total_profit": round(total_profit, 2),
            "overall_margin": round(overall_margin, 2),
            "target_margin": target_margin,
            "platform_count": len(platform_comparison),
            "warning_count": len(product_warnings),
        },
        "data_labels": {
            "platform_comparison": "ACTUAL DATA",
            "fee_trends": "ACTUAL DATA",
            "product_warnings": "ACTUAL DATA",
            "market_benchmark": "ESTIMATED / MARKET REFERENCE",
        },
    }
