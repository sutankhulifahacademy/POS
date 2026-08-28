from fastapi import APIRouter, HTTPException, Depends
from routes.deps import *

router = APIRouter()


@router.get("/business")
async def get_business(user=Depends(get_current_user)):
    return clean(await q_one("SELECT * FROM business LIMIT 1"))


@router.post("/business")
async def setup_business(body: BusinessIn, user=Depends(require_role("admin"))):
    existing = await q_one("SELECT id FROM business LIMIT 1")
    if existing:
        await q_exec("""UPDATE business SET name=:n, business_type=:bt, currency=:c, tax_rate=:t, address=:a, updated_at=NOW()
                        WHERE id=:id""", id=existing["id"], n=body.name, bt=body.business_type,
                     c=body.currency, t=body.tax_rate, a=body.address or "")
    else:
        await q_exec("""INSERT INTO business (id, name, business_type, currency, tax_rate, address, created_at)
                        VALUES (:id, :n, :bt, :c, :t, :a, NOW())""",
                     id=new_id(), n=body.name, bt=body.business_type, c=body.currency, t=body.tax_rate, a=body.address or "")
        # Seed main outlet if none
        cnt = await q_one("SELECT COUNT(*) AS c FROM outlets")
        if cnt["c"] == 0:
            await q_exec("""INSERT INTO outlets (id, name, address, phone, is_main, created_at)
                            VALUES (:id, 'Outlet Utama', :a, '', TRUE, NOW())""",
                         id=new_id(), a=body.address or "")
    return clean(await q_one("SELECT * FROM business LIMIT 1"))
