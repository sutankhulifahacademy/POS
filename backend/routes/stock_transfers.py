import json
from typing import Optional
from routes.deps import *
from routes.inventory import _adjust_outlet_stock
from services.inventory_service import _adjust_outlet_stock_tx
from routes.audit_logs import log_action
from routes.alerts import create_alert
from sqlalchemy import text

router = APIRouter()

# ============ TRANSFERS ============
@router.get("/stock-transfers")
async def list_transfers(
    user=Depends(get_current_user),
    limit: int = 200,
    outlet_id: Optional[str] = None,
    status: Optional[str] = None,
):
    """List transfers. Filter by outlet_id (from or to) and optional status."""
    filters = []
    params = {"l": limit}

    if outlet_id:
        if user["role"] != "owner" and outlet_id not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")
        filters.append("(from_outlet_id = :oid OR to_outlet_id = :oid)")
        params["oid"] = outlet_id
    elif user["role"] != "owner":
        user_outlets = user.get("outlet_ids", [])
        if user_outlets:
            ids_sql = ",".join(f"'{oid}'" for oid in user_outlets)
            filters.append(f"(from_outlet_id IN ({ids_sql}) OR to_outlet_id IN ({ids_sql}))")
        else:
            return []

    if status:
        filters.append("t.status = :st")
        params["st"] = status

    where = " WHERE " + " AND ".join(filters) if filters else ""
    rows = await q_all(f"""
        SELECT t.*,
               (SELECT COUNT(*) FROM transfer_items ti WHERE ti.transfer_id = t.id) AS item_count,
               (SELECT COUNT(*) FROM transfer_items ti WHERE ti.transfer_id = t.id AND ti.status = 'pending') AS pending_count,
               (SELECT COUNT(*) FROM transfer_items ti WHERE ti.transfer_id = t.id AND ti.status = 'approved') AS approved_count,
               (SELECT COUNT(*) FROM transfer_items ti WHERE ti.transfer_id = t.id AND ti.status = 'rejected') AS rejected_count,
               dn.delivery_no, dn.status AS delivery_status, dn.print_count,
               sr.request_no
        FROM stock_transfers t
        LEFT JOIN delivery_notes dn ON dn.transfer_id = t.id
        LEFT JOIN stock_requests sr ON sr.id = t.request_id
        {where}
        ORDER BY t.created_at DESC LIMIT :l
    """, **params)
    return clean_list(rows)


@router.get("/stock-transfers/pending")
async def list_pending_transfers(
    user=Depends(get_current_user),
    outlet_id: Optional[str] = None,
):
    """List pending transfers for destination outlet (Pending Task)."""
    # Determine target outlet
    if outlet_id:
        if user["role"] != "owner" and outlet_id not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")
        target_outlets = [outlet_id]
    elif user["role"] == "owner":
        # Owner without specific outlet → all pending
        target_outlets = None
    else:
        target_outlets = user.get("outlet_ids", [])

    if target_outlets is None:
        rows = await q_all("""
            SELECT t.*,
                   (SELECT COUNT(*) FROM transfer_items ti WHERE ti.transfer_id = t.id) AS item_count,
                   (SELECT COUNT(*) FROM transfer_items ti WHERE ti.transfer_id = t.id AND ti.status = 'pending') AS pending_count
            FROM stock_transfers t
            WHERE t.status IN ('pending', 'partially_processed')
            ORDER BY t.created_at DESC
        """)
    elif target_outlets:
        ids_sql = ",".join(f"'{oid}'" for oid in target_outlets)
        rows = await q_all(f"""
            SELECT t.*,
                   (SELECT COUNT(*) FROM transfer_items ti WHERE ti.transfer_id = t.id) AS item_count,
                   (SELECT COUNT(*) FROM transfer_items ti WHERE ti.transfer_id = t.id AND ti.status = 'pending') AS pending_count
            FROM stock_transfers t
            WHERE t.to_outlet_id IN ({ids_sql})
              AND t.status IN ('pending', 'partially_processed')
            ORDER BY t.created_at DESC
        """)
    else:
        rows = []
    return clean_list(rows)


@router.get("/stock-transfers/{transfer_id}")
async def get_transfer_detail(transfer_id: str, user=Depends(get_current_user)):
    """Get transfer detail with items."""
    transfer = await q_one("SELECT * FROM stock_transfers WHERE id = :id", id=transfer_id)
    if not transfer:
        raise HTTPException(404, "Transfer tidak ditemukan")

    # Outlet authorization
    if user["role"] != "owner":
        user_outlets = set(user.get("outlet_ids", []))
        if str(transfer["from_outlet_id"]) not in user_outlets and str(transfer["to_outlet_id"]) not in user_outlets:
            raise HTTPException(403, "Tidak ada akses ke transfer ini")

    items = await q_all("""
        SELECT ti.*, p.name AS product_name_full, p.sku
        FROM transfer_items ti
        LEFT JOIN products p ON p.id = ti.product_id
        WHERE ti.transfer_id = :tid
        ORDER BY ti.created_at
    """, tid=transfer_id)

    result = clean(transfer)
    result["items"] = clean_list(items)
    return result


@router.post("/stock-transfers")
async def create_transfer(body: TransferIn, user=Depends(require_permission("transfers", "create"))):
    """Create transfer. Stock deducted from source, NOT added to destination yet."""
    if body.from_outlet_id == body.to_outlet_id:
        raise HTTPException(400, "Outlet sumber dan tujuan tidak boleh sama")
    if not body.items:
        raise HTTPException(400, "Item tidak boleh kosong")

    # Validate outlet access for both source and destination
    validate_outlet_access(user, body.from_outlet_id)
    validate_outlet_access(user, body.to_outlet_id)

    # Validate stock availability at source
    for it in body.items:
        p = await q_one("SELECT * FROM products WHERE id=:id", id=it.product_id)
        if not p:
            raise HTTPException(400, f"Produk {it.name} tidak ditemukan")
        # Check outlet stock (fallback to products.stock for main outlet)
        os_row = await q_one(
            "SELECT quantity FROM outlet_stocks WHERE product_id=:p AND outlet_id=:o",
            p=it.product_id, o=body.from_outlet_id,
        )
        if os_row:
            available = os_row["quantity"]
        else:
            # No outlet_stocks entry — use products.stock as fallback
            available = p["stock"] or 0
        if available < it.quantity:
            raise HTTPException(400, f"Stok {p['name']} tidak cukup di outlet asal (tersedia: {available})")

    tno = f"TRF-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{str(new_id())[:8]}"
    tid = new_id()
    total_qty = sum(i.quantity for i in body.items)
    dno = f"SJ-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{str(new_id())[:4].upper()}"
    dnid = new_id()

    # Atomic transaction: transfer record, items, stock deduction, delivery note
    async with transaction() as session:
        # Create transfer with status='pending' (NOT completed)
        await session.execute(
            text("""INSERT INTO stock_transfers (id, transfer_no, from_outlet_id, to_outlet_id, from_outlet_name,
                    to_outlet_name, items, total_quantity, note, status, created_by, created_by_name, created_at)
                    VALUES (:id, :tno, :fo, :to, :fn, :tn, CAST(:it AS jsonb), :tq, :note, 'pending', :cb, :cbn, NOW())"""),
            {"id": tid, "tno": tno, "fo": _u(body.from_outlet_id), "to": _u(body.to_outlet_id),
             "fn": body.from_outlet_name, "tn": body.to_outlet_name, "it": json.dumps([i.model_dump() for i in body.items]),
             "tq": total_qty, "note": body.note or "", "cb": user["id"], "cbn": user.get("name", "")},
        )

        # Create transfer_items + deduct source stock + record movements
        for it in body.items:
            await session.execute(
                text("""INSERT INTO transfer_items (id, transfer_id, product_id, product_name, qty_sent, status, created_at)
                        VALUES (:id, :tid, :pid, :pn, :qs, 'pending', NOW())"""),
                {"id": new_id(), "tid": tid, "pid": _u(it.product_id), "pn": it.name, "qs": it.quantity},
            )

            # Deduct stock from SOURCE only (transfer_out) — transaction-aware
            affected = await _adjust_outlet_stock_tx(session, it.product_id, body.from_outlet_id, -it.quantity)
            if affected == 0:
                raise HTTPException(400, f"Stok {it.name} tidak cukup di outlet asal untuk transfer")

            # Record stock movement
            await session.execute(
                text("""INSERT INTO stock_movements (id, product_id, product_name, delta, reason, note, outlet_id, user_id, created_at)
                        VALUES (:id, :pid, :pn, :d, :r, :note, :oid, :u, NOW())"""),
                {"id": new_id(), "pid": _u(it.product_id), "pn": it.name, "d": -it.quantity,
                 "r": "transfer_out", "note": f"{tno} → {body.to_outlet_name}",
                 "oid": _u(body.from_outlet_id), "u": user["id"]},
            )

        # Auto-generate delivery note (Surat Jalan) in same transaction
        await session.execute(
            text("""INSERT INTO delivery_notes (id, delivery_no, transfer_id, status, generated_by, generated_by_name, generated_at, created_at)
                    VALUES (:id, :dno, :tid, 'generated', :gb, :gbn, NOW(), NOW())"""),
            {"id": dnid, "dno": dno, "tid": tid, "gb": user["id"], "gbn": user.get("name", "")},
        )
        await session.execute(
            text("UPDATE stock_transfers SET delivery_note_id = :dnid WHERE id = :tid"),
            {"dnid": dnid, "tid": tid},
        )

    # Audit log + alerts (non-critical, outside transaction)
    await log_action(user, "TRANSFER_CREATED", "stock_transfer", entity_id=tid,
                     outlet_id=body.from_outlet_id,
                     new_value={"transfer_no": tno, "from": body.from_outlet_name,
                                "to": body.to_outlet_name, "items": [i.model_dump() for i in body.items],
                                "note": body.note or ""})
    await log_action(user, "DELIVERY_NOTE_GENERATED", "delivery_note", entity_id=dnid,
                     outlet_id=body.from_outlet_id,
                     new_value={"delivery_no": dno, "transfer_no": tno})

    # Notify destination outlet
    await create_alert("stock_transfer", "info",
                       f"Transfer Stok Masuk: {tno}",
                       f"Surat Jalan {dno} — {body.from_outlet_name} → {body.to_outlet_name}",
                       outlet_id=body.to_outlet_id,
                       data={"transfer_id": str(tid), "transfer_no": tno, "delivery_no": dno})

    return clean(await q_one("SELECT * FROM stock_transfers WHERE id=:id", id=tid))


@router.put("/stock-transfers/items/{item_id}/check")
async def check_transfer_item(item_id: str, body: dict, user=Depends(require_role("owner", "manager"))):
    """Check item: mark as checked, input qty_received."""
    item = await q_one("SELECT ti.*, t.from_outlet_id, t.to_outlet_id, t.transfer_no FROM transfer_items ti JOIN stock_transfers t ON t.id = ti.transfer_id WHERE ti.id = :id", id=item_id)
    if not item:
        raise HTTPException(404, "Item transfer tidak ditemukan")

    # Outlet authorization: user must be at destination outlet
    if user["role"] != "owner" and str(item["to_outlet_id"]) not in user.get("outlet_ids", []):
        raise HTTPException(403, "Tidak ada akses — item ini untuk outlet lain")

    if item["status"] not in ("pending", "checked"):
        raise HTTPException(400, f"Item sudah {item['status']}, tidak dapat di-check ulang")

    qty_received = int(body.get("qty_received", 0))
    if qty_received < 0:
        raise HTTPException(400, "Qty diterima tidak boleh negatif")

    note = body.get("note", "")
    is_match = qty_received == item["qty_sent"]

    await q_exec("""UPDATE transfer_items SET qty_received = :qr, status = 'checked',
                    note = :note, checked_by = :cb, checked_by_name = :cbn, checked_at = NOW()
                    WHERE id = :id""",
                 qr=qty_received, note=note, cb=user["id"], cbn=user.get("name", ""), id=item_id)

    # Audit log
    await log_action(user, "TRANSFER_ITEM_CHECKED", "transfer_item", entity_id=item_id,
                     outlet_id=item["to_outlet_id"],
                     new_value={"transfer_no": item["transfer_no"], "product": item["product_name"],
                                "qty_sent": item["qty_sent"], "qty_received": qty_received,
                                "match": is_match, "note": note})

    return {"ok": True, "match": is_match, "qty_sent": item["qty_sent"], "qty_received": qty_received}


@router.post("/stock-transfers/items/{item_id}/approve")
async def approve_transfer_item(item_id: str, user=Depends(require_role("owner", "manager"))):
    """Approve item: add stock to destination outlet + stock movement + audit log.

    Race-condition safe: status transition is guarded by an atomic
    conditional UPDATE inside a single transaction. Previously two
    concurrent approvals could both pass the in-Python status check
    and double-increment destination stock.
    """
    item = await q_one("""SELECT ti.*, t.from_outlet_id, t.to_outlet_id, t.transfer_no,
                          t.from_outlet_name, t.to_outlet_name
                          FROM transfer_items ti JOIN stock_transfers t ON t.id = ti.transfer_id
                          WHERE ti.id = :id""", id=item_id)
    if not item:
        raise HTTPException(404, "Item transfer tidak ditemukan")

    # Outlet authorization: user must be at destination outlet
    if user["role"] != "owner" and str(item["to_outlet_id"]) not in user.get("outlet_ids", []):
        raise HTTPException(403, "Tidak ada akses — item ini untuk outlet lain")

    # Idempotency: only checked items can be approved
    if item["status"] == "approved":
        raise HTTPException(400, "Item sudah di-approve")
    if item["status"] == "rejected":
        raise HTTPException(400, "Item sudah di-reject")
    if item["status"] not in ("pending", "checked"):
        raise HTTPException(400, f"Item status: {item['status']}, tidak dapat di-approve")

    # Must be checked first with qty_received matching qty_sent
    if item["qty_received"] is None:
        raise HTTPException(400, "Item belum di-check (qty_received belum diisi)")
    if item["qty_received"] != item["qty_sent"]:
        raise HTTPException(400, f"Qty tidak match (dikirim: {item['qty_sent']}, diterima: {item['qty_received']}). Reject item ini.")

    qty = item["qty_received"]

    # =========================================================
    # ATOMIC TRANSACTION
    # =========================================================
    # Status claim + stock movement + outlet stock increment +
    # transfer status update must all commit together. The
    # conditional UPDATE on transfer_items.status prevents
    # double-approve at the DB level even under concurrency.
    # =========================================================
    from database import transaction, execute as _tx_execute
    async with transaction() as session:
        claim = await _tx_execute(
            session,
            """UPDATE transfer_items
               SET status = 'approved', approved_by = :ab,
                   approved_by_name = :abn, approved_at = NOW()
               WHERE id = :id AND status IN ('pending', 'checked')""",
            ab=user["id"], abn=user.get("name", ""), id=item_id,
        )
        if claim.rowcount == 0:
            raise HTTPException(400, "Item sudah di-approve/reject oleh user lain (race condition dicegah)")

        # Stock movement: transfer_in to destination
        await _tx_execute(
            session,
            """INSERT INTO stock_movements (id, product_id, product_name, delta, reason, note, outlet_id, user_id, created_at, reference_no, approved_by)
               VALUES (:id, :pid, :pn, :d, :r, :note, :oid, :u, NOW(), :ref, :ab)""",
            id=new_id(), pid=item["product_id"], pn=item["product_name"], d=qty,
            r="transfer_in", note=f"{item['transfer_no']} ← {item['from_outlet_name']}",
            oid=item["to_outlet_id"], u=user["id"], ref=item["transfer_no"], ab=user["id"],
        )

        # Atomic outlet stock upsert (safe under concurrency)
        await _tx_execute(
            session,
            """
            INSERT INTO outlet_stocks (product_id, outlet_id, quantity, updated_at)
            VALUES (:p, :o, :q, NOW())
            ON CONFLICT (product_id, outlet_id)
            DO UPDATE SET quantity = outlet_stocks.quantity + EXCLUDED.quantity,
                          updated_at = NOW()
            """,
            p=str(item["product_id"]), o=str(item["to_outlet_id"]), q=qty,
        )

    # Update transfer status (post-tx; non-critical if it fails)
    try:
        await _update_transfer_status(item["transfer_id"])
    except Exception:
        pass

    # Audit log (post-tx; non-critical)
    try:
        await log_action(user, "TRANSFER_ITEM_APPROVED", "transfer_item", entity_id=item_id,
                         outlet_id=item["to_outlet_id"],
                         new_value={"transfer_no": item["transfer_no"], "product": item["product_name"],
                                    "qty_sent": item["qty_sent"], "qty_received": qty,
                                    "qty_to_inventory": qty, "approved_by": user.get("name", "")})
    except Exception:
        pass

    return {"ok": True, "qty_added": qty}


@router.post("/stock-transfers/items/{item_id}/reject")
async def reject_transfer_item(item_id: str, body: dict, user=Depends(require_role("owner", "manager"))):
    """Reject item: no stock change, just update status + audit log."""
    item = await q_one("""SELECT ti.*, t.from_outlet_id, t.to_outlet_id, t.transfer_no,
                          t.from_outlet_name, t.to_outlet_name
                          FROM transfer_items ti JOIN stock_transfers t ON t.id = ti.transfer_id
                          WHERE ti.id = :id""", id=item_id)
    if not item:
        raise HTTPException(404, "Item transfer tidak ditemukan")

    # Outlet authorization
    if user["role"] != "owner" and str(item["to_outlet_id"]) not in user.get("outlet_ids", []):
        raise HTTPException(403, "Tidak ada akses — item ini untuk outlet lain")

    # Idempotency
    if item["status"] == "approved":
        raise HTTPException(400, "Item sudah di-approve")
    if item["status"] == "rejected":
        raise HTTPException(400, "Item sudah di-reject")

    note = body.get("note", item.get("note") or "")
    qty_received = item["qty_received"] if item["qty_received"] is not None else 0
    difference = qty_received - item["qty_sent"]

    # Atomic conditional update — prevents double-reject race
    r = await q_exec(
        """UPDATE transfer_items SET status = 'rejected', note = :note,
            qty_received = :qr, checked_by = :cb, checked_by_name = :cbn, checked_at = NOW(),
            approved_by = :ab, approved_by_name = :abn, approved_at = NOW()
           WHERE id = :id AND status NOT IN ('approved', 'rejected')""",
        note=note, qr=qty_received, cb=user["id"], cbn=user.get("name", ""),
        ab=user["id"], abn=user.get("name", ""), id=item_id,
    )
    if r == 0:
        raise HTTPException(400, "Item sudah di-approve/reject oleh user lain")

    # Update transfer status
    try:
        await _update_transfer_status(item["transfer_id"])
    except Exception:
        pass

    # Audit log
    await log_action(user, "TRANSFER_ITEM_REJECTED", "transfer_item", entity_id=item_id,
                     outlet_id=item["to_outlet_id"],
                     new_value={"transfer_no": item["transfer_no"], "product": item["product_name"],
                                "qty_sent": item["qty_sent"], "qty_received": qty_received,
                                "difference": difference, "qty_to_inventory": 0,
                                "rejected_by": user.get("name", ""), "note": note})

    return {"ok": True, "qty_added": 0}


async def _update_transfer_status(transfer_id: str):
    """Update transfer status based on item statuses: pending → partially_processed → completed."""
    items = await q_all("SELECT status FROM transfer_items WHERE transfer_id = :tid", tid=transfer_id)
    if not items:
        return
    pending = sum(1 for i in items if i["status"] == "pending")
    processed = sum(1 for i in items if i["status"] in ("approved", "rejected"))

    if pending == 0:
        new_status = "completed"
        await q_exec("UPDATE stock_transfers SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = :id", id=transfer_id)
    elif processed > 0:
        new_status = "partially_processed"
        await q_exec("UPDATE stock_transfers SET status = 'partially_processed', updated_at = NOW() WHERE id = :id", id=transfer_id)
    else:
        new_status = "pending"
        await q_exec("UPDATE stock_transfers SET status = 'pending', updated_at = NOW() WHERE id = :id", id=transfer_id)


# ============ TRANSFER REPORT ============
@router.get("/reports/transfers")
async def transfer_report(
    user=Depends(require_role("owner", "admin", "manager", "supervisor")),
    outlet_id: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    """Transfer report with item-level detail."""
    filters = []
    params = {}

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
        filters.append("t.status = :st")
        params["st"] = status

    if date_from:
        # WIB = UTC+7, so 2026-08-31 00:00 WIB = 2026-08-30 17:00 UTC
        filters.append("t.created_at >= :df")
        params["df"] = datetime.strptime(date_from + " 00:00:00", "%Y-%m-%d %H:%M:%S") - timedelta(hours=7)
    if date_to:
        # 2026-08-31 23:59:59 WIB = 2026-08-31 16:59:59 UTC
        filters.append("t.created_at <= :dt")
        params["dt"] = datetime.strptime(date_to + " 23:59:59", "%Y-%m-%d %H:%M:%S") - timedelta(hours=7)

    where = " WHERE " + " AND ".join(filters) if filters else ""
    rows = await q_all(f"""
        SELECT t.id, t.transfer_no, t.from_outlet_name, t.to_outlet_name,
               t.from_outlet_id, t.to_outlet_id, t.status, t.note AS transfer_note,
               t.created_by_name, t.created_at, t.completed_at,
               t.shipped_by_name, t.shipped_at,
               ti.product_name, ti.qty_sent, ti.qty_received,
               (ti.qty_received - ti.qty_sent) AS difference,
               ti.status AS item_status, ti.note AS item_note,
               ti.checked_by_name, ti.checked_at,
               ti.approved_by_name, ti.approved_at,
               dn.delivery_no, dn.status AS delivery_status, dn.print_count,
               sr.request_no
        FROM stock_transfers t
        LEFT JOIN transfer_items ti ON ti.transfer_id = t.id
        LEFT JOIN delivery_notes dn ON dn.transfer_id = t.id
        LEFT JOIN stock_requests sr ON sr.id = t.request_id
        {where}
        ORDER BY t.created_at DESC, ti.created_at
    """, **params)
    return clean_list(rows)


# ============ SHIP TRANSFER ============
@router.post("/stock-transfers/{transfer_id}/ship")
async def ship_transfer(transfer_id: str, user=Depends(require_role("owner", "manager", "admin", "supervisor"))):
    """Mark transfer as shipped. Updates delivery note status too."""
    transfer = await q_one("SELECT * FROM stock_transfers WHERE id = :id", id=transfer_id)
    if not transfer:
        raise HTTPException(404, "Transfer tidak ditemukan")

    # Outlet authorization: source outlet staff can ship
    if user["role"] != "owner" and str(transfer["from_outlet_id"]) not in user.get("outlet_ids", []):
        raise HTTPException(403, "Tidak ada akses — hanya outlet asal yang dapat mengirim")

    if transfer["status"] == "shipped":
        raise HTTPException(400, "Transfer sudah dikirim")
    if transfer["status"] in ("completed",):
        raise HTTPException(400, "Transfer sudah selesai")

    # Atomic conditional update — prevents double-ship race
    r = await q_exec(
        """UPDATE stock_transfers SET status = 'shipped', shipped_by = :sb, shipped_by_name = :sbn,
            shipped_at = NOW(), updated_at = NOW()
           WHERE id = :id AND status NOT IN ('shipped', 'completed')""",
        sb=user["id"], sbn=user.get("name", ""), id=transfer_id,
    )
    if r == 0:
        raise HTTPException(400, "Transfer status sudah berubah (kemungkinan sedang diproses)")

    # Update delivery note if exists
    dn = await q_one("SELECT id FROM delivery_notes WHERE transfer_id = :tid", tid=transfer_id)
    if dn:
        await q_exec("""UPDATE delivery_notes SET status = 'shipped', shipped_by = :sb, shipped_by_name = :sbn, shipped_at = NOW()
                        WHERE id = :id AND status != 'shipped'""",
                     sb=user["id"], sbn=user.get("name", ""), id=dn["id"])

    await log_action(user, "TRANSFER_SENT", "stock_transfer", entity_id=transfer_id,
                     outlet_id=transfer["from_outlet_id"],
                     new_value={"transfer_no": transfer["transfer_no"]})

    # Notify destination outlet
    await create_alert("stock_transfer", "info",
                       f"Barang Dikirim: {transfer['transfer_no']}",
                       f"Transfer sedang dalam perjalanan ke {transfer['to_outlet_name']}",
                       outlet_id=transfer["to_outlet_id"],
                       data={"transfer_id": str(transfer_id), "transfer_no": transfer["transfer_no"]})

    return {"ok": True}
