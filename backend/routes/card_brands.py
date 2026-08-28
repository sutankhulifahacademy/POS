"""Card Brands routes — daftar bank/brand untuk pembayaran kartu."""
from fastapi import APIRouter, HTTPException, Depends
from routes.deps import *

router = APIRouter()


@router.get("/card-brands")
async def list_card_brands(user=Depends(get_current_user)):
    rows = await q_all(
        "SELECT * FROM card_brands WHERE is_active=TRUE ORDER BY name ASC"
    )
    return clean_list(rows)


@router.post("/card-brands")
async def create_card_brand(body: CardBrandCreate, user=Depends(get_current_user)):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Nama bank/brand tidak boleh kosong")
    existing = await q_one("SELECT id FROM card_brands WHERE name=:n", n=name)
    if existing:
        return clean(existing)
    bid = new_id()
    await q_exec(
        "INSERT INTO card_brands (id, name, is_active, created_at) VALUES (:id, :n, TRUE, NOW())",
        id=bid, n=name,
    )
    return clean(await q_one("SELECT * FROM card_brands WHERE id=:id", id=bid))
