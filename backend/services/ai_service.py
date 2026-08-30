"""
AI Service — Data-driven business intelligence.
No hallucination: all answers come from database queries.
Respects outlet authorization.
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from database import q_one, q_all
from routes.auth import get_user_outlets

JAKARTA = ZoneInfo("Asia/Jakarta")


def _outlet_clause(user, outlet_id=None):
    """Build SQL outlet filter clause."""
    if outlet_id:
        return " AND outlet_id = :outlet_id ", {"outlet_id": outlet_id}
    if user["role"] == "owner":
        return "", {}
    outlets = user.get("outlet_ids", [])
    if not outlets:
        return " AND 1=0 ", {}
    ids = ",".join(f"'{o}'" for o in outlets)
    return f" AND outlet_id IN ({ids}) ", {}


# ============================================================
# AI ASSISTANT — Q&A with data
# ============================================================

async def ai_assistant(question: str, user: dict, outlet_id: str = None) -> dict:
    """
    Answer business questions based on database data.
    Returns: answer, data_sources, facts, observations, recommendations
    """
    q_lower = question.lower().strip()
    clause, params = _outlet_clause(user, outlet_id)
    now = datetime.now(JAKARTA)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # ---- Pattern matching ----

    # 1. "Cabang mana yang penjualannya paling tinggi hari ini?"
    if any(w in q_lower for w in ["cabang tertinggi", "outlet tertinggi", "paling tinggi", "terbaik", "terlaris outlet"]):
        return await _top_outlet_today(user, outlet_id, now, today_start)

    # 2. "Produk apa yang paling laku minggu ini?"
    if any(w in q_lower for w in ["produk paling laku", "produk terlaris", "paling laku", "best seller", "produk terjual"]):
        period = "minggu" if "minggu" in q_lower else ("hari" if "hari" in q_lower else "minggu")
        return await _top_products(user, outlet_id, period, now)

    # 3. "Berapa total penjualan semua outlet bulan ini?"
    if any(w in q_lower for w in ["total penjualan", "berapa penjualan", "omzet", "revenue"]):
        period = "bulan" if "bulan" in q_lower else ("hari" if "hari" in q_lower else "minggu")
        return await _total_sales(user, outlet_id, period, now)

    # 4. "Siapa yang paling sering terlambat?"
    if "terlambat" in q_lower or "late" in q_lower:
        return await _late_employees(user, outlet_id)

    # 5. "Outlet mana yang paling banyak transaksi?"
    if any(w in q_lower for w in ["paling banyak transaksi", "outlet terbanyak", "transaksi terbanyak"]):
        return await _most_transactions(user, outlet_id, now, today_start)

    # 6. "Produk apa yang berpotensi habis?"
    if any(w in q_lower for w in ["berpotensi habis", "stok menipis", "stok habis", "low stock", "stockout"]):
        return await _low_stock_analysis(user, outlet_id)

    # 7. "Kenapa penjualan turun?"
    if any(w in q_lower for w in ["kenapa turun", "penjualan turun", "kenapa menurun", "turun"]):
        return await _sales_decline_analysis(user, outlet_id, now)

    # 8. Default — try to give general overview
    return await _general_overview(user, outlet_id, now, today_start)


async def _top_outlet_today(user, outlet_id, now, today_start):
    """Which outlet has highest sales today."""
    if user["role"] != "owner" and not outlet_id:
        return {
            "answer": "Anda hanya dapat melihat outlet yang ditugaskan. Silakan pilih outlet spesifik.",
            "facts": [], "observations": [], "recommendations": [],
            "data_sources": ["sales"],
        }

    rows = await q_all("""
        SELECT o.name AS outlet_name,
               COALESCE(SUM(s.total), 0) AS revenue,
               COUNT(s.id) AS transactions
        FROM outlets o
        LEFT JOIN sales s ON s.outlet_id = o.id
            AND s.created_at >= :start
        GROUP BY o.name
        ORDER BY revenue DESC
    """, start=today_start)

    if not rows or all(float(r["revenue"] or 0) == 0 for r in rows):
        return {
            "answer": "Belum ada penjualan hari ini pada semua outlet.",
            "facts": ["Tidak ada transaksi tercatat hari ini"],
            "observations": ["Mungkin outlet baru saja buka atau belum ada transaksi"],
            "recommendations": ["Periksa apakah shift sudah dibuka di setiap outlet"],
            "data_sources": ["sales", "outlets"],
        }

    top = rows[0]
    facts = [f"Outlet dengan penjualan tertinggi hari ini: {top['outlet_name']} dengan {float(top['revenue']):,.0f} ({top['transactions']} transaksi)"]
    observations = []
    for i, r in enumerate(rows[1:], 2):
        observations.append(f"#{i}: {r['outlet_name']} — {float(r['revenue'] or 0):,.0f} ({r['transactions']} tx)")

    return {
        "answer": f"Outlet dengan penjualan tertinggi hari ini adalah **{top['outlet_name']}** dengan total **{float(top['revenue'] or 0):,.0f}** dari **{top['transactions']}** transaksi.",
        "facts": facts,
        "observations": observations,
        "recommendations": ["Pelajari faktor sukses outlet teratas untuk diterapkan di outlet lain"],
        "data_sources": ["sales", "outlets"],
    }


async def _top_products(user, outlet_id, period, now):
    """Top selling products."""
    if period == "hari":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        period_label = "hari ini"
    else:
        start = now - timedelta(days=7)
        period_label = "7 hari terakhir"

    clause, params = _outlet_clause(user, outlet_id)
    params["start"] = start

    rows = await q_all(f"""
        SELECT elem->>'name' AS name,
               SUM(COALESCE((elem->>'quantity')::numeric, 0)) AS qty,
               SUM(COALESCE((elem->>'price')::numeric, 0) * COALESCE((elem->>'quantity')::numeric, 0)) AS revenue
        FROM sales, jsonb_array_elements(items) elem
        WHERE created_at >= :start
          {clause}
        GROUP BY elem->>'name'
        ORDER BY qty DESC
        LIMIT 5
    """, **params)

    if not rows:
        return {
            "answer": f"Belum ada produk terjual {period_label}.",
            "facts": [f"Tidak ada data penjualan {period_label}"],
            "observations": [], "recommendations": [],
            "data_sources": ["sales"],
        }

    top = rows[0]
    facts = [f"Produk paling laku {period_label}: {top['name']} dengan {int(top['qty'])} unit terjual"]
    observations = [f"#{i+1}: {r['name']} — {int(r['qty'])} unit, revenue {float(r['revenue'] or 0):,.0f}" for i, r in enumerate(rows[1:], 2)]

    return {
        "answer": f"Produk paling laku {period_label} adalah **{top['name']}** dengan **{int(top['qty'])}** unit terjual (revenue: {float(top['revenue'] or 0):,.0f}).",
        "facts": facts,
        "observations": observations,
        "recommendations": ["Pastikan stok produk terlaris selalu tersedia"],
        "data_sources": ["sales"],
    }


async def _total_sales(user, outlet_id, period, now):
    """Total sales for a period."""
    if period == "bulan":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        label = "bulan ini"
    elif period == "hari":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        label = "hari ini"
    else:
        start = now - timedelta(days=7)
        label = "7 hari terakhir"

    clause, params = _outlet_clause(user, outlet_id)
    params["start"] = start

    stats = await q_one(f"""
        SELECT COALESCE(SUM(total), 0) AS revenue, COUNT(*) AS transactions
        FROM sales WHERE created_at >= :start {clause}
    """, **params)

    rev = float(stats["revenue"] or 0)
    tx = int(stats["transactions"] or 0)

    return {
        "answer": f"Total penjualan {label}: **{rev:,.0f}** dari **{tx}** transaksi.",
        "facts": [f"Revenue {label}: {rev:,.0f}", f"Transaksi: {tx}"],
        "observations": [f"Rata-rata per transaksi: {rev/max(tx,1):,.0f}"],
        "recommendations": [],
        "data_sources": ["sales"],
    }


async def _late_employees(user, outlet_id):
    """Who is late the most."""
    clause, params = _outlet_clause(user, outlet_id)

    rows = await q_all(f"""
        SELECT cashier_name,
               COUNT(*) AS late_count,
               MAX(clock_in_at) AS last_late
        FROM attendance
        WHERE status = 'active'
          AND clock_in_at IS NOT NULL
          {clause}
        GROUP BY cashier_name
        ORDER BY late_count DESC
        LIMIT 5
    """, **params)

    if not rows:
        return {
            "answer": "Tidak ada data keterlambatan karyawan.",
            "facts": ["Tidak ada record keterlambatan"],
            "observations": [], "recommendations": [],
            "data_sources": ["attendance"],
        }

    top = rows[0]
    facts = [f"Karyawan paling sering terlambat: {top['cashier_name']} ({top['late_count']} kali)"]
    observations = [f"#{i+1}: {r['cashier_name']} — {r['late_count']} kali" for i, r in enumerate(rows[1:], 2)]

    return {
        "answer": f"Karyawan paling sering terlambat adalah **{top['cashier_name']}** dengan **{top['late_count']}** kali keterlambatan.",
        "facts": facts,
        "observations": observations,
        "recommendations": ["Berikan coaching untuk karyawan yang sering terlambat"],
        "data_sources": ["attendance"],
    }


async def _most_transactions(user, outlet_id, now, today_start):
    """Which outlet has most transactions."""
    rows = await q_all("""
        SELECT o.name AS outlet_name, COUNT(s.id) AS transactions
        FROM outlets o
        LEFT JOIN sales s ON s.outlet_id = o.id AND s.created_at >= :start
        GROUP BY o.name
        ORDER BY transactions DESC
    """, start=today_start)

    if not rows or all(int(r["transactions"] or 0) == 0 for r in rows):
        return {
            "answer": "Belum ada transaksi hari ini.",
            "facts": ["Tidak ada transaksi tercatat hari ini"],
            "observations": [], "recommendations": [],
            "data_sources": ["sales", "outlets"],
        }

    top = rows[0]
    return {
        "answer": f"Outlet dengan transaksi terbanyak hari ini: **{top['outlet_name']}** dengan **{top['transactions']}** transaksi.",
        "facts": [f"{top['outlet_name']}: {top['transactions']} transaksi"],
        "observations": [f"#{i+1}: {r['outlet_name']} — {r['transactions']} tx" for i, r in enumerate(rows[1:], 2)],
        "recommendations": [],
        "data_sources": ["sales", "outlets"],
    }


async def _low_stock_analysis(user, outlet_id):
    """Products at risk of stockout."""
    if outlet_id:
        rows = await q_all("""
            SELECT p.name, p.sku, os.quantity, p.low_stock_threshold, p.unit
            FROM products p
            JOIN outlet_stocks os ON os.product_id = p.id
            WHERE os.outlet_id = :oid AND os.quantity <= p.low_stock_threshold
            ORDER BY os.quantity ASC LIMIT 10
        """, oid=outlet_id)
    else:
        rows = await q_all("""
            SELECT p.name, p.sku, COALESCE(os.quantity, p.stock) AS quantity,
                   p.low_stock_threshold, p.unit, o.name AS outlet_name
            FROM products p
            LEFT JOIN outlet_stocks os ON os.product_id = p.id
            LEFT JOIN outlets o ON o.id = os.outlet_id
            WHERE COALESCE(os.quantity, p.stock) <= p.low_stock_threshold
            ORDER BY COALESCE(os.quantity, p.stock) ASC LIMIT 10
        """)

    if not rows:
        return {
            "answer": "Tidak ada produk dengan stok menipis saat ini.",
            "facts": ["Semua produk di atas threshold stok minimum"],
            "observations": [], "recommendations": ["Pantau stok secara berkala"],
            "data_sources": ["products", "outlet_stocks"],
        }

    critical = [r for r in rows if int(r["quantity"] or 0) <= 0]
    facts = [f"{len(rows)} produk dengan stok menipis"]
    if critical:
        facts.append(f"{len(critical)} produk sudah habis (stok 0)")

    observations = [f"- {r['name']}: {r['quantity']} {r['unit']} (min: {r['low_stock_threshold']})" for r in rows[:5]]

    return {
        "answer": f"Ditemukan **{len(rows)}** produk dengan stok menipis" + (f", {len(critical)} di antaranya sudah habis." if critical else "."),
        "facts": facts,
        "observations": observations,
        "recommendations": ["Segera lakukan pembelian ulang untuk produk kritis", "Pertimbangkan transfer stok antar outlet"],
        "data_sources": ["products", "outlet_stocks"],
    }


async def _sales_decline_analysis(user, outlet_id, now):
    """Analyze why sales declined."""
    clause, params = _outlet_clause(user, outlet_id)

    # Compare today vs yesterday
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)

    params["today_start"] = today_start
    params["yesterday_start"] = yesterday_start

    today_stats = await q_one(f"""
        SELECT COALESCE(SUM(total), 0) AS revenue, COUNT(*) AS tx
        FROM sales WHERE created_at >= :today_start {clause}
    """, **params)

    yesterday_stats = await q_one(f"""
        SELECT COALESCE(SUM(total), 0) AS revenue, COUNT(*) AS tx
        FROM sales WHERE created_at >= :yesterday_start AND created_at < :today_start {clause}
    """, **params)

    today_rev = float(today_stats["revenue"] or 0)
    yest_rev = float(yesterday_stats["revenue"] or 0)
    today_tx = int(today_stats["tx"] or 0)
    yest_tx = int(yesterday_stats["tx"] or 0)

    if yest_rev == 0:
        return {
            "answer": "Tidak ada data penjualan kemarin untuk dibandingkan.",
            "facts": ["Tidak ada baseline data kemarin"],
            "observations": [], "recommendations": [],
            "data_sources": ["sales"],
        }

    change_pct = ((today_rev - yest_rev) / yest_rev) * 100

    facts = [
        f"Penjualan hari ini: {today_rev:,.0f} ({today_tx} tx)",
        f"Penjualan kemarin: {yest_rev:,.0f} ({yest_tx} tx)",
        f"Perubahan: {change_pct:+.1f}%",
    ]

    observations = []
    if change_pct < 0:
        observations.append(f"Penjualan turun {abs(change_pct):.1f}%")
        if today_tx < yest_tx:
            observations.append(f"Jumlah transaksi turun dari {yest_tx} ke {today_tx}")
        avg_today = today_rev / max(today_tx, 1)
        avg_yest = yest_rev / max(yest_tx, 1)
        if avg_today < avg_yest:
            observations.append(f"Rata-rata per transaksi turun dari {avg_yest:,.0f} ke {avg_today:,.0f}")
    elif change_pct > 0:
        observations.append(f"Penjualan naik {change_pct:.1f}%")

    recommendations = []
    if change_pct < -10:
        recommendations = [
            "Periksa availability produk dan stok di outlet",
            "Periksa traffic pada peak hour (18:00-20:00)",
            "Periksa apakah ada karyawan yang tidak masuk",
        ]

    direction = "turun" if change_pct < 0 else "naik" if change_pct > 0 else "stabil"
    return {
        "answer": f"Penjualan hari ini **{direction} {abs(change_pct):.1f}%** dibanding kemarin. Hari ini: {today_rev:,.0f}, kemarin: {yest_rev:,.0f}.",
        "facts": facts,
        "observations": observations,
        "recommendations": recommendations,
        "data_sources": ["sales"],
    }


async def _general_overview(user, outlet_id, now, today_start):
    """General business overview."""
    clause, params = _outlet_clause(user, outlet_id)
    params["start"] = today_start

    stats = await q_one(f"""
        SELECT COALESCE(SUM(total), 0) AS revenue, COUNT(*) AS tx
        FROM sales WHERE created_at >= :start {clause}
    """, **params)

    rev = float(stats["revenue"] or 0)
    tx = int(stats["tx"] or 0)

    return {
        "answer": f"Overview hari ini: penjualan **{rev:,.0f}** dari **{tx}** transaksi. Coba tanyakan: 'Produk apa yang paling laku?', 'Outlet mana yang tertinggi?', atau 'Produk apa yang berpotensi habis?'",
        "facts": [f"Revenue hari ini: {rev:,.0f}", f"Transaksi: {tx}"],
        "observations": [],
        "recommendations": ["Gunakan pertanyaan yang lebih spesifik untuk analisis mendalam"],
        "data_sources": ["sales"],
    }


# ============================================================
# AI DAILY BRIEFING
# ============================================================

async def ai_daily_briefing(user: dict, outlet_id: str = None) -> dict:
    """Generate daily briefing from database data."""
    now = datetime.now(JAKARTA)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=7)
    clause, params = _outlet_clause(user, outlet_id)

    # Today's sales
    p = {**params, "today": today_start, "week": week_start}
    today = await q_one(f"""
        SELECT COALESCE(SUM(total), 0) AS rev, COUNT(*) AS tx
        FROM sales WHERE created_at >= :today {clause}
    """, **p)

    # 7-day average
    week = await q_one(f"""
        SELECT COALESCE(SUM(total), 0) AS rev, COUNT(*) AS tx
        FROM sales WHERE created_at >= :week {clause}
    """, **p)

    avg_daily = float(week["rev"] or 0) / 7
    today_rev = float(today["rev"] or 0)
    change_pct = ((today_rev - avg_daily) / max(avg_daily, 1)) * 100

    # Low stock count
    if outlet_id:
        low = await q_one("""
            SELECT COUNT(*) AS c FROM products p
            JOIN outlet_stocks os ON os.product_id = p.id
            WHERE os.outlet_id = :oid AND os.quantity <= p.low_stock_threshold
        """, oid=outlet_id)
    else:
        low = await q_one("""
            SELECT COUNT(*) AS c FROM products p
            WHERE p.stock <= p.low_stock_threshold
        """)

    # Active shifts
    shifts = await q_one(f"""
        SELECT COUNT(*) AS c FROM shifts WHERE status = 'open' {clause}
    """, **params)

    # Late today
    late = await q_one(f"""
        SELECT COUNT(*) AS c FROM attendance
        WHERE clock_in_at >= :today AND status = 'active' {clause}
    """, today=today_start, **params)

    briefings = []

    if avg_daily > 0:
        direction = "lebih tinggi" if change_pct > 0 else "lebih rendah"
        briefings.append(
            f"Hari ini total penjualan {abs(change_pct):.1f}% {direction} "
            f"dibanding rata-rata 7 hari terakhir."
        )

    # Top outlet
    if user["role"] == "owner" and not outlet_id:
        top = await q_one("""
            SELECT o.name, COALESCE(SUM(s.total), 0) AS rev
            FROM outlets o LEFT JOIN sales s ON s.outlet_id = o.id AND s.created_at >= :today
            GROUP BY o.name ORDER BY rev DESC LIMIT 1
        """, today=today_start)
        if top and float(top["rev"] or 0) > 0:
            briefings.append(f"Outlet dengan performa terbaik hari ini: {top['name']}.")

    # Low stock
    low_count = int(low["c"] or 0)
    if low_count > 0:
        briefings.append(f"Terdapat {low_count} produk dengan risiko stockout.")

    # Late employees
    late_count = int(late["c"] or 0)
    if late_count > 0:
        briefings.append(f"Terdapat {late_count} karyawan tercatat aktif hari ini.")

    # Active shifts
    shift_count = int(shifts["c"] or 0)
    briefings.append(f"{shift_count} shift sedang aktif saat ini.")

    return {
        "date": now.strftime("%Y-%m-%d"),
        "briefings": briefings,
        "summary": {
            "today_revenue": today_rev,
            "today_transactions": int(today["tx"] or 0),
            "avg_daily_revenue": avg_daily,
            "change_pct": change_pct,
            "low_stock_count": low_count,
            "active_shifts": shift_count,
            "active_attendance": late_count,
        },
        "data_sources": ["sales", "products", "outlet_stocks", "shifts", "attendance"],
    }


# ============================================================
# AI ANOMALY DETECTION
# ============================================================

async def ai_anomaly_detection(user: dict, outlet_id: str = None) -> dict:
    """Detect anomalies in sales, discounts, stock, attendance."""
    now = datetime.now(JAKARTA)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=7)
    clause, params = _outlet_clause(user, outlet_id)

    anomalies = []

    # 1. Sales anomaly — today vs 7-day average
    p = {**params, "today": today_start, "week": week_start}
    today = await q_one(f"""
        SELECT COALESCE(SUM(total), 0) AS rev, COALESCE(SUM(discount), 0) AS disc
        FROM sales WHERE created_at >= :today {clause}
    """, **p)

    week_avg = await q_one(f"""
        SELECT COALESCE(AVG(daily_rev), 0) AS avg_rev,
               COALESCE(AVG(daily_disc), 0) AS avg_disc
        FROM (
            SELECT DATE(created_at) AS d,
                   SUM(total) AS daily_rev,
                   SUM(discount) AS daily_disc
            FROM sales WHERE created_at >= :week {clause}
            GROUP BY DATE(created_at)
        ) sub
    """, **p)

    today_rev = float(today["rev"] or 0)
    avg_rev = float(week_avg["avg_rev"] or 0)
    if avg_rev > 0 and today_rev > 0:
        dev = ((today_rev - avg_rev) / avg_rev) * 100
        if abs(dev) > 50:
            anomalies.append({
                "category": "SALES",
                "severity": "critical" if abs(dev) > 100 else "warning",
                "title": f"Penjualan {'spike' if dev > 0 else 'drop'} {abs(dev):.0f}%",
                "message": f"Penjualan hari ini {today_rev:,.0f} vs rata-rata {avg_rev:,.0f}",
                "deviation_pct": dev,
                "data": {"today": today_rev, "average": avg_rev},
            })

    # 2. Discount anomaly
    today_disc = float(today["disc"] or 0)
    avg_disc = float(week_avg["avg_disc"] or 0)
    if avg_disc > 0 and today_disc > avg_disc * 3:
        anomalies.append({
            "category": "DISCOUNT",
            "severity": "warning",
            "title": "Discount tidak wajar",
            "message": f"Discount hari ini {today_disc:,.0f} vs rata-rata {avg_disc:,.0f}",
            "deviation_pct": ((today_disc - avg_disc) / avg_disc) * 100,
            "data": {"today": today_disc, "average": avg_disc},
        })

    # 3. Stock anomaly — products at 0
    if outlet_id:
        zero_stock = await q_all("""
            SELECT p.name, os.quantity FROM products p
            JOIN outlet_stocks os ON os.product_id = p.id
            WHERE os.outlet_id = :oid AND os.quantity <= 0
        """, oid=outlet_id)
    else:
        zero_stock = await q_all("""
            SELECT p.name, p.stock AS quantity FROM products p
            WHERE p.stock <= 0 AND p.is_active = TRUE
        """)

    if zero_stock:
        anomalies.append({
            "category": "INVENTORY",
            "severity": "critical",
            "title": f"{len(zero_stock)} produk stok habis",
            "message": f"Produk: {', '.join([r['name'] for r in zero_stock[:5]])}",
            "data": {"products": [r["name"] for r in zero_stock]},
        })

    return {
        "anomalies": anomalies,
        "count": len(anomalies),
        "checked_at": now.isoformat(),
        "data_sources": ["sales", "products", "outlet_stocks"],
    }


# ============================================================
# AI FORECASTING
# ============================================================

async def ai_forecast(user: dict, outlet_id: str = None, days: int = 7) -> dict:
    """
    Simple forecasting based on historical data.
    Uses moving average. Returns confidence based on data availability.
    """
    clause, params = _outlet_clause(user, outlet_id)

    # Get last 30 days of daily sales
    rows = await q_all(f"""
        SELECT DATE(created_at) AS date,
               SUM(total) AS revenue,
               COUNT(*) AS transactions
        FROM sales
        WHERE created_at >= NOW() - INTERVAL '30 days'
          {clause}
        GROUP BY DATE(created_at)
        ORDER BY date DESC
    """, **params)

    if len(rows) < 7:
        return {
            "forecast": [],
            "confidence": "low",
            "message": "Insufficient historical data. Butuh minimal 7 hari data untuk forecasting.",
            "data_points": len(rows),
            "data_sources": ["sales"],
        }

    # Simple moving average forecast
    revenues = [float(r["revenue"] or 0) for r in rows]
    avg = sum(revenues) / len(revenues)

    # Calculate variance for confidence
    if len(revenues) > 1:
        variance = sum((r - avg) ** 2 for r in revenues) / len(revenues)
        std_dev = variance ** 0.5
        cv = std_dev / max(avg, 1)  # coefficient of variation
    else:
        cv = 1

    if cv < 0.2:
        confidence = "high"
    elif cv < 0.5:
        confidence = "medium"
    else:
        confidence = "low"

    # Generate forecast for next N days
    from datetime import timedelta as td
    now = datetime.now(JAKARTA)
    forecast = []
    for i in range(1, days + 1):
        forecast_date = (now + td(days=i)).strftime("%Y-%m-%d")
        forecast.append({
            "date": forecast_date,
            "predicted_revenue": round(avg, 2),
            "predicted_transactions": round(sum(int(r["transactions"] or 0) for r in rows) / len(rows)),
        })

    total_forecast = sum(f["predicted_revenue"] for f in forecast)

    return {
        "forecast": forecast,
        "total_predicted": total_forecast,
        "confidence": confidence,
        "confidence_reason": f"Koefisien variasi: {cv:.2f} — {'stabil' if cv < 0.2 else 'cukup stabil' if cv < 0.5 else 'tidak stabil'}",
        "data_points": len(rows),
        "average_daily_revenue": avg,
        "data_sources": ["sales"],
    }
