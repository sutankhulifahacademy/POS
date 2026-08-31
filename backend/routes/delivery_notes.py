"""Delivery Notes (Surat Jalan) routes — printable document, print log, ship."""
from typing import Optional
from routes.deps import *
from routes.audit_logs import log_action
from routes.alerts import create_alert

router = APIRouter()


@router.get("/delivery-notes")
async def list_delivery_notes(
    user=Depends(get_current_user),
    outlet_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 200,
):
    """List delivery notes."""
    filters = []
    params = {"l": limit}

    if outlet_id:
        if user["role"] != "owner" and outlet_id not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")
        filters.append("(t.from_outlet_id = :oid OR t.to_outlet_id = :oid)")
        params["oid"] = outlet_id
    elif user["role"] != "owner":
        user_outlets = user.get("outlet_ids", [])
        if user_outlets:
            ids_sql = ",".join(f"'{oid}'" for oid in user_outlets)
            filters.append(f"(t.from_outlet_id IN ({ids_sql}) OR t.to_outlet_id IN ({ids_sql}))")
        else:
            return []

    if status:
        filters.append("dn.status = :st")
        params["st"] = status

    where = " WHERE " + " AND ".join(filters) if filters else ""
    rows = await q_all(f"""
        SELECT dn.*, t.transfer_no, t.from_outlet_name, t.to_outlet_name,
               t.from_outlet_id, t.to_outlet_id, t.status AS transfer_status,
               t.total_quantity, t.created_at AS transfer_created_at,
               sr.request_no
        FROM delivery_notes dn
        JOIN stock_transfers t ON t.id = dn.transfer_id
        LEFT JOIN stock_requests sr ON sr.id = dn.request_id
        {where}
        ORDER BY dn.generated_at DESC LIMIT :l
    """, **params)
    return clean_list(rows)


@router.get("/delivery-notes/{dn_id}")
async def get_delivery_note(dn_id: str, user=Depends(get_current_user)):
    """Get delivery note detail with items (for print preview)."""
    dn = await q_one("""
        SELECT dn.*, t.transfer_no, t.from_outlet_id, t.to_outlet_id,
               t.from_outlet_name, t.to_outlet_name, t.note AS transfer_note,
               t.total_quantity, t.created_at AS transfer_created_at,
               t.created_by_name AS transfer_created_by_name,
               sr.request_no, sr.requesting_outlet_name
        FROM delivery_notes dn
        JOIN stock_transfers t ON t.id = dn.transfer_id
        LEFT JOIN stock_requests sr ON sr.id = dn.request_id
        WHERE dn.id = :id
    """, id=dn_id)
    if not dn:
        raise HTTPException(404, "Surat Jalan tidak ditemukan")

    # Outlet authorization
    if user["role"] != "owner":
        user_outlets = set(user.get("outlet_ids", []))
        if str(dn["from_outlet_id"]) not in user_outlets and str(dn["to_outlet_id"]) not in user_outlets:
            raise HTTPException(403, "Tidak ada akses ke Surat Jalan ini")

    # Get transfer items
    items = await q_all("""
        SELECT ti.product_name, ti.qty_sent, p.sku, p.unit
        FROM transfer_items ti
        LEFT JOIN products p ON p.id = ti.product_id
        WHERE ti.transfer_id = :tid
        ORDER BY ti.created_at
    """, tid=dn["transfer_id"])

    # Get business info for header
    biz = await q_one("SELECT name, address, logo_url FROM business LIMIT 1")

    result = clean(dn)
    result["items"] = clean_list(items)
    result["business"] = clean(biz) if biz else None
    return result


@router.get("/delivery-notes/by-transfer/{transfer_id}")
async def get_delivery_note_by_transfer(transfer_id: str, user=Depends(get_current_user)):
    """Get delivery note by transfer ID."""
    dn = await q_one("SELECT id FROM delivery_notes WHERE transfer_id = :tid", tid=transfer_id)
    if not dn:
        raise HTTPException(404, "Surat Jalan tidak ditemukan untuk transfer ini")
    return await get_delivery_note(str(dn["id"]), user)


@router.post("/delivery-notes/{dn_id}/print")
async def print_delivery_note(dn_id: str, user=Depends(get_current_user)):
    """Log print action. Does NOT create new transaction or modify stock."""
    dn = await q_one("""
        SELECT dn.*, t.from_outlet_id, t.to_outlet_id, t.transfer_no
        FROM delivery_notes dn
        JOIN stock_transfers t ON t.id = dn.transfer_id
        WHERE dn.id = :id
    """, id=dn_id)
    if not dn:
        raise HTTPException(404, "Surat Jalan tidak ditemukan")

    # Outlet authorization
    if user["role"] != "owner":
        user_outlets = set(user.get("outlet_ids", []))
        if str(dn["from_outlet_id"]) not in user_outlets and str(dn["to_outlet_id"]) not in user_outlets:
            raise HTTPException(403, "Tidak ada akses")

    is_reprint = dn["print_count"] > 0
    new_count = (dn["print_count"] or 0) + 1

    await q_exec("""UPDATE delivery_notes SET printed_by = :pb, printed_by_name = :pbn, printed_at = NOW(),
                    print_count = :pc, status = CASE WHEN status = 'generated' THEN 'printed' ELSE status END
                    WHERE id = :id""",
                 pb=user["id"], pbn=user.get("name", ""), pc=new_count, id=dn_id)

    action = "DELIVERY_NOTE_REPRINTED" if is_reprint else "DELIVERY_NOTE_PRINTED"
    await log_action(user, action, "delivery_note", entity_id=dn_id,
                     outlet_id=dn["from_outlet_id"],
                     new_value={"delivery_no": dn["delivery_no"], "transfer_no": dn["transfer_no"],
                                "print_count": new_count, "print_type": "REPRINT" if is_reprint else "ORIGINAL"})

    return {"ok": True, "print_count": new_count, "is_reprint": is_reprint}


@router.post("/delivery-notes/{dn_id}/ship")
async def ship_delivery_note(dn_id: str, user=Depends(require_role("owner", "manager", "admin", "supervisor"))):
    """Mark delivery as shipped. Updates transfer status to 'shipped'."""
    dn = await q_one("""
        SELECT dn.*, t.from_outlet_id, t.to_outlet_id, t.transfer_no, t.id AS transfer_id
        FROM delivery_notes dn
        JOIN stock_transfers t ON t.id = dn.transfer_id
        WHERE dn.id = :id
    """, id=dn_id)
    if not dn:
        raise HTTPException(404, "Surat Jalan tidak ditemukan")

    # Outlet authorization: source outlet staff can ship
    if user["role"] != "owner" and str(dn["from_outlet_id"]) not in user.get("outlet_ids", []):
        raise HTTPException(403, "Tidak ada akses — hanya outlet asal yang dapat mengirim")

    if dn["status"] == "shipped":
        raise HTTPException(400, "Surat Jalan sudah dikirim")

    await q_exec("""UPDATE delivery_notes SET status = 'shipped', shipped_by = :sb, shipped_by_name = :sbn, shipped_at = NOW()
                    WHERE id = :id""",
                 sb=user["id"], sbn=user.get("name", ""), id=dn_id)

    # Update transfer status to shipped
    await q_exec("""UPDATE stock_transfers SET status = 'shipped', shipped_by = :sb, shipped_by_name = :sbn,
                    shipped_at = NOW(), updated_at = NOW() WHERE id = :tid""",
                 sb=user["id"], sbn=user.get("name", ""), tid=dn["transfer_id"])

    await log_action(user, "TRANSFER_SENT", "stock_transfer", entity_id=dn["transfer_id"],
                     outlet_id=dn["from_outlet_id"],
                     new_value={"transfer_no": dn["transfer_no"], "delivery_no": dn["delivery_no"]})

    # Notify destination outlet
    await create_alert("stock_transfer", "info",
                       f"Barang Dikirim: {dn['transfer_no']}",
                       f"Surat Jalan {dn['delivery_no']} sedang dalam perjalanan",
                       outlet_id=dn["to_outlet_id"],
                       data={"transfer_id": str(dn["transfer_id"]), "delivery_no": dn["delivery_no"]})

    return {"ok": True}
