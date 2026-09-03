"""Kitchen Display System (KDS) routes — order queue for kitchen."""
from typing import Optional
from routes.deps import *
from routes.audit_logs import log_action

router = APIRouter()


@router.get("/kds/orders")
async def list_kds_orders(
    user=Depends(get_current_user),
    outlet_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
):
    """List kitchen orders. Filter by outlet and status."""
    where = ["1=1"]
    params = {"l": limit}
    if outlet_id:
        if user["role"] != "owner" and outlet_id not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")
        where.append("ko.outlet_id = :oid")
        params["oid"] = outlet_id
    elif user["role"] != "owner":
        user_outlets = user.get("outlet_ids", [])
        if user_outlets:
            ids_sql = ",".join(f"'{oid}'" for oid in user_outlets)
            where.append(f"ko.outlet_id IN ({ids_sql})")
        else:
            return []
    if status:
        where.append("ko.status = :status")
        params["status"] = status
    else:
        where.append("ko.status IN ('new', 'preparing')")

    rows = await q_all(f"""
        SELECT ko.*, o.name AS outlet_name
        FROM kitchen_orders ko
        LEFT JOIN outlets o ON o.id = ko.outlet_id
        WHERE {' AND '.join(where)}
        ORDER BY ko.priority DESC, ko.created_at ASC
        LIMIT :l
    """, **params)

    # Calculate elapsed time
    result = []
    for r in rows:
        item = clean(r)
        if r.get("created_at") and r["status"] in ("new", "preparing"):
            from datetime import datetime, timezone
            elapsed = (datetime.now(timezone.utc) - r["created_at"]).total_seconds()
            item["elapsed_seconds"] = int(elapsed)
        result.append(item)
    return result


@router.put("/kds/orders/{order_id}/status")
async def update_kds_status(
    order_id: str,
    body: dict,
    user=Depends(require_permission("kds", "update")),
):
    """Update kitchen order status: new -> preparing -> ready -> served."""
    new_status = body.get("status")
    if new_status not in ("new", "preparing", "ready", "served", "cancelled"):
        raise HTTPException(400, "Invalid status")

    existing = await q_one("SELECT * FROM kitchen_orders WHERE id = :id", id=order_id)
    if not existing:
        raise HTTPException(404, "Order not found")

    if user["role"] != "owner" and str(existing.get("outlet_id") or "") not in user.get("outlet_ids", []):
        raise HTTPException(403, "Tidak ada akses ke outlet ini")

    updates = {"status": new_status, "id": order_id}
    if new_status == "preparing" and not existing.get("started_at"):
        updates["started_at"] = "NOW()"
    if new_status in ("ready", "served"):
        updates["completed_at"] = "NOW()"
        # Calculate elapsed seconds from created_at to now
        updates["elapsed_seconds"] = "EXTRACT(EPOCH FROM (NOW() - created_at))::int"

    sets = []
    for k, v in updates.items():
        if v == "NOW()":
            sets.append(f"{k} = NOW()")
        elif isinstance(v, str) and v.startswith("EXTRACT"):
            sets.append(f"{k} = {v}")
        elif k != "id":
            sets.append(f"{k} = :{k}")

    outlet_filter = await filter_outlets_for_user(user)
    await q_exec(f"UPDATE kitchen_orders SET {', '.join(sets)} WHERE id = :id {outlet_filter}", **updates)

    # Audit log for KDS status change
    try:
        from routes.audit_logs import log_action
        await log_action(
            user, "KDS_STATUS_UPDATE", "kitchen_orders", entity_id=order_id,
            outlet_id=existing.get("outlet_id"),
            new_value={"old_status": existing.get("status"), "new_status": new_status,
                       "updated_by": user.get("name", "")},
        )
    except Exception:
        pass

    return clean(await q_one("SELECT * FROM kitchen_orders WHERE id = :id", id=order_id))


@router.put("/kds/orders/{order_id}/priority")
async def update_kds_priority(
    order_id: str,
    body: dict,
    user=Depends(require_permission("kds", "update")),
):
    """Set priority for a kitchen order."""
    priority = int(body.get("priority", 0))
    outlet_filter = await filter_outlets_for_user(user)
    r = await q_exec(f"UPDATE kitchen_orders SET priority = :p WHERE id = :id {outlet_filter}",
                     p=priority, id=order_id)
    if r == 0:
        raise HTTPException(404, "Order not found")
    return {"ok": True, "priority": priority}


@router.get("/kds/stats")
async def kds_stats(
    user=Depends(get_current_user),
    outlet_id: Optional[str] = None,
):
    """Get KDS statistics."""
    where = ""
    params = {}
    if outlet_id:
        if user["role"] != "owner" and outlet_id not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")
        where = "WHERE outlet_id = :oid"
        params["oid"] = outlet_id
    elif user["role"] != "owner":
        user_outlets = user.get("outlet_ids", [])
        if user_outlets:
            ids_sql = ",".join(f"'{oid}'" for oid in user_outlets)
            where = f"WHERE outlet_id IN ({ids_sql})"
        else:
            return {"new": 0, "preparing": 0, "ready": 0, "avg_wait": 0}

    stats = await q_all(f"""
        SELECT status, COUNT(*) AS count
        FROM kitchen_orders {where}
        GROUP BY status
    """, **params)

    result = {"new": 0, "preparing": 0, "ready": 0, "served": 0, "cancelled": 0}
    for s in stats:
        result[s["status"]] = int(s["count"])

    # Average wait time for completed orders today
    avg = await q_one(f"""
        SELECT COALESCE(AVG(elapsed_seconds), 0) AS avg_wait
        FROM kitchen_orders {where + ' AND ' if where else 'WHERE '}
        completed_at IS NOT NULL AND created_at >= CURRENT_DATE
    """, **params)
    result["avg_wait"] = int(avg["avg_wait"] or 0)
    return result
