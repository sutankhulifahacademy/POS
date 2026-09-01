"""Online Profitability Report routes."""
from datetime import datetime, timedelta, date
from zoneinfo import ZoneInfo
from routes.deps import *
from routes.auth import require_permission

router = APIRouter()
JAKARTA = ZoneInfo("Asia/Jakarta")


def _outlet_filter(user, outlet_id=None, prefix="o"):
    if outlet_id:
        return f" AND {prefix}.outlet_id = :outlet_id ", {"outlet_id": outlet_id}
    if user["role"] == "owner":
        return "", {}
    outlets = user.get("outlet_ids", [])
    if not outlets:
        return f" AND 1=0 ", {}
    ids = ",".join(f"'{o}'" for o in outlets)
    return f" AND {prefix}.outlet_id IN ({ids}) ", {}


@router.get("/online-profit/report")
async def online_profit_report(
    date_from: str = None,
    date_to: str = None,
    outlet_id: str = None,
    platform_id: str = None,
    group_by: str = "platform",  # platform, outlet, product, daily, weekly, monthly
    user=Depends(require_permission("online_platforms", "view")),
):
    """
    Online profitability report with filters.

    Returns:
        - summary: total gross, total deduction, total settlement, total COGS, total profit, margins
        - breakdown: by platform / outlet / product / time period
        - chart: daily data for charts
    """
    now = datetime.now(JAKARTA)
    if not date_from:
        date_from = (now - timedelta(days=30)).strftime("%Y-%m-%d")
    if not date_to:
        date_to = now.strftime("%Y-%m-%d")

    # Parse to datetime for asyncpg
    df_dt = datetime.strptime(date_from[:10], "%Y-%m-%d")
    dt_dt = datetime.strptime(date_to[:10], "%Y-%m-%d").replace(hour=23, minute=59, second=59)

    clause, clause_params = _outlet_filter(user, outlet_id, "o")
    params = {"df": df_dt, "dt": dt_dt}
    params.update(clause_params)

    if platform_id:
        clause += " AND o.platform_id = :pid "
        params["pid"] = platform_id

    # ============ SUMMARY ============
    summary_row = await q_one(f"""
        SELECT
            COUNT(*) AS order_count,
            COALESCE(SUM(o.gross_sales), 0) AS total_gross,
            COALESCE(SUM(o.total_deduction), 0) AS total_deduction,
            COALESCE(SUM(o.commission_amount), 0) AS total_commission,
            COALESCE(SUM(o.fixed_fee), 0) AS total_fixed_fee,
            COALESCE(SUM(o.tax_on_fee), 0) AS total_tax,
            COALESCE(SUM(o.merchant_promo), 0) AS total_merchant_promo,
            COALESCE(SUM(o.advertising_fee), 0) AS total_advertising,
            COALESCE(SUM(o.other_fee), 0) AS total_other_fee,
            COALESCE(SUM(o.expected_settlement), 0) AS total_expected_settlement,
            COALESCE(SUM(o.actual_settlement), 0) AS total_actual_settlement,
            COALESCE(SUM(o.total_cogs), 0) AS total_cogs,
            COALESCE(SUM(o.gross_profit), 0) AS total_profit
        FROM online_orders o
        WHERE o.created_at >= :df
          AND o.created_at <= :dt
          {clause}
    """, **params)

    total_gross = float(summary_row["total_gross"] or 0)
    total_deduction = float(summary_row["total_deduction"] or 0)
    total_settlement = float(summary_row["total_expected_settlement"] or 0)
    total_cogs = float(summary_row["total_cogs"] or 0)
    total_profit = float(summary_row["total_profit"] or 0)

    effective_fee_pct = (total_deduction / total_gross * 100) if total_gross > 0 else 0
    profit_margin = (total_profit / total_gross * 100) if total_gross > 0 else 0
    margin_on_settlement = (total_profit / total_settlement * 100) if total_settlement > 0 else 0

    summary = {
        "order_count": int(summary_row["order_count"] or 0),
        "total_gross": round(total_gross, 2),
        "total_deduction": round(total_deduction, 2),
        "total_commission": round(float(summary_row["total_commission"] or 0), 2),
        "total_fixed_fee": round(float(summary_row["total_fixed_fee"] or 0), 2),
        "total_tax": round(float(summary_row["total_tax"] or 0), 2),
        "total_merchant_promo": round(float(summary_row["total_merchant_promo"] or 0), 2),
        "total_advertising": round(float(summary_row["total_advertising"] or 0), 2),
        "total_other_fee": round(float(summary_row["total_other_fee"] or 0), 2),
        "total_expected_settlement": round(total_settlement, 2),
        "total_actual_settlement": round(float(summary_row["total_actual_settlement"] or 0), 2),
        "total_cogs": round(total_cogs, 2),
        "total_profit": round(total_profit, 2),
        "effective_fee_pct": round(effective_fee_pct, 2),
        "profit_margin": round(profit_margin, 2),
        "margin_on_settlement": round(margin_on_settlement, 2),
    }

    # ============ BREAKDOWN ============
    breakdown = []

    if group_by == "platform":
        rows = await q_all(f"""
            SELECT
                p.id AS platform_id, p.name AS platform_name, p.code AS platform_code, p.color,
                COUNT(*) AS order_count,
                COALESCE(SUM(o.gross_sales), 0) AS total_gross,
                COALESCE(SUM(o.total_deduction), 0) AS total_deduction,
                COALESCE(SUM(o.expected_settlement), 0) AS total_settlement,
                COALESCE(SUM(o.total_cogs), 0) AS total_cogs,
                COALESCE(SUM(o.gross_profit), 0) AS total_profit
            FROM online_orders o
            JOIN online_platforms p ON o.platform_id = p.id
            WHERE o.created_at >= :df AND o.created_at <= :dt {clause}
            GROUP BY p.id, p.name, p.code, p.color
            ORDER BY total_gross DESC
        """, **params)
        for r in rows:
            g = float(r["total_gross"] or 0)
            d = float(r["total_deduction"] or 0)
            pr = float(r["total_profit"] or 0)
            s = float(r["total_settlement"] or 0)
            breakdown.append({
                "platform_id": str(r["platform_id"]),
                "name": r["platform_name"],
                "code": r["platform_code"],
                "color": r["color"],
                "order_count": int(r["order_count"] or 0),
                "total_gross": round(g, 2),
                "total_deduction": round(d, 2),
                "effective_fee_pct": round(d / g * 100, 2) if g > 0 else 0,
                "total_settlement": round(s, 2),
                "total_cogs": round(float(r["total_cogs"] or 0), 2),
                "total_profit": round(pr, 2),
                "profit_margin": round(pr / g * 100, 2) if g > 0 else 0,
                "margin_on_settlement": round(pr / s * 100, 2) if s > 0 else 0,
            })

    elif group_by == "outlet":
        rows = await q_all(f"""
            SELECT
                COALESCE(out.id, '00000000-0000-0000-0000-000000000000') AS outlet_id,
                COALESCE(out.name, 'No Outlet') AS outlet_name,
                COUNT(*) AS order_count,
                COALESCE(SUM(o.gross_sales), 0) AS total_gross,
                COALESCE(SUM(o.total_deduction), 0) AS total_deduction,
                COALESCE(SUM(o.expected_settlement), 0) AS total_settlement,
                COALESCE(SUM(o.total_cogs), 0) AS total_cogs,
                COALESCE(SUM(o.gross_profit), 0) AS total_profit
            FROM online_orders o
            LEFT JOIN outlets out ON o.outlet_id = out.id
            WHERE o.created_at >= :df AND o.created_at <= :dt {clause}
            GROUP BY out.id, out.name
            ORDER BY total_gross DESC
        """, **params)
        for r in rows:
            g = float(r["total_gross"] or 0)
            d = float(r["total_deduction"] or 0)
            pr = float(r["total_profit"] or 0)
            s = float(r["total_settlement"] or 0)
            breakdown.append({
                "outlet_id": str(r["outlet_id"]),
                "name": r["outlet_name"],
                "order_count": int(r["order_count"] or 0),
                "total_gross": round(g, 2),
                "total_deduction": round(d, 2),
                "effective_fee_pct": round(d / g * 100, 2) if g > 0 else 0,
                "total_settlement": round(s, 2),
                "total_cogs": round(float(r["total_cogs"] or 0), 2),
                "total_profit": round(pr, 2),
                "profit_margin": round(pr / g * 100, 2) if g > 0 else 0,
            })

    elif group_by == "product":
        rows = await q_all(f"""
            SELECT
                COALESCE(i.product_id, '00000000-0000-0000-0000-000000000000') AS product_id,
                i.product_name,
                COALESCE(i.variant_name, '') AS variant_name,
                SUM(i.quantity) AS total_qty,
                SUM(i.gross_sales) AS total_gross,
                SUM(i.cogs) AS total_cogs,
                SUM(i.profit) AS total_profit
            FROM online_order_items i
            JOIN online_orders o ON i.order_id = o.id
            WHERE o.created_at >= :df AND o.created_at <= :dt {clause}
            GROUP BY i.product_id, i.product_name, i.variant_name
            ORDER BY total_gross DESC
            LIMIT 50
        """, **params)
        for r in rows:
            g = float(r["total_gross"] or 0)
            pr = float(r["total_profit"] or 0)
            breakdown.append({
                "product_id": str(r["product_id"]),
                "name": r["product_name"],
                "variant_name": r["variant_name"],
                "total_qty": int(r["total_qty"] or 0),
                "total_gross": round(g, 2),
                "total_cogs": round(float(r["total_cogs"] or 0), 2),
                "total_profit": round(pr, 2),
                "profit_margin": round(pr / g * 100, 2) if g > 0 else 0,
            })

    elif group_by in ("daily", "weekly", "monthly"):
        if group_by == "daily":
            date_trunc = "day"
        elif group_by == "weekly":
            date_trunc = "week"
        else:
            date_trunc = "month"

        rows = await q_all(f"""
            SELECT
                DATE_TRUNC('{date_trunc}', o.created_at) AS period,
                COUNT(*) AS order_count,
                COALESCE(SUM(o.gross_sales), 0) AS total_gross,
                COALESCE(SUM(o.total_deduction), 0) AS total_deduction,
                COALESCE(SUM(o.expected_settlement), 0) AS total_settlement,
                COALESCE(SUM(o.total_cogs), 0) AS total_cogs,
                COALESCE(SUM(o.gross_profit), 0) AS total_profit
            FROM online_orders o
            WHERE o.created_at >= :df AND o.created_at <= :dt {clause}
            GROUP BY period
            ORDER BY period
        """, **params)
        for r in rows:
            g = float(r["total_gross"] or 0)
            d = float(r["total_deduction"] or 0)
            pr = float(r["total_profit"] or 0)
            s = float(r["total_settlement"] or 0)
            breakdown.append({
                "period": r["period"].isoformat() if r["period"] else None,
                "order_count": int(r["order_count"] or 0),
                "total_gross": round(g, 2),
                "total_deduction": round(d, 2),
                "effective_fee_pct": round(d / g * 100, 2) if g > 0 else 0,
                "total_settlement": round(s, 2),
                "total_cogs": round(float(r["total_cogs"] or 0), 2),
                "total_profit": round(pr, 2),
                "profit_margin": round(pr / g * 100, 2) if g > 0 else 0,
            })

    # ============ CHART (daily for chart) ============
    chart_rows = await q_all(f"""
        SELECT
            DATE_TRUNC('day', o.created_at) AS day,
            COALESCE(SUM(o.gross_sales), 0) AS gross,
            COALESCE(SUM(o.total_deduction), 0) AS deduction,
            COALESCE(SUM(o.expected_settlement), 0) AS settlement,
            COALESCE(SUM(o.gross_profit), 0) AS profit
        FROM online_orders o
        WHERE o.created_at >= :df AND o.created_at <= :dt {clause}
        GROUP BY day
        ORDER BY day
    """, **params)
    chart = [
        {
            "day": r["day"].isoformat() if r["day"] else None,
            "gross": round(float(r["gross"] or 0), 2),
            "deduction": round(float(r["deduction"] or 0), 2),
            "settlement": round(float(r["settlement"] or 0), 2),
            "profit": round(float(r["profit"] or 0), 2),
        }
        for r in chart_rows
    ]

    return {
        "summary": summary,
        "breakdown": breakdown,
        "chart": chart,
        "filters": {
            "date_from": date_from,
            "date_to": date_to,
            "outlet_id": outlet_id,
            "platform_id": platform_id,
            "group_by": group_by,
        },
    }


# ============================================================
# PRODUCT PROFITABILITY PER PLATFORM
# ============================================================
@router.get("/online-profit/product/{product_id}")
async def product_profit_per_platform(
    product_id: str,
    date_from: str = None,
    date_to: str = None,
    user=Depends(require_permission("online_platforms", "view")),
):
    """Product profitability breakdown per platform."""
    now = datetime.now(JAKARTA)
    if not date_from:
        date_from = (now - timedelta(days=30)).strftime("%Y-%m-%d")
    if not date_to:
        date_to = now.strftime("%Y-%m-%d")

    df_dt = datetime.strptime(date_from[:10], "%Y-%m-%d")
    dt_dt = datetime.strptime(date_to[:10], "%Y-%m-%d").replace(hour=23, minute=59, second=59)

    clause, clause_params = _outlet_filter(user, None, "o")
    params = {
        "df": df_dt,
        "dt": dt_dt,
        "pid": product_id,
    }
    params.update(clause_params)

    rows = await q_all(f"""
        SELECT
            p.id AS platform_id, p.name AS platform_name, p.code AS platform_code, p.color,
            SUM(i.quantity) AS total_qty,
            SUM(i.gross_sales) AS total_gross,
            SUM(i.cogs) AS total_cogs,
            SUM(i.profit) AS total_profit
        FROM online_order_items i
        JOIN online_orders o ON i.order_id = o.id
        JOIN online_platforms p ON o.platform_id = p.id
        WHERE i.product_id = :pid
          AND o.created_at >= :df AND o.created_at <= :dt
          {clause}
        GROUP BY p.id, p.name, p.code, p.color
        ORDER BY total_profit DESC
    """, **params)

    return [
        {
            "platform_id": str(r["platform_id"]),
            "platform_name": r["platform_name"],
            "platform_code": r["platform_code"],
            "color": r["color"],
            "total_qty": int(r["total_qty"] or 0),
            "total_gross": round(float(r["total_gross"] or 0), 2),
            "total_cogs": round(float(r["total_cogs"] or 0), 2),
            "total_profit": round(float(r["total_profit"] or 0), 2),
            "profit_margin": round(float(r["total_profit"] or 0) / float(r["total_gross"] or 1) * 100, 2),
        }
        for r in rows
    ]
