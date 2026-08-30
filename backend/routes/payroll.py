"""Payroll routes — salary calculation per period."""
from typing import Optional
from routes.deps import *
from routes.audit_logs import log_action
from datetime import date, datetime

router = APIRouter()


@router.get("/payroll/periods")
async def list_payroll_periods(
    user=Depends(get_current_user),
    outlet_id: Optional[str] = None,
    limit: int = 50,
):
    where = ["1=1"]
    params = {"l": limit}
    if outlet_id:
        if user["role"] != "owner" and outlet_id not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")
        where.append("pp.outlet_id = :oid")
        params["oid"] = outlet_id
    elif user["role"] != "owner":
        user_outlets = user.get("outlet_ids", [])
        if user_outlets:
            ids_sql = ",".join(f"'{oid}'" for oid in user_outlets)
            where.append(f"pp.outlet_id IN ({ids_sql})")
        else:
            return []

    rows = await q_all(f"""
        SELECT pp.*, o.name AS outlet_name,
               (SELECT COUNT(*) FROM payroll_items pi WHERE pi.payroll_period_id = pp.id) AS item_count
        FROM payroll_periods pp
        LEFT JOIN outlets o ON o.id = pp.outlet_id
        WHERE {' AND '.join(where)}
        ORDER BY pp.start_date DESC LIMIT :l
    """, **params)
    return clean_list(rows)


@router.post("/payroll/periods")
async def create_payroll_period(body: dict, user=Depends(require_permission("payroll", "create"))):
    outlet_id = body.get("outlet_id")
    if not outlet_id:
        raise HTTPException(400, "outlet_id is required")
    if user["role"] != "owner" and outlet_id not in user.get("outlet_ids", []):
        raise HTTPException(403, "Tidak ada akses ke outlet ini")

    start_date = body.get("start_date")
    end_date = body.get("end_date")
    if isinstance(start_date, str):
        start_date = datetime.strptime(start_date, "%Y-%m-%d").date()
    if isinstance(end_date, str):
        end_date = datetime.strptime(end_date, "%Y-%m-%d").date()

    pid = new_id()
    await q_exec("""
        INSERT INTO payroll_periods (id, outlet_id, period_name, start_date, end_date, status)
        VALUES (:id, :oid, :pn, :sd, :ed, 'draft')
    """, id=pid, oid=outlet_id, pn=body.get("period_name", f"{start_date} to {end_date}"),
         sd=start_date, ed=end_date)

    return clean(await q_one("SELECT * FROM payroll_periods WHERE id = :id", id=pid))


@router.post("/payroll/periods/{period_id}/process")
async def process_payroll(period_id: str, user=Depends(require_permission("payroll", "update"))):
    """Process payroll: calculate salary for all employees in the period."""
    period = await q_one("SELECT * FROM payroll_periods WHERE id = :id", id=period_id)
    if not period:
        raise HTTPException(404, "Period not found")
    if user["role"] != "owner" and str(period["outlet_id"]) not in user.get("outlet_ids", []):
        raise HTTPException(403, "Tidak ada akses ke outlet ini")

    # Get all employees assigned to this outlet
    employees = await q_all("""
        SELECT u.id, u.name, u.role, u.job_title
        FROM users u
        JOIN user_outlet_access uoa ON uoa.user_id = u.id
        WHERE uoa.outlet_id = :oid AND u.is_active = TRUE
    """, oid=period["outlet_id"])

    # Clear existing items
    await q_exec("DELETE FROM payroll_items WHERE payroll_period_id = :pid", pid=period_id)

    total_pay = 0
    for emp in employees:
        # Count attendance days
        attendance = await q_one("""
            SELECT COUNT(DISTINCT DATE(clock_in_at)) AS days
            FROM attendance
            WHERE cashier_id = :uid
              AND clock_in_at >= :sd AND clock_in_at < :ed
              AND status = 'completed'
        """, uid=emp["id"], sd=period["start_date"], ed=period["end_date"])

        days = int(attendance["days"] or 0) if attendance else 0

        # Base salary by role (default values)
        base_salary = {
            "owner": 15000000,
            "admin": 10000000,
            "manager": 7000000,
            "supervisor": 5000000,
            "kasir": 3500000,
        }.get(emp["role"], 3000000)

        # Attendance bonus: 50000 per day for perfect attendance (22+ days)
        attendance_bonus = 500000 if days >= 22 else (days * 25000)

        # Deductions: missing days
        expected_days = 22
        deductions = max(0, (expected_days - days)) * 100000

        net_pay = base_salary + attendance_bonus - deductions
        total_pay += net_pay

        piid = new_id()
        await q_exec("""
            INSERT INTO payroll_items (id, payroll_period_id, user_id, user_name, outlet_id,
                                        base_salary, attendance_days, attendance_bonus, deductions, net_pay)
            VALUES (:id, :pid, :uid, :uname, :oid, :bs, :ad, :ab, :ded, :np)
        """,
            id=piid, pid=period_id, uid=emp["id"], uname=emp["name"],
            oid=period["outlet_id"], bs=base_salary, ad=days,
            ab=attendance_bonus, ded=deductions, np=net_pay,
        )

    # Mark as processed
    await q_exec("UPDATE payroll_periods SET status = 'processed', processed_at = NOW() WHERE id = :id",
                 id=period_id)

    return {
        "ok": True,
        "employees": len(employees),
        "total_pay": total_pay,
        "period_id": str(period_id),
    }


@router.get("/payroll/periods/{period_id}/items")
async def get_payroll_items(period_id: str, user=Depends(get_current_user)):
    period = await q_one("SELECT * FROM payroll_periods WHERE id = :id", id=period_id)
    if not period:
        raise HTTPException(404, "Period not found")
    if user["role"] != "owner" and str(period["outlet_id"]) not in user.get("outlet_ids", []):
        raise HTTPException(403, "Tidak ada akses ke outlet ini")

    rows = await q_all("""
        SELECT pi.*, u.role, u.email, u.job_title
        FROM payroll_items pi
        LEFT JOIN users u ON u.id = pi.user_id
        WHERE pi.payroll_period_id = :pid
        ORDER BY pi.net_pay DESC
    """, pid=period_id)
    return clean_list(rows)
