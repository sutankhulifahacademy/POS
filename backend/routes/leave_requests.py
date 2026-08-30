"""Leave Requests routes — cuti/izin management."""
from typing import Optional
from routes.deps import *
from routes.audit_logs import log_action
from datetime import date, datetime

router = APIRouter()


@router.get("/leave-requests")
async def list_leave_requests(
    user=Depends(get_current_user),
    limit: int = 100,
    status: Optional[str] = None,
    outlet_id: Optional[str] = None,
    my_only: bool = False,
):
    """List leave requests. Owner/admin see all, others see their own or their outlet's."""
    where = ["1=1"]
    params = {"l": limit}

    if my_only:
        where.append("lr.user_id = :uid")
        params["uid"] = user["id"]
    elif outlet_id:
        if user["role"] not in ("owner", "admin") and outlet_id not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")
        where.append("lr.outlet_id = :oid")
        params["oid"] = outlet_id
    elif user["role"] not in ("owner", "admin"):
        user_outlets = user.get("outlet_ids", [])
        if user_outlets:
            ids_sql = ",".join(f"'{oid}'" for oid in user_outlets)
            where.append(f"lr.outlet_id IN ({ids_sql})")
        else:
            where.append("lr.user_id = :uid")
            params["uid"] = user["id"]

    if status:
        where.append("lr.status = :status")
        params["status"] = status

    where_clause = " AND ".join(where)
    rows = await q_all(f"""
        SELECT lr.*, o.name AS outlet_name
        FROM leave_requests lr
        LEFT JOIN outlets o ON o.id = lr.outlet_id
        WHERE {where_clause}
        ORDER BY lr.created_at DESC LIMIT :l
    """, **params)
    return clean_list(rows)


@router.post("/leave-requests")
async def create_leave_request(
    body: dict,
    user=Depends(get_current_user),
):
    """Submit a new leave request."""
    leave_type = body.get("leave_type", "izin")
    if leave_type not in ("cuti", "sakit", "izin", "dinas_luar"):
        raise HTTPException(400, "Invalid leave_type. Must be: cuti, sakit, izin, dinas_luar")

    start_date = body.get("start_date")
    end_date = body.get("end_date")
    if not start_date or not end_date:
        raise HTTPException(400, "start_date and end_date are required")

    # Parse dates
    if isinstance(start_date, str):
        start_date = datetime.strptime(start_date, "%Y-%m-%d").date()
    if isinstance(end_date, str):
        end_date = datetime.strptime(end_date, "%Y-%m-%d").date()

    # Get user's primary outlet
    outlet_id = body.get("outlet_id")
    if not outlet_id and user["role"] != "owner":
        user_outlets = user.get("outlet_ids", [])
        if user_outlets:
            outlet_id = user_outlets[0]

    lid = new_id()
    await q_exec("""
        INSERT INTO leave_requests (id, user_id, user_name, outlet_id, leave_type,
                                    start_date, end_date, reason, status)
        VALUES (:id, :uid, :uname, :oid, :ltype, :sd, :ed, :reason, 'pending')
    """,
        id=lid, uid=user["id"], uname=user.get("name", ""),
        oid=_u(outlet_id), ltype=leave_type,
        sd=start_date, ed=end_date,
        reason=body.get("reason", ""),
    )

    await log_action(user, "create", "leave_request", entity_id=str(lid),
                     outlet_id=outlet_id, new_value=body)

    row = await q_one("SELECT * FROM leave_requests WHERE id = :id", id=lid)
    return clean(row)


@router.put("/leave-requests/{request_id}/approve")
async def approve_leave_request(
    request_id: str,
    body: dict,
    user=Depends(require_permission("attendance", "update")),
):
    """Approve a leave request (owner/admin/manager)."""
    existing = await q_one("SELECT * FROM leave_requests WHERE id = :id", id=request_id)
    if not existing:
        raise HTTPException(404, "Leave request not found")

    if existing["status"] != "pending":
        raise HTTPException(400, f"Cannot approve request with status: {existing['status']}")

    if user["role"] not in ("owner", "admin"):
        if str(existing.get("outlet_id") or "") not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")

    outlet_filter = await filter_outlets_for_user(user)
    await q_exec(f"""
        UPDATE leave_requests SET status = 'approved', approved_by = :aid,
               approved_by_name = :aname, approved_at = NOW(), updated_at = NOW()
        WHERE id = :id {outlet_filter}
    """, id=request_id, aid=user["id"], aname=user.get("name", ""))

    await log_action(user, "approve", "leave_request", entity_id=request_id,
                     outlet_id=str(existing.get("outlet_id") or ""), new_value={"status": "approved"})

    return clean(await q_one("SELECT * FROM leave_requests WHERE id = :id", id=request_id))


@router.put("/leave-requests/{request_id}/reject")
async def reject_leave_request(
    request_id: str,
    body: dict,
    user=Depends(require_permission("attendance", "update")),
):
    """Reject a leave request."""
    existing = await q_one("SELECT * FROM leave_requests WHERE id = :id", id=request_id)
    if not existing:
        raise HTTPException(404, "Leave request not found")

    if existing["status"] != "pending":
        raise HTTPException(400, f"Cannot reject request with status: {existing['status']}")

    if user["role"] not in ("owner", "admin"):
        if str(existing.get("outlet_id") or "") not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")

    outlet_filter = await filter_outlets_for_user(user)
    await q_exec(f"""
        UPDATE leave_requests SET status = 'rejected', approved_by = :aid,
               approved_by_name = :aname, approved_at = NOW(),
               rejection_reason = :reason, updated_at = NOW()
        WHERE id = :id {outlet_filter}
    """, id=request_id, aid=user["id"], aname=user.get("name", ""),
         reason=body.get("reason", ""))

    await log_action(user, "reject", "leave_request", entity_id=request_id,
                     outlet_id=str(existing.get("outlet_id") or ""),
                     new_value={"status": "rejected", "reason": body.get("reason", "")})

    return clean(await q_one("SELECT * FROM leave_requests WHERE id = :id", id=request_id))


@router.delete("/leave-requests/{request_id}")
async def delete_leave_request(
    request_id: str,
    user=Depends(get_current_user),
):
    """Delete a leave request (only by owner or the requester)."""
    existing = await q_one("SELECT * FROM leave_requests WHERE id = :id", id=request_id)
    if not existing:
        raise HTTPException(404, "Leave request not found")

    if user["role"] != "owner" and str(existing["user_id"]) != str(user["id"]):
        raise HTTPException(403, "Tidak dapat menghapus pengajuan orang lain")

    outlet_filter = await filter_outlets_for_user(user)
    await q_exec(f"DELETE FROM leave_requests WHERE id = :id {outlet_filter}", id=request_id)
    return {"ok": True}
