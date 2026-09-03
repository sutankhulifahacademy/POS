import json
import uuid
from typing import Optional
from routes.deps import *
from routes.inventory import _get_main_outlet_id, _adjust_outlet_stock

router = APIRouter()

# ============ PURCHASE ORDERS ============
@router.get("/purchase-orders")
async def list_pos(user=Depends(get_current_user), outlet_id: Optional[str] = None):
    if outlet_id:
        if user["role"] != "owner" and outlet_id not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")
        rows = await q_all("""
            SELECT po.*, o.name AS outlet_name
            FROM purchase_orders po
            LEFT JOIN outlets o ON o.id = po.outlet_id
            WHERE po.outlet_id = :oid
            ORDER BY po.created_at DESC LIMIT 500
        """, oid=outlet_id)
    elif user["role"] != "owner":
        user_outlets = user.get("outlet_ids", [])
        if user_outlets:
            ids_sql = ",".join(f"'{oid}'" for oid in user_outlets)
            rows = await q_all(f"""
                SELECT po.*, o.name AS outlet_name
                FROM purchase_orders po
                LEFT JOIN outlets o ON o.id = po.outlet_id
                WHERE po.outlet_id IN ({ids_sql})
                ORDER BY po.created_at DESC LIMIT 500
            """)
        else:
            rows = []
    else:
        rows = await q_all("""
            SELECT po.*, o.name AS outlet_name
            FROM purchase_orders po
            LEFT JOIN outlets o ON o.id = po.outlet_id
            ORDER BY po.created_at DESC LIMIT 500
        """)
    return clean_list(rows)

@router.post("/purchase-orders")
async def create_po(body: POIn, user=Depends(require_permission("purchase_orders", "create"))):
    total = sum(i.quantity * i.cost for i in body.items)
    po_no = f"PO-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:4].upper()}"
    pid = new_id()
    items_json = json.dumps([i.model_dump() for i in body.items])
    # Determine outlet_id
    outlet_id = body.outlet_id
    if not outlet_id:
        user_outlets = user.get("outlet_ids", [])
        if user_outlets:
            outlet_id = user_outlets[0]
    # Validate outlet access before creating PO
    validate_outlet_access(user, outlet_id)
    await q_exec("""INSERT INTO purchase_orders (id, po_no, supplier_id, supplier_name, items, total, status, note, created_by, outlet_id, created_at)
                    VALUES (:id, :po, :sid, :sn, CAST(:it AS jsonb), :t, 'draft', :note, :u, :oid, NOW())""",
                 id=pid, po=po_no, sid=_u(body.supplier_id), sn=body.supplier_name,
                 it=items_json, t=total, note=body.note or "", u=user["id"], oid=_u(outlet_id))
    return clean(await q_one("SELECT * FROM purchase_orders WHERE id=:id", id=pid))

@router.post("/purchase-orders/{po_id}/receive")
async def receive_po(po_id: str, user=Depends(require_permission("purchase_orders", "approve"))):
    po = await q_one("SELECT * FROM purchase_orders WHERE id=:id", id=po_id)
    if not po: raise HTTPException(404, "PO not found")
    if po["status"] != "draft": raise HTTPException(400, f"PO status is {po['status']}")
    # Outlet authorization: non-owner must have access to PO's outlet
    if user["role"] != "owner" and po.get("outlet_id"):
        if str(po["outlet_id"]) not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet PO ini")
    # Use PO's outlet_id, or fall back to main outlet
    outlet_id = str(po["outlet_id"]) if po.get("outlet_id") else None
    if not outlet_id:
        outlet_id = await _get_main_outlet_id()
    items = po["items"] if isinstance(po["items"], list) else json.loads(po["items"])

    # =========================================================
    # ATOMIC TRANSACTION
    # =========================================================
    # All stock increments, movements, and PO status update must
    # commit together. Previously each q_exec auto-committed
    # separately, so a partial failure could leave stock
    # incremented while PO remained 'draft' (allowing a second
    # receive to double-increment stock).
    # =========================================================
    from database import transaction, execute as _tx_execute, session_one
    async with transaction() as session:
        # Atomic status transition: only succeed if still 'draft'.
        # This prevents double-receive race conditions at the DB level.
        claim = await _tx_execute(
            session,
            "UPDATE purchase_orders SET status='receiving' WHERE id=:id AND status='draft'",
            id=po_id,
        )
        if claim.rowcount == 0:
            raise HTTPException(400, "PO tidak dapat diterima — status sudah berubah (kemungkinan sedang diproses)")

        for it in items:
            await _tx_execute(
                session,
                "UPDATE products SET stock=stock+:q, updated_at=NOW() WHERE id=:id",
                q=it["quantity"], id=it["product_id"]
            )
            if outlet_id:
                # Inline atomic outlet stock upsert to avoid the
                # non-atomic _adjust_outlet_stock helper inside tx.
                await _tx_execute(
                    session,
                    """
                    INSERT INTO outlet_stocks (product_id, outlet_id, quantity, updated_at)
                    VALUES (:p, :o, :q, NOW())
                    ON CONFLICT (product_id, outlet_id)
                    DO UPDATE SET quantity = outlet_stocks.quantity + EXCLUDED.quantity,
                                  updated_at = NOW()
                    """,
                    p=it["product_id"], o=outlet_id, q=it["quantity"],
                )
            await _tx_execute(
                session,
                """INSERT INTO stock_movements (id, product_id, product_name, delta, reason, note, outlet_id, user_id, created_at)
                   VALUES (:id, :pid, :pn, :d, 'purchase', :note, :oid, :u, NOW())""",
                id=new_id(), pid=it["product_id"],
                pn=it.get("name") or it.get("product_name") or "",
                d=it["quantity"], note=f"PO {po['po_no']}",
                oid=_u(outlet_id), u=user["id"],
            )
        # Final status: 'received' — only after all stock updates succeed.
        await _tx_execute(
            session,
            "UPDATE purchase_orders SET status='received', received_at=NOW() WHERE id=:id",
            id=po_id,
        )
    return {"ok": True, "po_id": po_id}

@router.delete("/purchase-orders/{po_id}")
async def delete_po(po_id: str, user=Depends(require_permission("purchase_orders", "delete"))):
    outlet_filter = await filter_outlets_for_user(user)
    r = await q_exec(f"DELETE FROM purchase_orders WHERE id=:id AND status='draft' {outlet_filter}", id=po_id)
    if r == 0: raise HTTPException(400, "Cannot delete: not draft or not found")
    return {"ok": True}

@router.post("/purchase-orders/{po_id}/reject")
async def reject_po(po_id: str, user=Depends(require_permission("purchase_orders", "approve"))):
    po = await q_one("SELECT status, outlet_id FROM purchase_orders WHERE id=:id", id=po_id)
    if not po:
        raise HTTPException(404, "PO not found")
    if po["status"] != "draft":
        raise HTTPException(400, f"PO status is {po['status']}, only draft can be rejected")
    # Outlet authorization
    if user["role"] != "owner" and po.get("outlet_id"):
        if str(po["outlet_id"]) not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet PO ini")
    outlet_filter = await filter_outlets_for_user(user)
    # Atomic conditional update — prevents race with receive_po
    r = await q_exec(
        f"UPDATE purchase_orders SET status='cancelled' WHERE id=:id AND status='draft' {outlet_filter}",
        id=po_id,
    )
    if r == 0:
        raise HTTPException(404, "PO not found or status sudah berubah")
    return {"ok": True}
