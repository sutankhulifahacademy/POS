from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from routes.deps import *

router = APIRouter()


@router.get("/attendance/active")
async def active_attendance(user=Depends(get_current_user)):
    row = await q_one("SELECT * FROM attendance WHERE cashier_id=:c AND status='active' LIMIT 1", c=user["id"])
    return clean(row)


@router.get("/attendance")
async def list_attendance(
    user=Depends(get_current_user),
    limit: int = 100,
    cashier_id: Optional[str] = None,
    outlet_id: Optional[str] = None,
):
    where = ["1=1"]
    params = {"l": limit}

    if cashier_id:
        where.append("cashier_id = :c")
        params["c"] = cashier_id

    if outlet_id:
        if user["role"] != "owner" and outlet_id not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")
        where.append("outlet_id = :oid")
        params["oid"] = outlet_id
    elif user["role"] != "owner":
        user_outlets = user.get("outlet_ids", [])
        if user_outlets:
            ids_sql = ",".join(f"'{oid}'" for oid in user_outlets)
            where.append(f"outlet_id IN ({ids_sql})")
        else:
            where.append("1=0")

    where_clause = " AND ".join(where)
    rows = await q_all(f"""
        SELECT a.*, o.name AS outlet_name
        FROM attendance a
        LEFT JOIN outlets o ON o.id = a.outlet_id
        WHERE {where_clause}
        ORDER BY a.clock_in_at DESC LIMIT :l
    """, **params)
    return clean_list(rows)


@router.post("/attendance/clock-in")
async def clock_in(body: ClockInIn, user=Depends(get_current_user)):
    existing = await q_one("SELECT id FROM attendance WHERE cashier_id=:c AND status='active'", c=user["id"])
    if existing:
        raise HTTPException(400, "Anda sudah absen masuk. Absen keluar dulu.")
    # Determine outlet_id: from body, or from user's assigned outlet
    outlet_id = body.outlet_id
    if not outlet_id:
        user_outlets = user.get("outlet_ids", [])
        if user_outlets:
            outlet_id = user_outlets[0]
    aid = new_id()
    await q_exec("""INSERT INTO attendance (id, cashier_id, cashier_name, outlet_id, clock_in_at, clock_in_photo, clock_in_note, status)
                    VALUES (:id, :ci, :cn, :oid, NOW(), :p, :n, 'active')""",
                 id=aid, ci=user["id"], cn=user.get("name", ""), oid=_u(outlet_id),
                 p=body.photo or "", n=body.note or "")
    return clean(await q_one("SELECT * FROM attendance WHERE id=:id", id=aid))


@router.post("/attendance/clock-out")
async def clock_out(body: ClockOutIn, user=Depends(get_current_user)):
    active = await q_one("SELECT * FROM attendance WHERE cashier_id=:c AND status='active' LIMIT 1", c=user["id"])
    if not active:
        raise HTTPException(400, "Tidak ada absen aktif")
    duration = await q_one("""SELECT EXTRACT(EPOCH FROM (NOW() - clock_in_at))/60 AS mins
                              FROM attendance WHERE id=:id""", id=active["id"])
    mins = int(duration["mins"]) if duration else 0
    active_shift = await q_one("SELECT id FROM shifts WHERE cashier_id=:c AND status='open' LIMIT 1", c=user["id"])
    shift_id = str(active_shift["id"]) if active_shift else None
    await q_exec("""UPDATE attendance SET status='completed', clock_out_at=NOW(), clock_out_photo=:p,
                    clock_out_note=:n, duration_minutes=:d, shift_id=:sid WHERE id=:id""",
                 id=active["id"], p=body.photo or "", n=body.note or "", d=mins, sid=_u(shift_id))
    return clean(await q_one("SELECT * FROM attendance WHERE id=:id", id=active["id"]))
