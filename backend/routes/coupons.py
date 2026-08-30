"""Coupons routes — discount/coupon management."""
from typing import Optional
from routes.deps import *
from routes.audit_logs import log_action
from datetime import date, datetime

router = APIRouter()


@router.get("/coupons")
async def list_coupons(
    user=Depends(get_current_user),
    outlet_id: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = 100,
):
    where = ["1=1"]
    params = {"l": limit}
    if outlet_id:
        if user["role"] != "owner" and outlet_id not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")
        where.append("c.outlet_id = :oid")
        params["oid"] = outlet_id
    elif user["role"] != "owner":
        user_outlets = user.get("outlet_ids", [])
        if user_outlets:
            ids_sql = ",".join(f"'{oid}'" for oid in user_outlets)
            where.append(f"c.outlet_id IN ({ids_sql})")
        else:
            return []
    if is_active is not None:
        where.append("c.is_active = :ia")
        params["ia"] = is_active

    rows = await q_all(f"""
        SELECT c.*, o.name AS outlet_name
        FROM coupons c
        LEFT JOIN outlets o ON o.id = c.outlet_id
        WHERE {' AND '.join(where)}
        ORDER BY c.created_at DESC LIMIT :l
    """, **params)
    return clean_list(rows)


@router.post("/coupons")
async def create_coupon(body: dict, user=Depends(require_permission("coupons", "create"))):
    outlet_id = body.get("outlet_id")
    if not outlet_id:
        raise HTTPException(400, "outlet_id is required")
    if user["role"] != "owner" and outlet_id not in user.get("outlet_ids", []):
        raise HTTPException(403, "Tidak ada akses ke outlet ini")

    code = (body.get("code") or "").upper().strip()
    if not code:
        raise HTTPException(400, "code is required")

    # Check unique
    existing = await q_one("SELECT id FROM coupons WHERE code = :code AND outlet_id = :oid",
                           code=code, oid=outlet_id)
    if existing:
        raise HTTPException(400, "Kupon dengan kode ini sudah ada")

    discount_type = body.get("discount_type", "percentage")
    if discount_type not in ("percentage", "fixed"):
        raise HTTPException(400, "discount_type must be percentage or fixed")

    start_date = body.get("start_date")
    end_date = body.get("end_date")
    if isinstance(start_date, str):
        start_date = datetime.strptime(start_date, "%Y-%m-%d").date()
    if isinstance(end_date, str):
        end_date = datetime.strptime(end_date, "%Y-%m-%d").date()

    cid = new_id()
    await q_exec("""
        INSERT INTO coupons (id, outlet_id, code, description, discount_type, discount_value,
                             min_purchase, max_discount, start_date, end_date, usage_limit, is_active, created_by)
        VALUES (:id, :oid, :code, :desc, :dt, :dv, :mp, :md, :sd, :ed, :ul, :ia, :cb)
    """,
        id=cid, oid=outlet_id, code=code, desc=body.get("description", ""),
        dt=discount_type, dv=body.get("discount_value", 0),
        mp=body.get("min_purchase", 0), md=body.get("max_discount"),
        sd=start_date, ed=end_date, ul=body.get("usage_limit"),
        ia=body.get("is_active", True), cb=user["id"],
    )

    await log_action(user, "create", "coupon", entity_id=str(cid), outlet_id=outlet_id, new_value=body)
    return clean(await q_one("SELECT * FROM coupons WHERE id = :id", id=cid))


@router.put("/coupons/{coupon_id}")
async def update_coupon(coupon_id: str, body: dict, user=Depends(require_permission("coupons", "update"))):
    existing = await q_one("SELECT * FROM coupons WHERE id = :id", id=coupon_id)
    if not existing:
        raise HTTPException(404, "Coupon not found")
    if user["role"] != "owner" and str(existing["outlet_id"]) not in user.get("outlet_ids", []):
        raise HTTPException(403, "Tidak ada akses ke outlet ini")

    allowed = ["description", "discount_value", "min_purchase", "max_discount",
               "start_date", "end_date", "usage_limit", "is_active"]
    updates = {k: v for k, v in body.items() if k in allowed and v is not None}
    if not updates:
        raise HTTPException(400, "No valid updates")

    sets = ", ".join(f"{k}=:{k}" for k in updates.keys())
    updates["id"] = coupon_id
    await q_exec(f"UPDATE coupons SET {sets} WHERE id=:id", **updates)
    return clean(await q_one("SELECT * FROM coupons WHERE id = :id", id=coupon_id))


@router.delete("/coupons/{coupon_id}")
async def delete_coupon(coupon_id: str, user=Depends(require_permission("coupons", "delete"))):
    existing = await q_one("SELECT * FROM coupons WHERE id = :id", id=coupon_id)
    if not existing:
        raise HTTPException(404, "Coupon not found")
    if user["role"] != "owner" and str(existing["outlet_id"]) not in user.get("outlet_ids", []):
        raise HTTPException(403, "Tidak ada akses ke outlet ini")
    await q_exec("DELETE FROM coupons WHERE id = :id", id=coupon_id)
    return {"ok": True}


@router.post("/coupons/validate")
async def validate_coupon(body: dict, user=Depends(get_current_user)):
    """Validate a coupon code and return discount amount."""
    code = (body.get("code") or "").upper().strip()
    outlet_id = body.get("outlet_id")
    purchase_amount = float(body.get("purchase_amount", 0))

    coupon = await q_one("""
        SELECT * FROM coupons
        WHERE code = :code AND outlet_id = :oid AND is_active = TRUE
    """, code=code, oid=outlet_id)

    if not coupon:
        raise HTTPException(404, "Kupon tidak ditemukan atau tidak aktif")

    today = date.today()
    if today < coupon["start_date"] or today > coupon["end_date"]:
        raise HTTPException(400, "Kupon sudah kedaluwarsa")

    if coupon["usage_limit"] and coupon["usage_count"] >= coupon["usage_limit"]:
        raise HTTPException(400, "Kupon sudah mencapai batas penggunaan")

    if purchase_amount < float(coupon["min_purchase"] or 0):
        raise HTTPException(400, f"Minimal pembelian {coupon['min_purchase']}")

    if coupon["discount_type"] == "percentage":
        discount = purchase_amount * float(coupon["discount_value"] or 0) / 100
        if coupon["max_discount"]:
            discount = min(discount, float(coupon["max_discount"]))
    else:
        discount = float(coupon["discount_value"] or 0)

    return {
        "valid": True,
        "coupon_id": str(coupon["id"]),
        "code": coupon["code"],
        "discount_amount": round(discount, 2),
        "discount_type": coupon["discount_type"],
        "discount_value": float(coupon["discount_value"]),
    }
