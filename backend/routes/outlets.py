from fastapi import APIRouter, HTTPException, Depends
from routes.deps import *

router = APIRouter()

TABLE = "outlets"
MODEL = OutletIn
COLS = ["name", "address", "phone", "is_main"]
ROLES = ("admin", "manager")


@router.get("/outlets")
async def list_items(user=Depends(get_current_user)):
    # For admin, return all outlets. For others, return only their outlets.
    if user["role"] == "admin":
        rows = await q_all(f"SELECT * FROM {TABLE} ORDER BY created_at DESC NULLS LAST")
    else:
        outlet_ids = user.get("outlet_ids", [])
        if not outlet_ids:
            return []
        ids_sql = ",".join(f"'{oid}'" for oid in outlet_ids)
        rows = await q_all(f"SELECT * FROM {TABLE} WHERE id IN ({ids_sql}) ORDER BY created_at DESC NULLS LAST")
    return clean_list(rows)


@router.get("/outlets/my")
async def get_my_outlets(user=Depends(get_current_user)):
    """Get outlets the current user can access."""
    if user["role"] == "admin":
        rows = await q_all(f"SELECT * FROM {TABLE} ORDER BY is_main DESC, created_at")
        return {"outlets": clean_list(rows), "all_access": True}
    outlet_ids = user.get("outlet_ids", [])
    if not outlet_ids:
        return {"outlets": [], "all_access": False}
    ids_sql = ",".join(f"'{oid}'" for oid in outlet_ids)
    rows = await q_all(f"SELECT * FROM {TABLE} WHERE id IN ({ids_sql}) ORDER BY is_main DESC, created_at")
    return {"outlets": clean_list(rows), "all_access": False}


@router.post("/outlets")
async def create_item(body: MODEL, user=Depends(require_permission("outlets", "create"))):
    d = body.model_dump()
    d["id"] = new_id()
    col_list = ", ".join(["id"] + COLS + ["created_at"])
    val_list = ", ".join([":id"] + [f":{c}" for c in COLS] + ["NOW()"])
    await q_exec(f"INSERT INTO {TABLE} ({col_list}) VALUES ({val_list})", **{"id": d["id"], **{c: d.get(c) for c in COLS}})
    return clean(await q_one(f"SELECT * FROM {TABLE} WHERE id=:id", id=d["id"]))


@router.put("/outlets/{item_id}")
async def update_item(item_id: str, body: MODEL, user=Depends(require_permission("outlets", "update"))):
    d = body.model_dump()
    sets = ", ".join([f"{c}=:{c}" for c in COLS])
    r = await q_exec(f"UPDATE {TABLE} SET {sets}, updated_at=NOW() WHERE id=:id", id=item_id, **{c: d.get(c) for c in COLS})
    if r == 0:
        raise HTTPException(404, "Not found")
    return clean(await q_one(f"SELECT * FROM {TABLE} WHERE id=:id", id=item_id))


@router.delete("/outlets/{item_id}")
async def delete_item(item_id: str, user=Depends(require_permission("outlets", "delete"))):
    r = await q_exec(f"DELETE FROM {TABLE} WHERE id=:id", id=item_id)
    if r == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}
