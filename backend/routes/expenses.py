"""Expenses routes — operational expense tracking per outlet."""
from routes.deps import *
from routes.auth import require_permission
from routes.audit_logs import log_action
from datetime import date, datetime

router = APIRouter()

CATEGORIES = ["rent", "utilities", "salary", "supplies", "maintenance", "marketing", "other"]


@router.get("/expenses")
async def list_expenses(
    limit: int = 100,
    outlet_id: Optional[str] = None,
    category: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user=Depends(require_permission("expenses", "view")),
):
    """List expenses with filtering."""
    where = ["1=1"]
    params = {"limit": limit}

    if outlet_id:
        if user["role"] != "owner" and outlet_id not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")
        where.append("e.outlet_id = :outlet_id")
        params["outlet_id"] = outlet_id
    elif user["role"] != "owner":
        user_outlets = user.get("outlet_ids", [])
        if user_outlets:
            ids_sql = ",".join(f"'{oid}'" for oid in user_outlets)
            where.append(f"e.outlet_id IN ({ids_sql})")
        else:
            return []

    if category:
        where.append("e.category = :category")
        params["category"] = category
    if date_from:
        where.append("e.expense_date >= :date_from")
        params["date_from"] = date_from
    if date_to:
        where.append("e.expense_date <= :date_to")
        params["date_to"] = date_to

    where_clause = " AND ".join(where)

    rows = await q_all(f"""
        SELECT e.*, o.name AS outlet_name, u.name AS created_by_name
        FROM expenses e
        LEFT JOIN outlets o ON o.id = e.outlet_id
        LEFT JOIN users u ON u.id = e.created_by
        WHERE {where_clause}
        ORDER BY e.expense_date DESC, e.created_at DESC
        LIMIT :limit
    """, **params)

    return clean_list(rows)


@router.get("/expenses/summary")
async def expenses_summary(
    outlet_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user=Depends(require_permission("expenses", "view")),
):
    """Get expense summary by category."""
    where = ["1=1"]
    params = {}

    if outlet_id:
        if user["role"] != "owner" and outlet_id not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")
        where.append("outlet_id = :outlet_id")
        params["outlet_id"] = outlet_id
    elif user["role"] != "owner":
        user_outlets = user.get("outlet_ids", [])
        if user_outlets:
            ids_sql = ",".join(f"'{oid}'" for oid in user_outlets)
            where.append(f"outlet_id IN ({ids_sql})")
        else:
            return {"by_category": [], "total": 0, "by_outlet": []}

    if date_from:
        where.append("expense_date >= :date_from")
        params["date_from"] = date_from
    if date_to:
        where.append("expense_date <= :date_to")
        params["date_to"] = date_to

    where_clause = " AND ".join(where)

    by_category = await q_all(f"""
        SELECT category, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
        FROM expenses WHERE {where_clause}
        GROUP BY category ORDER BY total DESC
    """, **params)

    total = await q_one(f"""
        SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
        FROM expenses WHERE {where_clause}
    """, **params)

    by_outlet = []
    if user["role"] == "owner":
        by_outlet = await q_all(f"""
            SELECT o.name AS outlet_name, COALESCE(SUM(e.amount), 0) AS total, COUNT(e.id) AS count
            FROM outlets o
            LEFT JOIN expenses e ON e.outlet_id = o.id
            {'AND ' + where_clause.replace('1=1', '1=1') if '1=1' in where_clause else ''}
            GROUP BY o.name ORDER BY total DESC
        """, **params)

    return {
        "by_category": [
            {"category": r["category"], "total": float(r["total"] or 0), "count": int(r["count"])}
            for r in by_category
        ],
        "total": float(total["total"] or 0),
        "count": int(total["count"] or 0),
        "by_outlet": [
            {"outlet_name": r["outlet_name"], "total": float(r["total"] or 0), "count": int(r["count"])}
            for r in by_outlet
        ],
    }


@router.post("/expenses")
async def create_expense(
    body: dict,
    user=Depends(require_permission("expenses", "create")),
):
    """Create a new expense."""
    outlet_id = body.get("outlet_id")
    if not outlet_id:
        raise HTTPException(400, "outlet_id is required")

    if user["role"] != "owner" and outlet_id not in user.get("outlet_ids", []):
        raise HTTPException(403, "Tidak ada akses ke outlet ini")

    category = body.get("category", "other")
    if category not in CATEGORIES:
        raise HTTPException(400, f"Invalid category. Must be one of: {', '.join(CATEGORIES)}")

    eid = new_id()
    # Parse expense_date
    edate = body.get("expense_date")
    if isinstance(edate, str):
        edate = datetime.strptime(edate, "%Y-%m-%d").date()
    elif edate is None:
        edate = date.today()

    await q_exec("""
        INSERT INTO expenses (id, outlet_id, category, description, amount, expense_date,
                              payment_method, vendor, receipt_no, created_by)
        VALUES (:id, :oid, :cat, :desc, :amount, :edate, :pm, :vendor, :rno, :uid)
    """,
        id=eid, oid=outlet_id, cat=category,
        desc=body.get("description", ""),
        amount=body.get("amount", 0),
        edate=edate,
        pm=body.get("payment_method", "cash"),
        vendor=body.get("vendor", ""),
        rno=body.get("receipt_no", ""),
        uid=user["id"],
    )

    # Audit log
    await log_action(user, "create", "expense", entity_id=str(eid), outlet_id=outlet_id,
                     new_value=body)

    # Create alert for large expenses
    amount = float(body.get("amount", 0))
    if amount >= 1000000:
        from routes.alerts import create_alert
        await create_alert(
            category="expense",
            severity="warning",
            title=f"Pengeluaran besar: {amount:,.0f}",
            message=f"Expense {category}: {body.get('description', '')[:100]}",
            outlet_id=outlet_id,
            data={"expense_id": str(eid), "amount": amount},
        )

    row = await q_one("""
        SELECT e.*, o.name AS outlet_name
        FROM expenses e LEFT JOIN outlets o ON o.id = e.outlet_id
        WHERE e.id = :id
    """, id=eid)
    return clean(row)


@router.put("/expenses/{expense_id}")
async def update_expense(
    expense_id: str,
    body: dict,
    user=Depends(require_permission("expenses", "update")),
):
    """Update an expense."""
    existing = await q_one("SELECT * FROM expenses WHERE id = :id", id=expense_id)
    if not existing:
        raise HTTPException(404, "Expense not found")

    if user["role"] != "owner" and str(existing["outlet_id"]) not in user.get("outlet_ids", []):
        raise HTTPException(403, "Tidak ada akses ke outlet ini")

    updates = {k: v for k, v in body.items() if v is not None and k in [
        "category", "description", "amount", "expense_date", "payment_method", "vendor", "receipt_no"
    ]}
    if not updates:
        raise HTTPException(400, "No updates")

    sets = ", ".join(f"{k}=:{k}" for k in updates.keys())
    updates["id"] = expense_id
    await q_exec(f"UPDATE expenses SET {sets}, updated_at=NOW() WHERE id=:id", **updates)

    await log_action(user, "update", "expense", entity_id=expense_id,
                     outlet_id=str(existing["outlet_id"]),
                     old_value=clean(existing), new_value=body)

    row = await q_one("SELECT * FROM expenses WHERE id = :id", id=expense_id)
    return clean(row)


@router.delete("/expenses/{expense_id}")
async def delete_expense(
    expense_id: str,
    user=Depends(require_permission("expenses", "delete")),
):
    """Delete an expense."""
    existing = await q_one("SELECT * FROM expenses WHERE id = :id", id=expense_id)
    if not existing:
        raise HTTPException(404, "Expense not found")

    if user["role"] != "owner" and str(existing["outlet_id"]) not in user.get("outlet_ids", []):
        raise HTTPException(403, "Tidak ada akses ke outlet ini")

    await q_exec("DELETE FROM expenses WHERE id = :id", id=expense_id)
    await log_action(user, "delete", "expense", entity_id=expense_id,
                     outlet_id=str(existing["outlet_id"]),
                     old_value=clean(existing))
    return {"ok": True}
