"""Payment Accounts routes — CRUD untuk rekening bank tujuan transfer."""
from fastapi import APIRouter, HTTPException, Depends
from routes.deps import *

router = APIRouter()


@router.get("/payment-accounts")
async def list_payment_accounts(user=Depends(get_current_user)):
    rows = await q_all(
        "SELECT * FROM payment_accounts ORDER BY is_active DESC, bank_name ASC, created_at DESC"
    )
    return clean_list(rows)


@router.post("/payment-accounts")
async def create_payment_account(
    body: PaymentAccountCreate,
    user=Depends(require_role("admin", "manager")),
):
    aid = new_id()
    await q_exec(
        """INSERT INTO payment_accounts
             (id, bank_name, account_name, account_no, outlet_id, is_active, created_at, updated_at)
           VALUES (:id, :b, :an, :no, :o, :ia, NOW(), NOW())""",
        id=aid,
        b=body.bank_name,
        an=body.account_name,
        no=body.account_no,
        o=_u(body.outlet_id),
        ia=body.is_active,
    )
    return clean(await q_one("SELECT * FROM payment_accounts WHERE id=:id", id=aid))


@router.put("/payment-accounts/{account_id}")
async def update_payment_account(
    account_id: str,
    body: PaymentAccountUpdate,
    user=Depends(require_role("admin", "manager")),
):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No updates")
    if "outlet_id" in updates:
        updates["outlet_id"] = _u(updates["outlet_id"])
    sets = ", ".join(f"{k}=:{k}" for k in updates.keys())
    updates["id"] = account_id
    r = await q_exec(
        f"UPDATE payment_accounts SET {sets}, updated_at=NOW() WHERE id=:id",
        **updates,
    )
    if r == 0:
        raise HTTPException(404, "Payment account not found")
    return clean(await q_one("SELECT * FROM payment_accounts WHERE id=:id", id=account_id))


@router.delete("/payment-accounts/{account_id}")
async def delete_payment_account(
    account_id: str,
    user=Depends(require_role("admin", "manager")),
):
    r = await q_exec("DELETE FROM payment_accounts WHERE id=:id", id=account_id)
    if r == 0:
        raise HTTPException(404, "Payment account not found")
    return {"ok": True}
