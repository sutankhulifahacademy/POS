"""Payment Accounts routes — CRUD untuk rekening bank tujuan transfer."""
from fastapi import APIRouter, HTTPException, Depends
from routes.deps import *

router = APIRouter()


@router.get("/payment-accounts")
async def list_payment_accounts(
    user=Depends(get_current_user),
    outlet_id: Optional[str] = None,
):
    # Authorization: non-owner can only access assigned outlets
    if outlet_id and user["role"] != "owner" and outlet_id not in user.get("outlet_ids", []):
        raise HTTPException(403, "Tidak ada akses ke outlet ini")
    if outlet_id:
        rows = await q_all(
            "SELECT * FROM payment_accounts WHERE outlet_id = :oid ORDER BY is_active DESC, bank_name ASC, created_at DESC",
            oid=outlet_id,
        )
    elif user["role"] != "owner":
        # Non-owner: filter to assigned outlets
        user_outlets = user.get("outlet_ids", [])
        if user_outlets:
            ids_sql = ",".join(f"'{oid}'" for oid in user_outlets)
            rows = await q_all(
                f"SELECT * FROM payment_accounts WHERE outlet_id IN ({ids_sql}) ORDER BY is_active DESC, bank_name ASC, created_at DESC"
            )
        else:
            rows = []
    else:
        rows = await q_all(
            "SELECT * FROM payment_accounts ORDER BY is_active DESC, bank_name ASC, created_at DESC"
        )

    # F3: Only users with payment_accounts.view (or owner/admin/manager) may see
    # full account numbers. Cashiers get operational info (bank, account name,
    # outlet, active status) without the sensitive account number.
    can_view_sensitive = (
        user["role"] in ("owner", "admin", "manager")
        or await has_permission(user, "payment_accounts", "view")
    )
    if not can_view_sensitive:
        for row in rows:
            row.pop("account_no", None)

    return clean_list(rows)


@router.post("/payment-accounts")
async def create_payment_account(
    body: PaymentAccountCreate,
    user=Depends(require_permission("payment_accounts", "create")),
):
    # Outlet authorization — prevent cross-outlet account creation
    outlet_id = _u(body.outlet_id)
    if outlet_id and user["role"] != "owner" and str(outlet_id) not in user.get("outlet_ids", []):
        raise HTTPException(403, "Tidak ada akses ke outlet ini")
    aid = new_id()
    await q_exec(
        """INSERT INTO payment_accounts
             (id, bank_name, account_name, account_no, outlet_id, is_active, created_at, updated_at)
           VALUES (:id, :b, :an, :no, :o, :ia, NOW(), NOW())""",
        id=aid,
        b=body.bank_name,
        an=body.account_name,
        no=body.account_no,
        o=outlet_id,
        ia=body.is_active,
    )
    return clean(await q_one("SELECT * FROM payment_accounts WHERE id=:id", id=aid))


@router.put("/payment-accounts/{account_id}")
async def update_payment_account(
    account_id: str,
    body: PaymentAccountUpdate,
    user=Depends(require_permission("payment_accounts", "update")),
):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No updates")
    if "outlet_id" in updates:
        new_oid = _u(updates["outlet_id"])
        # Validate outlet access for the new outlet_id
        if new_oid and user["role"] != "owner" and str(new_oid) not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")
        updates["outlet_id"] = new_oid
    sets = ", ".join(f"{k}=:{k}" for k in updates.keys())
    updates["id"] = account_id
    outlet_filter = await filter_outlets_for_user(user)
    r = await q_exec(
        f"UPDATE payment_accounts SET {sets}, updated_at=NOW() WHERE id=:id {outlet_filter}",
        **updates,
    )
    if r == 0:
        raise HTTPException(404, "Payment account not found")
    return clean(await q_one("SELECT * FROM payment_accounts WHERE id=:id", id=account_id))


@router.delete("/payment-accounts/{account_id}")
async def delete_payment_account(
    account_id: str,
    user=Depends(require_permission("payment_accounts", "delete")),
):
    outlet_filter = await filter_outlets_for_user(user)
    r = await q_exec(f"DELETE FROM payment_accounts WHERE id=:id {outlet_filter}", id=account_id)
    if r == 0:
        raise HTTPException(404, "Payment account not found")
    return {"ok": True}
