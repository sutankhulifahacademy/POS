"""Reports routes — dashboard & comprehensive manager reporting."""
from routes.deps import *
from zoneinfo import ZoneInfo

router = APIRouter()

JAKARTA = ZoneInfo("Asia/Jakarta")


# ============ HELPERS ============
def _period_range(period: str, date_from: Optional[str], date_to: Optional[str]):
    """
    Resolve (start_local, end_local) datetime in Asia/Jakarta.
    Supports daily/weekly/monthly/yearly/custom.
    """
    now_local = datetime.now(JAKARTA)

    if period == "custom":
        if not date_from or not date_to:
            raise HTTPException(
                status_code=400,
                detail="custom period requires date_from and date_to"
            )
        start_local = datetime.fromisoformat(date_from).replace(
            tzinfo=JAKARTA,
            hour=0, minute=0, second=0, microsecond=0
        )
        end_local = datetime.fromisoformat(date_to).replace(
            tzinfo=JAKARTA,
            hour=23, minute=59, second=59, microsecond=999999
        ) + timedelta(microseconds=1)
        return start_local, end_local

    if period == "daily":
        start_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
        end_local = start_local + timedelta(days=1)

    elif period == "weekly":
        start_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=6)
        end_local = now_local.replace(hour=23, minute=59, second=59, microsecond=999999) + timedelta(microseconds=1)

    elif period == "monthly":
        start_local = now_local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if start_local.month == 12:
            end_local = start_local.replace(year=start_local.year + 1, month=1)
        else:
            end_local = start_local.replace(month=start_local.month + 1)

    elif period == "yearly":
        start_local = now_local.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        end_local = start_local.replace(year=start_local.year + 1)

    else:
        raise HTTPException(status_code=400, detail="invalid period")

    return start_local, end_local


def _outlet_filter(outlet_id: Optional[str]):
    """Return (clause, params_dict_key) for optional outlet filtering."""
    if outlet_id:
        return " AND outlet_id = :outlet_id "
    return " "


# ============ REPORTS ============
@router.get("/reports/dashboard")
async def report_dashboard(
    period: Literal["daily", "weekly", "monthly", "yearly"] = "weekly",
    user=Depends(get_current_user)
):
    """
    Dashboard reporting dengan periode:
    - daily   : hari ini, chart per jam
    - weekly  : 7 hari terakhir, chart per hari
    - monthly : bulan berjalan, chart per hari
    - yearly  : tahun berjalan, chart per bulan

    Semua batas waktu menggunakan Asia/Jakarta.
    """

    from zoneinfo import ZoneInfo

    jakarta = ZoneInfo("Asia/Jakarta")
    now_local = datetime.now(jakarta)

    # ---------------------------------------------------------
    # PERIOD RANGE
    # ---------------------------------------------------------
    if period == "daily":
        start_local = now_local.replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        end_local = start_local + timedelta(days=1)

    elif period == "weekly":
        # 7 hari termasuk hari ini
        start_local = (
            now_local.replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            - timedelta(days=6)
        )
        end_local = now_local.replace(
            hour=23, minute=59, second=59, microsecond=999999
        ) + timedelta(microseconds=1)

    elif period == "monthly":
        start_local = now_local.replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )

        if start_local.month == 12:
            end_local = start_local.replace(
                year=start_local.year + 1,
                month=1
            )
        else:
            end_local = start_local.replace(
                month=start_local.month + 1
            )

    else:  # yearly
        start_local = now_local.replace(
            month=1,
            day=1,
            hour=0,
            minute=0,
            second=0,
            microsecond=0
        )
        end_local = start_local.replace(
            year=start_local.year + 1
        )

    # ---------------------------------------------------------
    # SUMMARY
    # ---------------------------------------------------------
    stats = await q_one("""
        SELECT
            COALESCE(SUM(total), 0) AS revenue,
            COUNT(*) AS transactions
        FROM sales
        WHERE created_at >= :start_at
          AND created_at < :end_at
    """,
        start_at=start_local,
        end_at=end_local
    )

    # ---------------------------------------------------------
    # ITEMS SOLD
    # ---------------------------------------------------------
    items_period = await q_one("""
        SELECT
            COALESCE(
                SUM(
                    COALESCE((elem->>'quantity')::numeric, 0)
                ),
                0
            ) AS items
        FROM sales,
             jsonb_array_elements(items) elem
        WHERE created_at >= :start_at
          AND created_at < :end_at
    """,
        start_at=start_local,
        end_at=end_local
    )

    # ---------------------------------------------------------
    # GLOBAL MASTER DATA
    # ---------------------------------------------------------
    products_count = await q_one("""
        SELECT COUNT(*) AS c
        FROM products
    """)

    customers_count = await q_one("""
        SELECT COUNT(*) AS c
        FROM customers
    """)

    # ---------------------------------------------------------
    # LOW STOCK
    # ---------------------------------------------------------
    low_stock = await q_all("""
        SELECT *
        FROM products
        WHERE stock <= low_stock_threshold
        ORDER BY stock ASC
        LIMIT 10
    """)

    # ---------------------------------------------------------
    # CHART
    # ---------------------------------------------------------
    if period == "daily":

        chart_rows = await q_all("""
            SELECT
                EXTRACT(
                    HOUR FROM (created_at AT TIME ZONE 'Asia/Jakarta')
                )::int AS bucket,
                SUM(total) AS revenue,
                COUNT(*) AS transactions
            FROM sales
            WHERE created_at >= :start_at
              AND created_at < :end_at
            GROUP BY bucket
            ORDER BY bucket
        """,
            start_at=start_local,
            end_at=end_local
        )

        chart = [
            {
                "label": f"{int(row['bucket']):02d}:00",
                "revenue": float(row["revenue"] or 0),
                "transactions": int(row["transactions"] or 0),
            }
            for row in chart_rows
        ]

    elif period in ("weekly", "monthly"):

        chart_rows = await q_all("""
            SELECT
                DATE(created_at AT TIME ZONE 'Asia/Jakarta') AS bucket,
                SUM(total) AS revenue,
                COUNT(*) AS transactions
            FROM sales
            WHERE created_at >= :start_at
              AND created_at < :end_at
            GROUP BY bucket
            ORDER BY bucket
        """,
            start_at=start_local,
            end_at=end_local
        )

        chart = [
            {
                "label": str(row["bucket"]),
                "revenue": float(row["revenue"] or 0),
                "transactions": int(row["transactions"] or 0),
            }
            for row in chart_rows
        ]

    else:  # yearly

        chart_rows = await q_all("""
            SELECT
                EXTRACT(
                    MONTH FROM (created_at AT TIME ZONE 'Asia/Jakarta')
                )::int AS bucket,
                SUM(total) AS revenue,
                COUNT(*) AS transactions
            FROM sales
            WHERE created_at >= :start_at
              AND created_at < :end_at
            GROUP BY bucket
            ORDER BY bucket
        """,
            start_at=start_local,
            end_at=end_local
        )

        month_names = [
            "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
            "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
        ]

        chart = [
            {
                "label": month_names[int(row["bucket"]) - 1],
                "revenue": float(row["revenue"] or 0),
                "transactions": int(row["transactions"] or 0),
            }
            for row in chart_rows
        ]

    # ---------------------------------------------------------
    # TOP PRODUCTS - SESUAI PERIODE
    # ---------------------------------------------------------
    top = await q_all("""
        SELECT
            elem->>'product_id' AS product_id,
            COALESCE(
                elem->>'name',
                'Produk Tanpa Nama'
            ) AS name,

            COALESCE(
                SUM(
                    COALESCE(
                        (elem->>'quantity')::numeric,
                        0
                    )
                ),
                0
            ) AS quantity,

            COALESCE(
                SUM(
                    COALESCE(
                        (elem->>'price')::numeric,
                        0
                    )
                    *
                    COALESCE(
                        (elem->>'quantity')::numeric,
                        0
                    )
                ),
                0
            ) AS revenue

        FROM sales,
             jsonb_array_elements(items) elem

        WHERE created_at >= :start_at
          AND created_at < :end_at

        GROUP BY
            elem->>'product_id',
            elem->>'name'

        ORDER BY revenue DESC
        LIMIT 5
    """,
        start_at=start_local,
        end_at=end_local
    )

    # ---------------------------------------------------------
    # RESPONSE
    # ---------------------------------------------------------
    return {
        "period": period,

        "period_start": start_local.isoformat(),
        "period_end": end_local.isoformat(),

        "revenue": float(stats["revenue"] or 0),
        "transactions": int(stats["transactions"] or 0),
        "items_sold": int(items_period["items"] or 0),

        "products_count": int(products_count["c"] or 0),
        "customers_count": int(customers_count["c"] or 0),

        "low_stock_count": len(low_stock),
        "low_stock_items": clean_list(low_stock),

        "chart": chart,

        "top_products": [
            {
                "name": item["name"] or "Produk Tanpa Nama",
                "quantity": int(item["quantity"] or 0),
                "revenue": float(item["revenue"] or 0),
            }
            for item in top
        ],
    }


# ============ 1. SALES REPORT ============
@router.get("/reports/sales")
async def report_sales(
    period: Literal["daily", "weekly", "monthly", "yearly", "custom"] = "weekly",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    outlet_id: Optional[str] = None,
    user=Depends(get_current_user)
):
    """Comprehensive sales analytics for managers."""
    start_local, end_local = _period_range(period, date_from, date_to)
    o_filter = _outlet_filter(outlet_id)

    params = {"start_at": start_local, "end_at": end_local}
    if outlet_id:
        params["outlet_id"] = outlet_id

    # ---- SUMMARY ----
    summary = await q_one(f"""
        SELECT
            COALESCE(SUM(total), 0) AS revenue,
            COUNT(*) AS transactions,
            COALESCE(SUM(discount), 0) AS total_discount,
            COALESCE(SUM(tax), 0) AS total_tax,
            COALESCE(
                SUM(
                    COALESCE((elem->>'quantity')::numeric, 0)
                ), 0
            ) AS items_sold
        FROM sales
        LEFT JOIN LATERAL jsonb_array_elements(items) elem ON true
        WHERE created_at >= :start_at
          AND created_at < :end_at
          {o_filter}
    """, **params)

    revenue = float(summary["revenue"] or 0)
    transactions = int(summary["transactions"] or 0)

    # ---- BY PAYMENT METHOD ----
    pay_rows = await q_all(f"""
        SELECT
            payment_method AS method,
            COUNT(*) AS count,
            COALESCE(SUM(total), 0) AS total
        FROM sales
        WHERE created_at >= :start_at
          AND created_at < :end_at
          {o_filter}
        GROUP BY payment_method
        ORDER BY total DESC
    """, **params)

    by_payment_method = [
        {
            "method": row["method"] or "unknown",
            "count": int(row["count"] or 0),
            "total": float(row["total"] or 0),
        }
        for row in pay_rows
    ]

    # ---- BY SOURCE ----
    src_rows = await q_all(f"""
        SELECT
            COALESCE(source, 'pos') AS source,
            COUNT(*) AS count,
            COALESCE(SUM(total), 0) AS total
        FROM sales
        WHERE created_at >= :start_at
          AND created_at < :end_at
          {o_filter}
        GROUP BY source
        ORDER BY total DESC
    """, **params)

    by_source = [
        {
            "source": row["source"],
            "count": int(row["count"] or 0),
            "total": float(row["total"] or 0),
        }
        for row in src_rows
    ]

    # ---- BY CATEGORY ----
    cat_rows = await q_all(f"""
        SELECT
            COALESCE(c.name, 'Tanpa Kategori') AS category_name,
            COALESCE(
                SUM(COALESCE((elem->>'quantity')::numeric, 0)), 0
            ) AS quantity,
            COALESCE(
                SUM(
                    COALESCE((elem->>'price')::numeric, 0)
                    * COALESCE((elem->>'quantity')::numeric, 0)
                ), 0
            ) AS revenue
        FROM sales s
        LEFT JOIN LATERAL jsonb_array_elements(s.items) elem ON true
        LEFT JOIN products p ON (elem->>'product_id') = p.id::text
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE s.created_at >= :start_at
          AND s.created_at < :end_at
          {o_filter.replace('outlet_id', 's.outlet_id')}
        GROUP BY c.name
        ORDER BY revenue DESC
    """, **params)

    by_category = [
        {
            "category_name": row["category_name"],
            "quantity": int(row["quantity"] or 0),
            "revenue": float(row["revenue"] or 0),
        }
        for row in cat_rows
    ]

    # ---- BY PRODUCT ----
    prod_rows = await q_all(f"""
        SELECT
            (elem->>'product_id') AS product_id,
            COALESCE(elem->>'name', 'Produk Tanpa Nama') AS name,
            COALESCE(
                SUM(COALESCE((elem->>'quantity')::numeric, 0)), 0
            ) AS quantity,
            COALESCE(
                SUM(
                    COALESCE((elem->>'price')::numeric, 0)
                    * COALESCE((elem->>'quantity')::numeric, 0)
                ), 0
            ) AS revenue,
            COALESCE(
                SUM(
                    COALESCE(p.cost, 0)
                    * COALESCE((elem->>'quantity')::numeric, 0)
                ), 0
            ) AS cost
        FROM sales s
        LEFT JOIN LATERAL jsonb_array_elements(s.items) elem ON true
        LEFT JOIN products p ON (elem->>'product_id') = p.id::text
        WHERE s.created_at >= :start_at
          AND s.created_at < :end_at
          {o_filter.replace('outlet_id', 's.outlet_id')}
        GROUP BY (elem->>'product_id'), elem->>'name'
        ORDER BY revenue DESC
        LIMIT 50
    """, **params)

    by_product = [
        {
            "product_id": row["product_id"],
            "name": row["name"],
            "quantity": int(row["quantity"] or 0),
            "revenue": float(row["revenue"] or 0),
            "cost": float(row["cost"] or 0),
            "profit": float((row["revenue"] or 0) - (row["cost"] or 0)),
        }
        for row in prod_rows
    ]

    # ---- BY OUTLET ----
    outlet_rows = await q_all(f"""
        SELECT
            s.outlet_id,
            COALESCE(o.name, 'Tanpa Outlet') AS outlet_name,
            COUNT(*) AS count,
            COALESCE(SUM(s.total), 0) AS total
        FROM sales s
        LEFT JOIN outlets o ON s.outlet_id = o.id
        WHERE s.created_at >= :start_at
          AND s.created_at < :end_at
          {o_filter.replace('outlet_id', 's.outlet_id')}
        GROUP BY s.outlet_id, o.name
        ORDER BY total DESC
    """, **params)

    by_outlet = [
        {
            "outlet_id": row["outlet_id"],
            "outlet_name": row["outlet_name"],
            "count": int(row["count"] or 0),
            "total": float(row["total"] or 0),
        }
        for row in outlet_rows
    ]

    # ---- BY CASHIER ----
    cashier_rows = await q_all(f"""
        SELECT
            cashier_id,
            COALESCE(cashier_name, 'Tanpa Kasir') AS cashier_name,
            COUNT(*) AS count,
            COALESCE(SUM(total), 0) AS total
        FROM sales
        WHERE created_at >= :start_at
          AND created_at < :end_at
          {o_filter}
        GROUP BY cashier_id, cashier_name
        ORDER BY total DESC
    """, **params)

    by_cashier = [
        {
            "cashier_id": row["cashier_id"],
            "cashier_name": row["cashier_name"],
            "count": int(row["count"] or 0),
            "total": float(row["total"] or 0),
        }
        for row in cashier_rows
    ]

    # ---- CHART ----
    if period == "daily":
        chart_rows = await q_all(f"""
            SELECT
                EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Asia/Jakarta'))::int AS bucket,
                COALESCE(SUM(total), 0) AS revenue,
                COUNT(*) AS transactions
            FROM sales
            WHERE created_at >= :start_at
              AND created_at < :end_at
              {o_filter}
            GROUP BY bucket
            ORDER BY bucket
        """, **params)
        chart = [
            {
                "label": f"{int(row['bucket']):02d}:00",
                "revenue": float(row["revenue"] or 0),
                "transactions": int(row["transactions"] or 0),
            }
            for row in chart_rows
        ]
    elif period in ("weekly", "monthly", "custom"):
        chart_rows = await q_all(f"""
            SELECT
                DATE(created_at AT TIME ZONE 'Asia/Jakarta') AS bucket,
                COALESCE(SUM(total), 0) AS revenue,
                COUNT(*) AS transactions
            FROM sales
            WHERE created_at >= :start_at
              AND created_at < :end_at
              {o_filter}
            GROUP BY bucket
            ORDER BY bucket
        """, **params)
        chart = [
            {
                "label": str(row["bucket"]),
                "revenue": float(row["revenue"] or 0),
                "transactions": int(row["transactions"] or 0),
            }
            for row in chart_rows
        ]
    else:  # yearly
        chart_rows = await q_all(f"""
            SELECT
                EXTRACT(MONTH FROM (created_at AT TIME ZONE 'Asia/Jakarta'))::int AS bucket,
                COALESCE(SUM(total), 0) AS revenue,
                COUNT(*) AS transactions
            FROM sales
            WHERE created_at >= :start_at
              AND created_at < :end_at
              {o_filter}
            GROUP BY bucket
            ORDER BY bucket
        """, **params)
        month_names = [
            "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
            "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
        ]
        chart = [
            {
                "label": month_names[int(row["bucket"]) - 1],
                "revenue": float(row["revenue"] or 0),
                "transactions": int(row["transactions"] or 0),
            }
            for row in chart_rows
        ]

    # ---- RECENT TRANSACTIONS ----
    recent = await q_all(f"""
        SELECT id, invoice_no, cashier_name, total, payment_method, source, created_at
        FROM sales
        WHERE created_at >= :start_at
          AND created_at < :end_at
          {o_filter}
        ORDER BY created_at DESC
        LIMIT 10
    """, **params)

    recent_transactions = [
        {
            "id": row["id"],
            "invoice_no": row["invoice_no"],
            "cashier_name": row["cashier_name"],
            "total": float(row["total"] or 0),
            "payment_method": row["payment_method"],
            "source": row["source"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        }
        for row in recent
    ]

    return {
        "period": period,
        "period_start": start_local.isoformat(),
        "period_end": end_local.isoformat(),
        "outlet_id": outlet_id,
        "summary": {
            "revenue": revenue,
            "transactions": transactions,
            "avg_transaction": round(revenue / transactions, 2) if transactions else 0.0,
            "total_discount": float(summary["total_discount"] or 0),
            "total_tax": float(summary["total_tax"] or 0),
            "items_sold": int(summary["items_sold"] or 0),
        },
        "by_payment_method": by_payment_method,
        "by_source": by_source,
        "by_category": by_category,
        "by_product": by_product,
        "by_outlet": by_outlet,
        "by_cashier": by_cashier,
        "chart": chart,
        "recent_transactions": recent_transactions,
    }


# ============ 2. PROFIT / LOSS ============
@router.get("/reports/profit-loss")
async def report_profit_loss(
    period: Literal["daily", "weekly", "monthly", "yearly", "custom"] = "weekly",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    outlet_id: Optional[str] = None,
    user=Depends(get_current_user)
):
    """Profit & loss ledger."""
    start_local, end_local = _period_range(period, date_from, date_to)
    o_filter = _outlet_filter(outlet_id)

    params = {"start_at": start_local, "end_at": end_local}
    if outlet_id:
        params["outlet_id"] = outlet_id

    # ---- HEADLINE FIGURES ----
    head = await q_one(f"""
        SELECT
            COALESCE(SUM(s.total), 0) AS revenue,
            COALESCE(SUM(s.discount), 0) AS total_discount,
            COALESCE(SUM(s.tax), 0) AS total_tax,
            COALESCE(
                SUM(
                    COALESCE(p.cost, 0)
                    * COALESCE((elem->>'quantity')::numeric, 0)
                ), 0
            ) AS cogs
        FROM sales s
        LEFT JOIN LATERAL jsonb_array_elements(s.items) elem ON true
        LEFT JOIN products p ON (elem->>'product_id') = p.id::text
        WHERE s.created_at >= :start_at
          AND s.created_at < :end_at
          {o_filter.replace('outlet_id', 's.outlet_id')}
    """, **params)

    revenue = float(head["revenue"] or 0)
    cogs = float(head["cogs"] or 0)
    total_discount = float(head["total_discount"] or 0)
    total_tax = float(head["total_tax"] or 0)
    gross_profit = revenue - cogs
    gross_margin_pct = round((gross_profit / revenue * 100), 2) if revenue else 0.0
    net_profit = gross_profit - total_discount + total_tax

    # ---- BY PRODUCT ----
    prod_rows = await q_all(f"""
        SELECT
            COALESCE(elem->>'name', 'Produk Tanpa Nama') AS name,
            COALESCE(
                SUM(COALESCE((elem->>'quantity')::numeric, 0)), 0
            ) AS quantity,
            COALESCE(
                SUM(
                    COALESCE((elem->>'price')::numeric, 0)
                    * COALESCE((elem->>'quantity')::numeric, 0)
                ), 0
            ) AS revenue,
            COALESCE(
                SUM(
                    COALESCE(p.cost, 0)
                    * COALESCE((elem->>'quantity')::numeric, 0)
                ), 0
            ) AS cost
        FROM sales s
        LEFT JOIN LATERAL jsonb_array_elements(s.items) elem ON true
        LEFT JOIN products p ON (elem->>'product_id') = p.id::text
        WHERE s.created_at >= :start_at
          AND s.created_at < :end_at
          {o_filter.replace('outlet_id', 's.outlet_id')}
        GROUP BY elem->>'name'
        ORDER BY revenue DESC
        LIMIT 100
    """, **params)

    by_product = []
    for row in prod_rows:
        rev = float(row["revenue"] or 0)
        cost = float(row["cost"] or 0)
        profit = rev - cost
        by_product.append({
            "name": row["name"],
            "quantity": int(row["quantity"] or 0),
            "revenue": rev,
            "cost": cost,
            "profit": profit,
            "margin_pct": round((profit / rev * 100), 2) if rev else 0.0,
        })

    # ---- BY CATEGORY ----
    cat_rows = await q_all(f"""
        SELECT
            COALESCE(c.name, 'Tanpa Kategori') AS category_name,
            COALESCE(
                SUM(
                    COALESCE((elem->>'price')::numeric, 0)
                    * COALESCE((elem->>'quantity')::numeric, 0)
                ), 0
            ) AS revenue,
            COALESCE(
                SUM(
                    COALESCE(p.cost, 0)
                    * COALESCE((elem->>'quantity')::numeric, 0)
                ), 0
            ) AS cost
        FROM sales s
        LEFT JOIN LATERAL jsonb_array_elements(s.items) elem ON true
        LEFT JOIN products p ON (elem->>'product_id') = p.id::text
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE s.created_at >= :start_at
          AND s.created_at < :end_at
          {o_filter.replace('outlet_id', 's.outlet_id')}
        GROUP BY c.name
        ORDER BY revenue DESC
    """, **params)

    by_category = []
    for row in cat_rows:
        rev = float(row["revenue"] or 0)
        cost = float(row["cost"] or 0)
        by_category.append({
            "category_name": row["category_name"],
            "revenue": rev,
            "cost": cost,
            "profit": rev - cost,
        })

    # ---- BY DAY ----
    day_rows = await q_all(f"""
        SELECT
            DATE(s.created_at AT TIME ZONE 'Asia/Jakarta') AS date,
            COALESCE(SUM(s.total), 0) AS revenue,
            COALESCE(
                SUM(
                    COALESCE(p.cost, 0)
                    * COALESCE((elem->>'quantity')::numeric, 0)
                ), 0
            ) AS cogs
        FROM sales s
        LEFT JOIN LATERAL jsonb_array_elements(s.items) elem ON true
        LEFT JOIN products p ON (elem->>'product_id') = p.id::text
        WHERE s.created_at >= :start_at
          AND s.created_at < :end_at
          {o_filter.replace('outlet_id', 's.outlet_id')}
        GROUP BY date
        ORDER BY date
    """, **params)

    by_day = [
        {
            "date": str(row["date"]),
            "revenue": float(row["revenue"] or 0),
            "cogs": float(row["cogs"] or 0),
            "profit": float((row["revenue"] or 0) - (row["cogs"] or 0)),
        }
        for row in day_rows
    ]

    return {
        "period": period,
        "period_start": start_local.isoformat(),
        "period_end": end_local.isoformat(),
        "outlet_id": outlet_id,
        "revenue": revenue,
        "cogs": cogs,
        "gross_profit": gross_profit,
        "gross_margin_pct": gross_margin_pct,
        "total_discount": total_discount,
        "total_tax": total_tax,
        "net_profit": net_profit,
        "by_product": by_product,
        "by_category": by_category,
        "by_day": by_day,
    }


# ============ 3. SHIFTS REPORT ============
@router.get("/reports/shifts")
async def report_shifts(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user=Depends(get_current_user)
):
    """Shift reconciliation report (default last 30 days)."""
    now_local = datetime.now(JAKARTA)

    if date_from and date_to:
        start_local = datetime.fromisoformat(date_from).replace(
            tzinfo=JAKARTA, hour=0, minute=0, second=0, microsecond=0
        )
        end_local = datetime.fromisoformat(date_to).replace(
            tzinfo=JAKARTA, hour=23, minute=59, second=59, microsecond=999999
        ) + timedelta(microseconds=1)
    else:
        start_local = (now_local - timedelta(days=30)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        end_local = now_local.replace(
            hour=23, minute=59, second=59, microsecond=999999
        ) + timedelta(microseconds=1)

    params = {"start_at": start_local, "end_at": end_local}

    rows = await q_all("""
        SELECT
            id, cashier_name, status, opened_at, closed_at,
            opening_cash, cash_sales, non_cash_sales,
            expected_cash, actual_cash, difference, transaction_count
        FROM shifts
        WHERE opened_at >= :start_at
          AND opened_at < :end_at
        ORDER BY opened_at DESC
    """, **params)

    shifts = [
        {
            "id": row["id"],
            "cashier_name": row["cashier_name"],
            "status": row["status"],
            "opened_at": row["opened_at"].isoformat() if row["opened_at"] else None,
            "closed_at": row["closed_at"].isoformat() if row["closed_at"] else None,
            "opening_cash": float(row["opening_cash"] or 0),
            "cash_sales": float(row["cash_sales"] or 0),
            "non_cash_sales": float(row["non_cash_sales"] or 0),
            "expected_cash": float(row["expected_cash"] or 0),
            "actual_cash": float(row["actual_cash"] or 0),
            "difference": float(row["difference"] or 0),
            "transaction_count": int(row["transaction_count"] or 0),
        }
        for row in rows
    ]

    summary = {
        "total_cash_sales": sum(s["cash_sales"] for s in shifts),
        "total_non_cash_sales": sum(s["non_cash_sales"] for s in shifts),
        "total_expected": sum(s["expected_cash"] for s in shifts),
        "total_actual": sum(s["actual_cash"] for s in shifts),
        "total_difference": sum(s["difference"] for s in shifts),
        "total_transactions": sum(s["transaction_count"] for s in shifts),
    }

    return {
        "period_start": start_local.isoformat(),
        "period_end": end_local.isoformat(),
        "shifts": shifts,
        "summary": summary,
    }


# ============ 4. STOCK REPORT ============
@router.get("/reports/stock")
async def report_stock(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    outlet_id: Optional[str] = None,
    user=Depends(get_current_user)
):
    """Stock movement report (default last 30 days)."""
    now_local = datetime.now(JAKARTA)

    if date_from and date_to:
        start_local = datetime.fromisoformat(date_from).replace(
            tzinfo=JAKARTA, hour=0, minute=0, second=0, microsecond=0
        )
        end_local = datetime.fromisoformat(date_to).replace(
            tzinfo=JAKARTA, hour=23, minute=59, second=59, microsecond=999999
        ) + timedelta(microseconds=1)
    else:
        start_local = (now_local - timedelta(days=30)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        end_local = now_local.replace(
            hour=23, minute=59, second=59, microsecond=999999
        ) + timedelta(microseconds=1)

    o_filter = _outlet_filter(outlet_id)
    params = {"start_at": start_local, "end_at": end_local}
    if outlet_id:
        params["outlet_id"] = outlet_id

    # ---- MOVEMENTS (paginated, limit 500) ----
    movements = await q_all(f"""
        SELECT id, product_name, delta, reason, note, created_at, outlet_id
        FROM stock_movements
        WHERE created_at >= :start_at
          AND created_at < :end_at
          {o_filter}
        ORDER BY created_at DESC
        LIMIT 500
    """, **params)

    movements_list = [
        {
            "id": row["id"],
            "product_name": row["product_name"],
            "delta": int(row["delta"] or 0),
            "reason": row["reason"],
            "note": row["note"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "outlet_id": row["outlet_id"],
        }
        for row in movements
    ]

    # ---- SUMMARY ----
    summ = await q_one(f"""
        SELECT
            COALESCE(SUM(delta) FILTER (WHERE delta > 0), 0) AS total_in,
            COALESCE(SUM(delta) FILTER (WHERE delta < 0), 0) AS total_out
        FROM stock_movements
        WHERE created_at >= :start_at
          AND created_at < :end_at
          {o_filter}
    """, **params)

    reason_rows = await q_all(f"""
        SELECT
            reason,
            COUNT(*) AS count,
            COALESCE(SUM(delta), 0) AS total_delta
        FROM stock_movements
        WHERE created_at >= :start_at
          AND created_at < :end_at
          {o_filter}
        GROUP BY reason
        ORDER BY count DESC
    """, **params)

    by_reason = [
        {
            "reason": row["reason"],
            "count": int(row["count"] or 0),
            "total_delta": int(row["total_delta"] or 0),
        }
        for row in reason_rows
    ]

    summary = {
        "total_in": int(summ["total_in"] or 0),
        "total_out": int(summ["total_out"] or 0),
        "by_reason": by_reason,
    }

    # ---- BY PRODUCT ----
    prod_rows = await q_all(f"""
        SELECT
            product_name,
            COALESCE(SUM(delta) FILTER (WHERE delta > 0), 0) AS total_in,
            COALESCE(SUM(delta) FILTER (WHERE delta < 0), 0) AS total_out,
            COALESCE(SUM(delta), 0) AS net
        FROM stock_movements
        WHERE created_at >= :start_at
          AND created_at < :end_at
          {o_filter}
        GROUP BY product_name
        ORDER BY product_name
    """, **params)

    by_product = [
        {
            "product_name": row["product_name"],
            "total_in": int(row["total_in"] or 0),
            "total_out": int(row["total_out"] or 0),
            "net": int(row["net"] or 0),
        }
        for row in prod_rows
    ]

    # ---- LOW STOCK ----
    low_stock = await q_all("""
        SELECT id, name, sku, stock, low_stock_threshold, unit
        FROM products
        WHERE stock <= low_stock_threshold
          AND is_active = true
        ORDER BY stock ASC
    """)

    low_stock_list = [
        {
            "id": row["id"],
            "name": row["name"],
            "sku": row["sku"],
            "stock": int(row["stock"] or 0),
            "low_stock_threshold": int(row["low_stock_threshold"] or 0),
            "unit": row["unit"],
        }
        for row in low_stock
    ]

    return {
        "period_start": start_local.isoformat(),
        "period_end": end_local.isoformat(),
        "outlet_id": outlet_id,
        "movements": movements_list,
        "summary": summary,
        "by_product": by_product,
        "low_stock": low_stock_list,
    }


# ============ 5. PAYMENT RECONCILIATION ============
@router.get("/reports/payment-reconciliation")
async def report_payment_reconciliation(
    period: Literal["daily", "weekly", "monthly", "yearly", "custom"] = "weekly",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    outlet_id: Optional[str] = None,
    user=Depends(get_current_user)
):
    """Payment reconciliation report."""
    start_local, end_local = _period_range(period, date_from, date_to)
    o_filter = _outlet_filter(outlet_id)

    params = {"start_at": start_local, "end_at": end_local}
    if outlet_id:
        params["outlet_id"] = outlet_id

    # ---- BY METHOD ----
    method_rows = await q_all(f"""
        SELECT
            payment_method AS method,
            COUNT(*) AS count,
            COALESCE(SUM(total), 0) AS total,
            COUNT(*) FILTER (WHERE transfer_verified = true) AS verified_count,
            COUNT(*) FILTER (WHERE transfer_verified = false) AS unverified_count
        FROM sales
        WHERE created_at >= :start_at
          AND created_at < :end_at
          {o_filter}
        GROUP BY payment_method
        ORDER BY total DESC
    """, **params)

    by_method = [
        {
            "method": row["method"] or "unknown",
            "count": int(row["count"] or 0),
            "total": float(row["total"] or 0),
            "verified_count": int(row["verified_count"] or 0),
            "unverified_count": int(row["unverified_count"] or 0),
        }
        for row in method_rows
    ]

    # ---- CASH DETAIL ----
    cash = await q_one(f"""
        SELECT
            COALESCE(SUM(total) FILTER (WHERE payment_method = 'cash'), 0) AS total_cash_sales,
            COALESCE(SUM(change_amount) FILTER (WHERE payment_method = 'cash'), 0) AS total_change_given
        FROM sales
        WHERE created_at >= :start_at
          AND created_at < :end_at
          {o_filter}
    """, **params)

    cash_detail = {
        "total_cash_sales": float(cash["total_cash_sales"] or 0),
        "total_change_given": float(cash["total_change_given"] or 0),
        "net_cash": float((cash["total_cash_sales"] or 0) - (cash["total_change_given"] or 0)),
    }

    # ---- CARD DETAIL ----
    card_rows = await q_all(f"""
        SELECT
            COALESCE(card_brand, 'Unknown') AS card_brand,
            COUNT(*) AS count,
            COALESCE(SUM(total), 0) AS total
        FROM sales
        WHERE payment_method = 'card'
          AND created_at >= :start_at
          AND created_at < :end_at
          {o_filter}
        GROUP BY card_brand
        ORDER BY total DESC
    """, **params)

    card_detail = [
        {
            "card_brand": row["card_brand"],
            "count": int(row["count"] or 0),
            "total": float(row["total"] or 0),
        }
        for row in card_rows
    ]

    # ---- TRANSFER DETAIL ----
    transfer_rows = await q_all(f"""
        SELECT
            COALESCE(transfer_bank, 'Unknown') AS transfer_bank,
            COUNT(*) AS count,
            COALESCE(SUM(total), 0) AS total,
            COUNT(*) FILTER (WHERE transfer_verified = true) AS verified,
            COUNT(*) FILTER (WHERE transfer_verified = false) AS unverified
        FROM sales
        WHERE payment_method = 'transfer'
          AND created_at >= :start_at
          AND created_at < :end_at
          {o_filter}
        GROUP BY transfer_bank
        ORDER BY total DESC
    """, **params)

    transfer_detail = [
        {
            "transfer_bank": row["transfer_bank"],
            "count": int(row["count"] or 0),
            "total": float(row["total"] or 0),
            "verified": int(row["verified"] or 0),
            "unverified": int(row["unverified"] or 0),
        }
        for row in transfer_rows
    ]

    # ---- QRIS DETAIL ----
    qris = await q_one(f"""
        SELECT
            COUNT(*) AS count,
            COALESCE(SUM(total), 0) AS total
        FROM sales
        WHERE payment_method = 'qris'
          AND created_at >= :start_at
          AND created_at < :end_at
          {o_filter}
    """, **params)

    qris_detail = {
        "count": int(qris["count"] or 0),
        "total": float(qris["total"] or 0),
    }

    # ---- BY DAY ----
    day_rows = await q_all(f"""
        SELECT
            DATE(created_at AT TIME ZONE 'Asia/Jakarta') AS date,
            COALESCE(SUM(total) FILTER (WHERE payment_method = 'cash'), 0) AS cash,
            COALESCE(SUM(total) FILTER (WHERE payment_method = 'card'), 0) AS card,
            COALESCE(SUM(total) FILTER (WHERE payment_method = 'qris'), 0) AS qris,
            COALESCE(SUM(total) FILTER (WHERE payment_method = 'transfer'), 0) AS transfer
        FROM sales
        WHERE created_at >= :start_at
          AND created_at < :end_at
          {o_filter}
        GROUP BY date
        ORDER BY date
    """, **params)

    by_day = [
        {
            "date": str(row["date"]),
            "cash": float(row["cash"] or 0),
            "card": float(row["card"] or 0),
            "qris": float(row["qris"] or 0),
            "transfer": float(row["transfer"] or 0),
        }
        for row in day_rows
    ]

    return {
        "period": period,
        "period_start": start_local.isoformat(),
        "period_end": end_local.isoformat(),
        "outlet_id": outlet_id,
        "by_method": by_method,
        "cash_detail": cash_detail,
        "card_detail": card_detail,
        "transfer_detail": transfer_detail,
        "qris_detail": qris_detail,
        "by_day": by_day,
    }
