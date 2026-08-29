from fastapi import APIRouter, HTTPException, Depends
from routes.deps import *

router = APIRouter()


@router.get("/business")
async def get_business():
    """Public endpoint — business profile is needed on login page too."""
    return clean(await q_one("SELECT * FROM business LIMIT 1"))


@router.post("/business")
async def setup_business(body: BusinessIn, user=Depends(require_role("admin"))):
    existing = await q_one("SELECT id FROM business LIMIT 1")
    if existing:
        await q_exec("""UPDATE business SET name=:n, business_type=:bt, currency=:c, tax_rate=:t, address=:a,
                        logo_url=:lu, primary_color=:pc, secondary_color=:sc, bg_color=:bg, card_bg_color=:cbc, sidebar_bg_color=:sbc,
                        updated_at=NOW() WHERE id=:id""",
                     id=existing["id"], n=body.name, bt=body.business_type, c=body.currency, t=body.tax_rate,
                     a=body.address or "", lu=body.logo_url or "", pc=body.primary_color or "#F4C842",
                     sc=body.secondary_color or "#C4A484", bg=body.bg_color or "#1A0810",
                     cbc=body.card_bg_color or "#331419", sbc=body.sidebar_bg_color or "#2A1015")
    else:
        await q_exec("""INSERT INTO business (id, name, business_type, currency, tax_rate, address, logo_url,
                        primary_color, secondary_color, bg_color, card_bg_color, sidebar_bg_color, created_at)
                        VALUES (:id, :n, :bt, :c, :t, :a, :lu, :pc, :sc, :bg, :cbc, :sbc, NOW())""",
                     id=new_id(), n=body.name, bt=body.business_type, c=body.currency, t=body.tax_rate, a=body.address or "",
                     lu=body.logo_url or "", pc=body.primary_color or "#F4C842", sc=body.secondary_color or "#C4A484",
                     bg=body.bg_color or "#1A0810", cbc=body.card_bg_color or "#331419", sbc=body.sidebar_bg_color or "#2A1015")
        # Seed main outlet if none
        cnt = await q_one("SELECT COUNT(*) AS c FROM outlets")
        if cnt["c"] == 0:
            await q_exec("""INSERT INTO outlets (id, name, address, phone, is_main, created_at)
                            VALUES (:id, 'Outlet Utama', :a, '', TRUE, NOW())""",
                         id=new_id(), a=body.address or "")
    return clean(await q_one("SELECT * FROM business LIMIT 1"))
