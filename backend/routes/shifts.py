from fastapi import APIRouter, HTTPException, Depends
from routes.deps import *

router = APIRouter()


@router.get("/shifts/active")
async def active_shift(user=Depends(get_current_user)):
    return clean(await q_one("SELECT * FROM shifts WHERE cashier_id=:c AND status='open' LIMIT 1", c=user["id"]))


@router.get("/shifts")
async def list_shifts(user=Depends(get_current_user), limit: int = 100):
    rows = await q_all("SELECT * FROM shifts ORDER BY opened_at DESC LIMIT :l", l=limit)
    return clean_list(rows)


@router.post("/shifts/open")
async def open_shift(body: ShiftOpenIn, user=Depends(get_current_user)):
    existing = await q_one("SELECT id FROM shifts WHERE cashier_id=:c AND status='open'", c=user["id"])
    if existing:
        raise HTTPException(400, "Shift already open")
    sid = new_id()
    await q_exec("""INSERT INTO shifts (id, cashier_id, cashier_name, outlet_id, opening_cash, status, opened_at, note)
                    VALUES (:id, :ci, :cn, :oid, :cash, 'open', NOW(), :note)""",
                 id=sid, ci=user["id"], cn=user.get("name", ""), oid=_u(body.outlet_id),
                 cash=body.opening_cash, note=body.note or "")
    return clean(await q_one("SELECT * FROM shifts WHERE id=:id", id=sid))


@router.post("/shifts/close")
async def close_shift(body: ShiftCloseIn, user=Depends(get_current_user)):
    shift = await q_one("SELECT * FROM shifts WHERE cashier_id=:c AND status='open' LIMIT 1", c=user["id"])
    if not shift:
        raise HTTPException(400, "No open shift")
    agg = await q_one("""SELECT
        COALESCE(SUM(CASE WHEN payment_method='cash' THEN total ELSE 0 END), 0) AS cash_sales,
        COALESCE(SUM(CASE WHEN payment_method<>'cash' THEN total ELSE 0 END), 0) AS non_cash_sales,
        COUNT(*) AS cnt FROM sales WHERE shift_id=:sid""", sid=shift["id"])
    expected = float(shift["opening_cash"]) + float(agg["cash_sales"])
    diff = body.actual_cash - expected
    await q_exec("""UPDATE shifts SET status='closed', closed_at=NOW(), actual_cash=:ac, expected_cash=:ec,
                    difference=:d, cash_sales=:cs, non_cash_sales=:ncs, transaction_count=:tc, close_note=:cn
                    WHERE id=:id""",
                 id=shift["id"], ac=body.actual_cash, ec=expected, d=diff,
                 cs=float(agg["cash_sales"]), ncs=float(agg["non_cash_sales"]),
                 tc=agg["cnt"], cn=body.note or "")
    return clean(await q_one("SELECT * FROM shifts WHERE id=:id", id=shift["id"]))
