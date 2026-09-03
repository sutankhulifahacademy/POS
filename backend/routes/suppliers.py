from fastapi import APIRouter, HTTPException, Depends
from routes.deps import *

router = APIRouter()

TABLE = "suppliers"
MODEL = SupplierIn
COLS = ["name", "contact_person", "phone", "email", "address"]
ROLES = ("admin", "manager")


@router.get("/suppliers")
async def list_items(user=Depends(get_current_user)):
    rows = await q_all(f"SELECT * FROM {TABLE} ORDER BY created_at DESC NULLS LAST")

    # F6: Suppliers are global master data, but contact details are sensitive.
    # Cashiers without suppliers.view permission may see supplier names (for
    # operational awareness) but must not enumerate phone/email/address/contact.
    can_view_sensitive = (
        user["role"] in ("owner", "admin", "manager")
        or await has_permission(user, "suppliers", "view")
    )
    if not can_view_sensitive:
        sensitive_fields = ["contact_person", "phone", "email", "address"]
        for row in rows:
            for f in sensitive_fields:
                row.pop(f, None)

    return clean_list(rows)


@router.post("/suppliers")
async def create_item(body: MODEL, user=Depends(require_permission("suppliers", "create"))):
    d = body.model_dump()
    d["id"] = new_id()
    col_list = ", ".join(["id"] + COLS + ["created_at"])
    val_list = ", ".join([":id"] + [f":{c}" for c in COLS] + ["NOW()"])
    await q_exec(f"INSERT INTO {TABLE} ({col_list}) VALUES ({val_list})", **{"id": d["id"], **{c: d.get(c) for c in COLS}})
    return clean(await q_one(f"SELECT * FROM {TABLE} WHERE id=:id", id=d["id"]))


@router.put("/suppliers/{item_id}")
async def update_item(item_id: str, body: MODEL, user=Depends(require_permission("suppliers", "update"))):
    d = body.model_dump()
    sets = ", ".join([f"{c}=:{c}" for c in COLS])
    r = await q_exec(f"UPDATE {TABLE} SET {sets}, updated_at=NOW() WHERE id=:id", id=item_id, **{c: d.get(c) for c in COLS})
    if r == 0:
        raise HTTPException(404, "Not found")
    return clean(await q_one(f"SELECT * FROM {TABLE} WHERE id=:id", id=item_id))


@router.delete("/suppliers/{item_id}")
async def delete_item(item_id: str, user=Depends(require_permission("suppliers", "delete"))):
    r = await q_exec(f"DELETE FROM {TABLE} WHERE id=:id", id=item_id)
    if r == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}
