from fastapi import APIRouter, HTTPException, Depends
from routes.deps import *

router = APIRouter()


@router.get("/tables")
async def list_tables(user=Depends(get_current_user)):
    rows = await q_all("""SELECT t.*,
        (SELECT id FROM orders WHERE table_id=t.id AND status='open' LIMIT 1) AS active_order_id,
        COALESCE((SELECT total FROM orders WHERE table_id=t.id AND status='open' LIMIT 1), 0) AS active_order_total
        FROM tables t ORDER BY name""")
    result = clean_list(rows)
    return result


@router.post("/tables")
async def create_table(body: TableIn, user=Depends(require_permission("tables", "create"))):
    tid = new_id()
    await q_exec("""INSERT INTO tables (id, name, capacity, outlet_id, zone, status, created_at)
                    VALUES (:id, :n, :c, :oid, :z, 'available', NOW())""",
                 id=tid, n=body.name, c=body.capacity, oid=_u(body.outlet_id), z=body.zone or "Utama")
    return clean(await q_one("SELECT * FROM tables WHERE id=:id", id=tid))


@router.put("/tables/{table_id}")
async def update_table(table_id: str, body: TableIn, user=Depends(require_permission("tables", "update"))):
    r = await q_exec("""UPDATE tables SET name=:n, capacity=:c, outlet_id=:oid, zone=:z, updated_at=NOW()
                        WHERE id=:id""", id=table_id, n=body.name, c=body.capacity,
                     oid=_u(body.outlet_id), z=body.zone or "Utama")
    if r == 0:
        raise HTTPException(404, "Not found")
    return clean(await q_one("SELECT * FROM tables WHERE id=:id", id=table_id))


@router.delete("/tables/{table_id}")
async def delete_table(table_id: str, user=Depends(require_permission("tables", "delete"))):
    active = await q_one("SELECT id FROM orders WHERE table_id=:t AND status='open'", t=table_id)
    if active:
        raise HTTPException(400, "Meja masih memiliki order terbuka")
    r = await q_exec("DELETE FROM tables WHERE id=:id", id=table_id)
    if r == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}
