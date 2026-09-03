"""Inventory routes — stock adjustments and movements."""
from typing import Optional
from routes.deps import *
from services.inventory_service import _get_main_outlet_id, _adjust_outlet_stock, _adjust_outlet_stock_tx
from sqlalchemy import text

router = APIRouter()


@router.post("/inventory/adjust")
async def adjust_stock(body: StockAdjustIn, user=Depends(require_permission("inventory", "update"))):
    """Manual stock adjustment.

    Updates BOTH products.stock (global) and outlet_stocks.quantity
    (per-outlet) when outlet_id is provided. The entire operation is
    wrapped in a single database transaction for atomicity — if any
    step fails, all changes roll back.
    """
    p = await q_one("SELECT * FROM products WHERE id=:id", id=body.product_id)
    if not p: raise HTTPException(404, "Product not found")

    # Determine target outlet (defaults to main outlet for backward compat)
    outlet_id = getattr(body, "outlet_id", None)
    if not outlet_id:
        outlet_id = await _get_main_outlet_id()

    # Validate outlet access before any write
    validate_outlet_access(user, outlet_id)

    # Atomic transaction: update global stock, outlet stock, and record movement
    async with transaction() as session:
        # Global stock update with non-negative guard
        if body.delta < 0:
            result = await session.execute(
                text("UPDATE products SET stock=stock+:d, updated_at=NOW() WHERE id=:id AND stock+:d >= 0"),
                {"d": body.delta, "id": body.product_id},
            )
            if result.rowcount == 0:
                raise HTTPException(400, "Stok global tidak cukup untuk adjustment ini")
        else:
            await session.execute(
                text("UPDATE products SET stock=stock+:d, updated_at=NOW() WHERE id=:id"),
                {"d": body.delta, "id": body.product_id},
            )

        # Outlet stock update (transaction-aware)
        if outlet_id:
            affected = await _adjust_outlet_stock_tx(session, body.product_id, str(outlet_id), body.delta)
            if body.delta < 0 and affected == 0:
                raise HTTPException(400, "Stok outlet tidak cukup atau belum diinisialisasi")

        # Record movement
        await session.execute(
            text("""INSERT INTO stock_movements (id, product_id, product_name, delta, reason, note, outlet_id, user_id, created_at)
                    VALUES (:id, :pid, :pn, :d, :r, :note, :oid, :u, NOW())"""),
            {"id": new_id(), "pid": body.product_id, "pn": p["name"], "d": body.delta,
             "r": body.reason, "note": body.note or "", "oid": _u(outlet_id), "u": user["id"]},
        )

    # Re-read to return the actual current stock
    updated = await q_one("SELECT stock FROM products WHERE id=:id", id=body.product_id)
    return {"product_id": body.product_id, "new_stock": int(updated["stock"]) if updated else 0}

@router.get("/inventory/movements")
async def list_movements(
    user=Depends(get_current_user),
    limit: int = 200,
    outlet_id: Optional[str] = None,
):
    # Build outlet filter
    if outlet_id:
        if user["role"] != "owner" and outlet_id not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")
        o_clause = " AND outlet_id = :outlet_id "
        params = {"l": limit, "outlet_id": outlet_id}
    elif user["role"] != "owner":
        user_outlets = user.get("outlet_ids", [])
        if user_outlets:
            ids_sql = ",".join(f"'{oid}'" for oid in user_outlets)
            o_clause = f" AND outlet_id IN ({ids_sql}) "
            params = {"l": limit}
        else:
            return []
    else:
        o_clause = ""
        params = {"l": limit}

    rows = await q_all(f"""
        SELECT sm.*, o.name AS outlet_name
        FROM stock_movements sm
        LEFT JOIN outlets o ON o.id = sm.outlet_id
        WHERE 1=1 {o_clause}
        ORDER BY sm.created_at DESC LIMIT :l
    """, **params)
    return clean_list(rows)

@router.get("/inventory/stock")
async def list_outlet_stock(
    user=Depends(get_current_user),
    outlet_id: Optional[str] = None,
):
    """Get current stock levels per outlet."""
    if outlet_id:
        if user["role"] != "owner" and outlet_id not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")
        rows = await q_all("""
            SELECT p.id, p.name, p.sku, p.unit, p.low_stock_threshold,
                   os.quantity, o.name AS outlet_name
            FROM products p
            JOIN outlet_stocks os ON os.product_id = p.id
            JOIN outlets o ON o.id = os.outlet_id
            WHERE os.outlet_id = :oid
            ORDER BY p.name
        """, oid=outlet_id)
    elif user["role"] != "owner":
        user_outlets = user.get("outlet_ids", [])
        if not user_outlets:
            return []
        ids_sql = ",".join(f"'{oid}'" for oid in user_outlets)
        rows = await q_all(f"""
            SELECT p.id, p.name, p.sku, p.unit, p.low_stock_threshold,
                   os.quantity, o.name AS outlet_name
            FROM products p
            JOIN outlet_stocks os ON os.product_id = p.id
            JOIN outlets o ON o.id = os.outlet_id
            WHERE os.outlet_id IN ({ids_sql})
            ORDER BY o.name, p.name
        """)
    else:
        rows = await q_all("""
            SELECT p.id, p.name, p.sku, p.unit, p.low_stock_threshold,
                   os.quantity, o.name AS outlet_name
            FROM products p
            JOIN outlet_stocks os ON os.product_id = p.id
            JOIN outlets o ON o.id = os.outlet_id
            ORDER BY o.name, p.name
        """)
    return clean_list(rows)
