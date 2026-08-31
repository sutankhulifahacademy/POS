"""Stock Request routes — cabang request stok ke pusat, approve, convert to transfer."""
import json
from typing import Optional
from routes.deps import *
from routes.inventory import _adjust_outlet_stock
from routes.audit_logs import log_action
from routes.alerts import create_alert

router = APIRouter()

# ============ STOCK REQUESTS ============
@router.get("/stock-requests")
async def list_stock_requests(
    user=Depends(get_current_user),
    outlet_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 200,
):
    """List stock requests. Owner sees all, others see their outlet scope."""
    filters = []
    params = {"l": limit}

    if outlet_id:
        if user["role"] != "owner" and outlet_id not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")
        filters.append("sr.requesting_outlet_id = :oid")
        params["oid"] = outlet_id
    elif user["role"] != "owner":
        user_outlets = user.get("outlet_ids", [])
        if user_outlets:
            ids_sql = ",".join(f"'{oid}'" for oid in user_outlets)
            filters.append(f"sr.requesting_outlet_id IN ({ids_sql})")
        else:
            return []

    if status:
        filters.append("sr.status = :st")
        params["st"] = status

    where = " WHERE " + " AND ".join(filters) if filters else ""
    rows = await q_all(f"""
        SELECT sr.*,
               (SELECT COUNT(*) FROM stock_request_items sri WHERE sri.request_id = sr.id) AS item_count,
               (SELECT COALESCE(SUM(sri.qty_requested), 0) FROM stock_request_items sri WHERE sri.request_id = sr.id) AS total_qty_requested,
               (SELECT COALESCE(SUM(sri.qty_approved), 0) FROM stock_request_items sri WHERE sri.request_id = sr.id) AS total_qty_approved
        FROM stock_requests sr
        {where}
        ORDER BY sr.created_at DESC LIMIT :l
    """, **params)
    return clean_list(rows)


@router.get("/stock-requests/{request_id}")
async def get_stock_request(request_id: str, user=Depends(get_current_user)):
    """Get stock request detail with items."""
    req = await q_one("SELECT * FROM stock_requests WHERE id = :id", id=request_id)
    if not req:
        raise HTTPException(404, "Request tidak ditemukan")

    # Outlet authorization
    if user["role"] != "owner":
        user_outlets = set(user.get("outlet_ids", []))
        if str(req["requesting_outlet_id"]) not in user_outlets:
            raise HTTPException(403, "Tidak ada akses ke request ini")

    items = await q_all("""
        SELECT sri.*, p.sku, p.name AS product_name_full
        FROM stock_request_items sri
        LEFT JOIN products p ON p.id = sri.product_id
        WHERE sri.request_id = :rid
        ORDER BY sri.created_at
    """, rid=request_id)

    result = clean(req)
    result["items"] = clean_list(items)
    return result


@router.post("/stock-requests")
async def create_stock_request(body: dict, user=Depends(require_permission("stock_requests", "create"))):
    """Create stock request (draft or submitted)."""
    items = body.get("items", [])
    if not items:
        raise HTTPException(400, "Item tidak boleh kosong")

    outlet_id = body.get("requesting_outlet_id") or (user.get("outlet_ids") or [None])[0]
    if not outlet_id:
        raise HTTPException(400, "Outlet wajib dipilih")

    # Outlet authorization
    if user["role"] != "owner" and outlet_id not in user.get("outlet_ids", []):
        raise HTTPException(403, "Tidak ada akses ke outlet ini")

    outlet = await q_one("SELECT name FROM outlets WHERE id = :id", id=outlet_id)
    outlet_name = outlet["name"] if outlet else ""

    rno = f"REQ-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{str(new_id())[:8]}"
    rid = new_id()
    status = body.get("status", "submitted")  # default submitted
    priority = body.get("priority", "normal")
    note = body.get("note", "")

    await q_exec("""INSERT INTO stock_requests (id, request_no, requesting_outlet_id, requesting_outlet_name,
                    status, priority, note, created_by, created_by_name, created_at, submitted_at, updated_at)
                    VALUES (:id, :rno, :oid, :oname, :st, :pri, :note, :cb, :cbn, NOW(),
                    CASE WHEN :st2 = 'submitted' THEN NOW() ELSE NULL END, NOW())""",
                 id=rid, rno=rno, oid=_u(outlet_id), oname=outlet_name,
                 st=status, st2=status, pri=priority, note=note, cb=user["id"], cbn=user.get("name", ""))

    for it in items:
        # Get product info
        p = await q_one("SELECT name, sku FROM products WHERE id = :id", id=it["product_id"])
        await q_exec("""INSERT INTO stock_request_items (id, request_id, product_id, product_name, sku, qty_requested, status, created_at)
                        VALUES (:id, :rid, :pid, :pn, :sku, :qr, 'pending', NOW())""",
                     id=new_id(), rid=rid, pid=_u(it["product_id"]),
                     pn=p["name"] if p else it.get("name", ""),
                     sku=p["sku"] if p else None,
                     qr=int(it["qty_requested"]))

    # Audit log
    await log_action(user, "STOCK_REQUEST_CREATED", "stock_request", entity_id=rid,
                     outlet_id=outlet_id,
                     new_value={"request_no": rno, "outlet": outlet_name,
                                "items": items, "priority": priority, "note": note})

    # If submitted, notify pusat (owner + managers + supervisors)
    if status == "submitted":
        await log_action(user, "STOCK_REQUEST_SUBMITTED", "stock_request", entity_id=rid,
                         outlet_id=outlet_id, new_value={"request_no": rno})
        # Create alert for pusat (use main outlet or all outlets notification)
        await create_alert("stock_request", "info",
                           f"Permintaan Stok Baru: {rno}",
                           f"{outlet_name} meminta {len(items)} item",
                           outlet_id=outlet_id,
                           data={"request_id": str(rid), "request_no": rno})

    return clean(await q_one("SELECT * FROM stock_requests WHERE id = :id", id=rid))


@router.put("/stock-requests/{request_id}/submit")
async def submit_stock_request(request_id: str, user=Depends(require_permission("stock_requests", "create"))):
    """Submit a draft request."""
    req = await q_one("SELECT * FROM stock_requests WHERE id = :id", id=request_id)
    if not req:
        raise HTTPException(404, "Request tidak ditemukan")
    if user["role"] != "owner" and str(req["requesting_outlet_id"]) not in user.get("outlet_ids", []):
        raise HTTPException(403, "Tidak ada akses")
    if req["status"] != "draft":
        raise HTTPException(400, f"Request status: {req['status']}, tidak dapat di-submit")

    await q_exec("UPDATE stock_requests SET status = 'submitted', submitted_at = NOW(), updated_at = NOW() WHERE id = :id", id=request_id)

    await log_action(user, "STOCK_REQUEST_SUBMITTED", "stock_request", entity_id=request_id,
                     outlet_id=req["requesting_outlet_id"], new_value={"request_no": req["request_no"]})
    await create_alert("stock_request", "info",
                       f"Permintaan Stok Baru: {req['request_no']}",
                       f"{req['requesting_outlet_name']} mengajukan permintaan stok",
                       outlet_id=req["requesting_outlet_id"],
                       data={"request_id": str(request_id), "request_no": req["request_no"]})

    return {"ok": True}


@router.post("/stock-requests/{request_id}/approve")
async def approve_stock_request(request_id: str, body: dict, user=Depends(require_permission("stock_requests", "approve"))):
    """Approve stock request (full or partial). Body: {items: [{id, qty_approved, status}], review_note}"""
    req = await q_one("SELECT * FROM stock_requests WHERE id = :id", id=request_id)
    if not req:
        raise HTTPException(404, "Request tidak ditemukan")
    if req["status"] not in ("submitted", "approved", "partially_approved"):
        raise HTTPException(400, f"Request status: {req['status']}, tidak dapat di-approve")

    items_data = body.get("items", [])
    if not items_data:
        raise HTTPException(400, "Item approval tidak boleh kosong")

    review_note = body.get("review_note", "")
    all_approved = True
    any_approved = False

    for it in items_data:
        item = await q_one("SELECT * FROM stock_request_items WHERE id = :id AND request_id = :rid", id=it["id"], rid=request_id)
        if not item:
            raise HTTPException(404, f"Item {it['id']} tidak ditemukan")

        qty_approved = int(it.get("qty_approved", 0))
        item_status = it.get("status", "approved" if qty_approved > 0 else "rejected")

        # Get stock at center (main outlet) for reference
        main_outlet = await q_one("SELECT id FROM outlets WHERE is_main = TRUE OR name ILIKE '%pusat%' OR name ILIKE '%utama%' LIMIT 1")
        if main_outlet:
            os_row = await q_one("SELECT quantity FROM outlet_stocks WHERE product_id = :p AND outlet_id = :o",
                                 p=item["product_id"], o=main_outlet["id"])
            stock_center = os_row["quantity"] if os_row else 0
        else:
            stock_center = 0

        await q_exec("""UPDATE stock_request_items SET qty_approved = :qa, status = :st, stock_at_center = :sc, note = :note
                        WHERE id = :id""",
                     qa=qty_approved, st=item_status, sc=stock_center, note=it.get("note", ""), id=it["id"])

        if item_status == "approved":
            any_approved = True
        else:
            all_approved = False

    # Determine request status
    if all_approved:
        new_status = "approved"
    elif any_approved:
        new_status = "partially_approved"
    else:
        new_status = "rejected"

    await q_exec("""UPDATE stock_requests SET status = :st, reviewed_by = :rb, reviewed_by_name = :rbn,
                    reviewed_at = NOW(), review_note = :rn, updated_at = NOW() WHERE id = :id""",
                 st=new_status, rb=user["id"], rbn=user.get("name", ""), rn=review_note, id=request_id)

    action = "STOCK_REQUEST_APPROVED" if new_status == "approved" else \
             "STOCK_REQUEST_PARTIALLY_APPROVED" if new_status == "partially_approved" else "STOCK_REQUEST_REJECTED"
    await log_action(user, action, "stock_request", entity_id=request_id,
                     outlet_id=req["requesting_outlet_id"],
                     new_value={"request_no": req["request_no"], "review_note": review_note, "status": new_status})

    # Notify requesting outlet
    await create_alert("stock_request", "info",
                       f"Request Stok {new_status.title()}: {req['request_no']}",
                       f"Request stok telah {new_status} oleh {user.get('name', '')}",
                       outlet_id=req["requesting_outlet_id"],
                       data={"request_id": str(request_id), "request_no": req["request_no"], "status": new_status})

    return {"ok": True, "status": new_status}


@router.post("/stock-requests/{request_id}/reject")
async def reject_stock_request(request_id: str, body: dict, user=Depends(require_permission("stock_requests", "approve"))):
    """Reject entire stock request."""
    req = await q_one("SELECT * FROM stock_requests WHERE id = :id", id=request_id)
    if not req:
        raise HTTPException(404, "Request tidak ditemukan")
    if req["status"] not in ("submitted", "partially_approved"):
        raise HTTPException(400, f"Request status: {req['status']}, tidak dapat di-reject")

    review_note = body.get("review_note", "")
    await q_exec("""UPDATE stock_requests SET status = 'rejected', reviewed_by = :rb, reviewed_by_name = :rbn,
                    reviewed_at = NOW(), review_note = :rn, updated_at = NOW() WHERE id = :id""",
                 rb=user["id"], rbn=user.get("name", ""), rn=review_note, id=request_id)
    await q_exec("UPDATE stock_request_items SET status = 'rejected', qty_approved = 0 WHERE request_id = :rid", rid=request_id)

    await log_action(user, "STOCK_REQUEST_REJECTED", "stock_request", entity_id=request_id,
                     outlet_id=req["requesting_outlet_id"],
                     new_value={"request_no": req["request_no"], "review_note": review_note})

    await create_alert("stock_request", "warning",
                       f"Request Stok Ditolak: {req['request_no']}",
                       f"Request stok ditolak oleh {user.get('name', '')}",
                       outlet_id=req["requesting_outlet_id"],
                       data={"request_id": str(request_id), "request_no": req["request_no"]})

    return {"ok": True}


@router.post("/stock-requests/{request_id}/convert-to-transfer")
async def convert_request_to_transfer(request_id: str, user=Depends(require_permission("stock_transfers", "create"))):
    """Convert approved/partially_approved stock request into a stock transfer.
    Creates transfer + delivery note (surat jalan) automatically."""
    req = await q_one("SELECT * FROM stock_requests WHERE id = :id", id=request_id)
    if not req:
        raise HTTPException(404, "Request tidak ditemukan")
    if req["status"] not in ("approved", "partially_approved"):
        raise HTTPException(400, f"Request status: {req['status']}, hanya approved/partially_approved yang dapat dikonversi")
    if req.get("converted_transfer_id"):
        raise HTTPException(400, "Request sudah dikonversi ke transfer")

    # Get approved items
    items = await q_all("""SELECT sri.*, p.name AS pname, p.sku
                           FROM stock_request_items sri
                           LEFT JOIN products p ON p.id = sri.product_id
                           WHERE sri.request_id = :rid AND sri.status = 'approved' AND sri.qty_approved > 0
                           ORDER BY sri.created_at""", rid=request_id)
    if not items:
        raise HTTPException(400, "Tidak ada item yang di-approve untuk dikonversi")

    # Determine source outlet (pusat / main outlet)
    main_outlet = await q_one("SELECT id, name FROM outlets WHERE is_main = TRUE OR name ILIKE '%pusat%' OR name ILIKE '%utama%' LIMIT 1")
    if not main_outlet:
        # Fallback: first outlet
        main_outlet = await q_one("SELECT id, name FROM outlets ORDER BY created_at LIMIT 1")
    if not main_outlet:
        raise HTTPException(400, "Tidak ada outlet pusat ditemukan")

    from_outlet_id = str(main_outlet["id"])
    from_outlet_name = main_outlet["name"]
    to_outlet_id = str(req["requesting_outlet_id"])
    to_outlet_name = req["requesting_outlet_name"]

    # Validate stock at source
    transfer_items = []
    for it in items:
        os_row = await q_one("SELECT quantity FROM outlet_stocks WHERE product_id = :p AND outlet_id = :o",
                             p=it["product_id"], o=from_outlet_id)
        available = os_row["quantity"] if os_row else 0
        if available < it["qty_approved"]:
            raise HTTPException(400, f"Stok {it['pname']} tidak cukup di pusat (tersedia: {available}, dibutuhkan: {it['qty_approved']})")
        transfer_items.append({
            "product_id": str(it["product_id"]),
            "name": it["pname"] or it["product_name"],
            "quantity": it["qty_approved"],
        })

    # Create transfer
    tno = f"TRF-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{str(new_id())[:8]}"
    tid = new_id()
    total_qty = sum(i["quantity"] for i in transfer_items)

    await q_exec("""INSERT INTO stock_transfers (id, transfer_no, from_outlet_id, to_outlet_id, from_outlet_name,
                    to_outlet_name, items, total_quantity, note, status, created_by, created_by_name, created_at, request_id)
                    VALUES (:id, :tno, :fo, :to, :fn, :tn, CAST(:it AS jsonb), :tq, :note, 'pending', :cb, :cbn, NOW(), :rid)""",
                 id=tid, tno=tno, fo=_u(from_outlet_id), to=_u(to_outlet_id),
                 fn=from_outlet_name, tn=to_outlet_name, it=json.dumps(transfer_items),
                 tq=total_qty, note=f"From request {req['request_no']}", cb=user["id"], cbn=user.get("name", ""),
                 rid=_u(request_id))

    # Create transfer_items + deduct source stock
    for it in transfer_items:
        await q_exec("""INSERT INTO transfer_items (id, transfer_id, product_id, product_name, qty_sent, status, created_at)
                        VALUES (:id, :tid, :pid, :pn, :qs, 'pending', NOW())""",
                     id=new_id(), tid=tid, pid=_u(it["product_id"]), pn=it["name"], qs=it["quantity"])

        await q_exec("""INSERT INTO stock_movements (id, product_id, product_name, delta, reason, note, outlet_id, user_id, created_at)
                        VALUES (:id, :pid, :pn, :d, :r, :note, :oid, :u, NOW())""",
                     id=new_id(), pid=_u(it["product_id"]), pn=it["name"], d=-it["quantity"],
                     r="transfer_out", note=f"{tno} → {to_outlet_name}", oid=_u(from_outlet_id), u=user["id"])
        await _adjust_outlet_stock(it["product_id"], from_outlet_id, -it["quantity"])

    # Create delivery note (surat jalan)
    dno = f"SJ-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{str(new_id())[:4].upper()}"
    dnid = new_id()
    await q_exec("""INSERT INTO delivery_notes (id, delivery_no, transfer_id, request_id, status, generated_by, generated_by_name, generated_at, created_at)
                    VALUES (:id, :dno, :tid, :rid, 'generated', :gb, :gbn, NOW(), NOW())""",
                 id=dnid, dno=dno, tid=tid, rid=_u(request_id), gb=user["id"], gbn=user.get("name", ""))

    # Link transfer to delivery note
    await q_exec("UPDATE stock_transfers SET delivery_note_id = :dnid WHERE id = :tid", dnid=dnid, tid=tid)

    # Mark request as converted
    await q_exec("""UPDATE stock_requests SET status = 'converted', converted_transfer_id = :tid,
                    converted_at = NOW(), updated_at = NOW() WHERE id = :rid""",
                 tid=tid, rid=request_id)

    # Audit logs
    await log_action(user, "STOCK_REQUEST_CONVERTED_TO_TRANSFER", "stock_request", entity_id=request_id,
                     outlet_id=to_outlet_id,
                     new_value={"request_no": req["request_no"], "transfer_no": tno, "delivery_no": dno})
    await log_action(user, "TRANSFER_CREATED", "stock_transfer", entity_id=tid,
                     outlet_id=from_outlet_id,
                     new_value={"transfer_no": tno, "from": from_outlet_name, "to": to_outlet_name,
                                "items": transfer_items, "request_id": str(request_id)})
    await log_action(user, "DELIVERY_NOTE_GENERATED", "delivery_note", entity_id=dnid,
                     outlet_id=from_outlet_id,
                     new_value={"delivery_no": dno, "transfer_no": tno, "request_no": req["request_no"]})

    # Notify destination outlet
    await create_alert("stock_transfer", "info",
                       f"Transfer Stok Masuk: {tno}",
                       f"Surat Jalan {dno} — {from_outlet_name} → {to_outlet_name}",
                       outlet_id=to_outlet_id,
                       data={"transfer_id": str(tid), "transfer_no": tno, "delivery_no": dno})

    return {
        "ok": True,
        "transfer_id": str(tid),
        "transfer_no": tno,
        "delivery_note_id": str(dnid),
        "delivery_no": dno,
    }
