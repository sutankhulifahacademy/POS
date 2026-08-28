from fastapi import APIRouter, HTTPException, Depends
from routes.deps import *

router = APIRouter()

TABLE = "customers"
MODEL = CustomerIn
COLS = ["name", "phone", "email", "address"]
ROLES = ("admin", "manager", "kasir")


@router.get("/customers")
async def list_items(user=Depends(get_current_user)):
    rows = await q_all(f"SELECT * FROM {TABLE} ORDER BY created_at DESC NULLS LAST")
    return clean_list(rows)


@router.post("/customers")
async def create_item(body: MODEL, user=Depends(require_role(*ROLES))):
    d = body.model_dump()
    d["id"] = new_id()
    col_list = ", ".join(["id"] + COLS + ["created_at"])
    val_list = ", ".join([":id"] + [f":{c}" for c in COLS] + ["NOW()"])
    await q_exec(f"INSERT INTO {TABLE} ({col_list}) VALUES ({val_list})", **{"id": d["id"], **{c: d.get(c) for c in COLS}})
    return clean(await q_one(f"SELECT * FROM {TABLE} WHERE id=:id", id=d["id"]))


@router.put("/customers/{item_id}")
async def update_item(item_id: str, body: MODEL, user=Depends(require_role(*ROLES))):
    d = body.model_dump()
    sets = ", ".join([f"{c}=:{c}" for c in COLS])
    r = await q_exec(f"UPDATE {TABLE} SET {sets}, updated_at=NOW() WHERE id=:id", id=item_id, **{c: d.get(c) for c in COLS})
    if r == 0:
        raise HTTPException(404, "Not found")
    return clean(await q_one(f"SELECT * FROM {TABLE} WHERE id=:id", id=item_id))


@router.delete("/customers/{item_id}")
async def delete_item(item_id: str, user=Depends(require_role(*ROLES))):
    r = await q_exec(f"DELETE FROM {TABLE} WHERE id=:id", id=item_id)
    if r == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}
