"""Employee Scheduling routes — shift planning per week."""
from typing import Optional
from routes.deps import *
from routes.audit_logs import log_action

router = APIRouter()

DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"]


@router.get("/schedules")
async def list_schedules(
    user=Depends(get_current_user),
    outlet_id: Optional[str] = None,
    day_of_week: Optional[int] = None,
):
    where = ["1=1"]
    params = {}
    if outlet_id:
        if user["role"] != "owner" and outlet_id not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")
        where.append("es.outlet_id = :oid")
        params["oid"] = outlet_id
    elif user["role"] != "owner":
        user_outlets = user.get("outlet_ids", [])
        if user_outlets:
            ids_sql = ",".join(f"'{oid}'" for oid in user_outlets)
            where.append(f"es.outlet_id IN ({ids_sql})")
        else:
            return []
    if day_of_week is not None:
        where.append("es.day_of_week = :dow")
        params["dow"] = day_of_week

    rows = await q_all(f"""
        SELECT es.*, o.name AS outlet_name, u.email, u.role AS user_role
        FROM employee_schedules es
        LEFT JOIN outlets o ON o.id = es.outlet_id
        LEFT JOIN users u ON u.id = es.user_id
        WHERE {' AND '.join(where)} AND es.is_active = TRUE
        ORDER BY es.day_of_week, es.start_time
    """, **params)
    result = []
    for r in rows:
        item = clean(r)
        item["day_name"] = DAYS[r["day_of_week"]] if r.get("day_of_week") is not None else ""
        result.append(item)
    return result


@router.post("/schedules")
async def create_schedule(body: dict, user=Depends(require_permission("schedules", "create"))):
    outlet_id = body.get("outlet_id")
    if not outlet_id:
        raise HTTPException(400, "outlet_id is required")
    if user["role"] != "owner" and outlet_id not in user.get("outlet_ids", []):
        raise HTTPException(403, "Tidak ada akses ke outlet ini")

    day_of_week = int(body.get("day_of_week", -1))
    if day_of_week < 0 or day_of_week > 6:
        raise HTTPException(400, "day_of_week must be 0-6 (0=Sunday)")

    # Get user info
    user_info = await q_one("SELECT name, role FROM users WHERE id = :uid", uid=body.get("user_id"))
    if not user_info:
        raise HTTPException(404, "User not found")

    sid = new_id()
    await q_exec("""
        INSERT INTO employee_schedules (id, outlet_id, user_id, user_name, day_of_week,
                                         start_time, end_time, role, is_active)
        VALUES (:id, :oid, :uid, :uname, :dow, :st, :et, :role, TRUE)
    """,
        id=sid, oid=outlet_id, uid=body.get("user_id"),
        uname=user_info["name"], dow=day_of_week,
        st=body.get("start_time"), et=body.get("end_time"),
        role=user_info["role"],
    )
    return clean(await q_one("SELECT * FROM employee_schedules WHERE id = :id", id=sid))


@router.put("/schedules/{schedule_id}")
async def update_schedule(schedule_id: str, body: dict, user=Depends(require_permission("schedules", "update"))):
    existing = await q_one("SELECT * FROM employee_schedules WHERE id = :id", id=schedule_id)
    if not existing:
        raise HTTPException(404, "Schedule not found")
    if user["role"] != "owner" and str(existing["outlet_id"]) not in user.get("outlet_ids", []):
        raise HTTPException(403, "Tidak ada akses ke outlet ini")

    allowed = ["start_time", "end_time", "day_of_week", "is_active"]
    updates = {k: v for k, v in body.items() if k in allowed and v is not None}
    if not updates:
        raise HTTPException(400, "No valid updates")

    sets = ", ".join(f"{k}=:{k}" for k in updates.keys())
    updates["id"] = schedule_id
    await q_exec(f"UPDATE employee_schedules SET {sets}, updated_at=NOW() WHERE id=:id", **updates)
    return clean(await q_one("SELECT * FROM employee_schedules WHERE id = :id", id=schedule_id))


@router.delete("/schedules/{schedule_id}")
async def delete_schedule(schedule_id: str, user=Depends(require_permission("schedules", "update"))):
    existing = await q_one("SELECT * FROM employee_schedules WHERE id = :id", id=schedule_id)
    if not existing:
        raise HTTPException(404, "Schedule not found")
    if user["role"] != "owner" and str(existing["outlet_id"]) not in user.get("outlet_ids", []):
        raise HTTPException(403, "Tidak ada akses ke outlet ini")
    await q_exec("DELETE FROM employee_schedules WHERE id = :id", id=schedule_id)
    return {"ok": True}
