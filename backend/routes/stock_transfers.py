import json
from routes.deps import *
from routes.inventory import _adjust_outlet_stock

router = APIRouter()

# ============ TRANSFERS ============
@router.get("/stock-transfers")
async def list_transfers(user=Depends(get_current_user), limit: int = 200):
    rows = await q_all("SELECT * FROM stock_transfers ORDER BY created_at DESC LIMIT :l", l=limit)
    return clean_list(rows)

@router.post("/stock-transfers")
async def create_transfer(body: TransferIn, user=Depends(require_permission("transfers", "create"))):
    if body.from_outlet_id == body.to_outlet_id: raise HTTPException(400, "Outlet sumber dan tujuan tidak boleh sama")
    if not body.items: raise HTTPException(400, "Item tidak boleh kosong")
    for it in body.items:
        p = await q_one("SELECT * FROM products WHERE id=:id", id=it.product_id)
        if not p: raise HTTPException(400, f"Produk {it.name} tidak ditemukan")
        if p["stock"] < it.quantity: raise HTTPException(400, f"Stok {p['name']} tidak cukup")
    tno = f"TRF-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    tid = new_id()
    total_qty = sum(i.quantity for i in body.items)
    items_json = json.dumps([i.model_dump() for i in body.items])
    await q_exec("""INSERT INTO stock_transfers (id, transfer_no, from_outlet_id, to_outlet_id, from_outlet_name,
                    to_outlet_name, items, total_quantity, note, status, created_by, created_by_name, created_at)
                    VALUES (:id, :tno, :fo, :to, :fn, :tn, CAST(:it AS jsonb), :tq, :note, 'completed', :cb, :cbn, NOW())""",
                 id=tid, tno=tno, fo=_u(body.from_outlet_id), to=_u(body.to_outlet_id),
                 fn=body.from_outlet_name, tn=body.to_outlet_name, it=items_json,
                 tq=total_qty, note=body.note or "", cb=user["id"], cbn=user.get("name",""))
    for it in body.items:
        for delta, reason, oid, other in [(-it.quantity, "transfer_out", body.from_outlet_id, body.to_outlet_name),
                                            (it.quantity, "transfer_in", body.to_outlet_id, body.from_outlet_name)]:
            await q_exec("""INSERT INTO stock_movements (id, product_id, product_name, delta, reason, note, outlet_id, user_id, created_at)
                            VALUES (:id, :pid, :pn, :d, :r, :note, :oid, :u, NOW())""",
                         id=new_id(), pid=it.product_id, pn=it.name, d=delta, r=reason,
                         note=f"{tno} {'→' if delta<0 else '←'} {other}", oid=_u(oid), u=user["id"])
        await _adjust_outlet_stock(it.product_id, body.from_outlet_id, -it.quantity)
        await _adjust_outlet_stock(it.product_id, body.to_outlet_id, it.quantity)
    return clean(await q_one("SELECT * FROM stock_transfers WHERE id=:id", id=tid))
