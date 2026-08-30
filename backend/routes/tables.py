from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from routes.deps import *

router = APIRouter()


@router.get("/tables")
async def list_tables(user=Depends(get_current_user), outlet_id: Optional[str] = None):
    where = ["1=1"]
    params = {}
    if outlet_id:
        if user["role"] != "owner" and outlet_id not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")
        where.append("t.outlet_id = :oid")
        params["oid"] = outlet_id
    elif user["role"] != "owner":
        user_outlets = user.get("outlet_ids", [])
        if user_outlets:
            ids_sql = ",".join(f"'{oid}'" for oid in user_outlets)
            where.append(f"t.outlet_id IN ({ids_sql})")
        else:
            return []
    rows = await q_all(f"""SELECT t.*,
        (SELECT id FROM orders WHERE table_id=t.id AND status='open' LIMIT 1) AS active_order_id,
        COALESCE((SELECT total FROM orders WHERE table_id=t.id AND status='open' LIMIT 1), 0) AS active_order_total
        FROM tables t WHERE {' AND '.join(where)} ORDER BY name""", **params)
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
    outlet_filter = await filter_outlets_for_user(user)
    r = await q_exec(f"""UPDATE tables SET name=:n, capacity=:c, outlet_id=:oid, zone=:z, updated_at=NOW()
                        WHERE id=:id {outlet_filter}""", id=table_id, n=body.name, c=body.capacity,
                     oid=_u(body.outlet_id), z=body.zone or "Utama")
    if r == 0:
        raise HTTPException(404, "Not found")
    return clean(await q_one("SELECT * FROM tables WHERE id=:id", id=table_id))


@router.delete("/tables/{table_id}")
async def delete_table(table_id: str, user=Depends(require_permission("tables", "delete"))):
    active = await q_one("SELECT id FROM orders WHERE table_id=:t AND status='open'", t=table_id)
    if active:
        raise HTTPException(400, "Meja masih memiliki order terbuka")
    outlet_filter = await filter_outlets_for_user(user)
    r = await q_exec(f"DELETE FROM tables WHERE id=:id {outlet_filter}", id=table_id)
    if r == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}
