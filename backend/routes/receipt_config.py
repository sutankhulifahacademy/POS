"""Receipt/Invoice Customization routes — per outlet branding."""
from typing import Optional
from routes.deps import *
from routes.audit_logs import log_action

router = APIRouter()


@router.get("/receipt-config/{outlet_id}")
async def get_receipt_config(outlet_id: str, user=Depends(get_current_user)):
    """Get receipt customization for an outlet."""
    if user["role"] != "owner" and outlet_id not in user.get("outlet_ids", []):
        raise HTTPException(403, "Tidak ada akses ke outlet ini")
    row = await q_one("""
        SELECT id, name, address, phone,
               receipt_header, receipt_footer, receipt_logo,
               receipt_show_cashier, receipt_show_shift,
               receipt_paper_width, receipt_font_size,
               tax_enabled, tax_rate, tax_name, tax_inclusive,
               service_charge_enabled, service_charge_rate
        FROM outlets WHERE id = :oid
    """, oid=outlet_id)
    if not row:
        raise HTTPException(404, "Outlet not found")
    return clean(row)


@router.put("/receipt-config/{outlet_id}")
async def update_receipt_config(
    outlet_id: str,
    body: dict,
    user=Depends(require_permission("receipt", "update")),
):
    """Update receipt customization."""
    if user["role"] != "owner" and outlet_id not in user.get("outlet_ids", []):
        raise HTTPException(403, "Tidak ada akses ke outlet ini")

    allowed = [
        "receipt_header", "receipt_footer", "receipt_logo",
        "receipt_show_cashier", "receipt_show_shift",
        "receipt_paper_width", "receipt_font_size",
        "tax_enabled", "tax_rate", "tax_name", "tax_inclusive",
        "service_charge_enabled", "service_charge_rate",
    ]
    updates = {k: v for k, v in body.items() if k in allowed and v is not None}
    if not updates:
        raise HTTPException(400, "No valid updates")

    sets = ", ".join(f"{k}=:{k}" for k in updates.keys())
    updates["oid"] = outlet_id
    r = await q_exec(f"UPDATE outlets SET {sets} WHERE id=:oid", **updates)
    if r == 0:
        raise HTTPException(404, "Outlet not found")

    await log_action(user, "update", "receipt_config", entity_id=outlet_id,
                     outlet_id=outlet_id, new_value=body)

    row = await q_one("SELECT * FROM outlets WHERE id = :oid", oid=outlet_id)
    return clean(row)
