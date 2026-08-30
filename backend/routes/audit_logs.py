"""Audit Logs routes — view system activity logs."""
from routes.deps import *
from routes.auth import require_permission

router = APIRouter()


@router.get("/audit-logs")
async def list_audit_logs(
    limit: int = 100,
    offset: int = 0,
    outlet_id: Optional[str] = None,
    entity: Optional[str] = None,
    action: Optional[str] = None,
    user_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user=Depends(require_permission("audit", "view")),
):
    """List audit logs with filtering. Owner sees all, others see their outlet only."""
    where = ["1=1"]
    params = {"limit": limit, "offset": offset}

    if outlet_id:
        where.append("outlet_id = :outlet_id")
        params["outlet_id"] = outlet_id
    elif user["role"] != "owner":
        user_outlets = user.get("outlet_ids", [])
        if user_outlets:
            ids_sql = ",".join(f"'{oid}'" for oid in user_outlets)
            where.append(f"outlet_id IN ({ids_sql})")
        else:
            where.append("1=0")

    if entity:
        where.append("entity = :entity")
        params["entity"] = entity
    if action:
        where.append("action = :action")
        params["action"] = action
    if user_id:
        where.append("user_id = :user_id")
        params["user_id"] = user_id
    if date_from:
        where.append("created_at >= :date_from")
        params["date_from"] = date_from
    if date_to:
        where.append("created_at <= :date_to")
        params["date_to"] = date_to

    where_clause = " AND ".join(where)

    rows = await q_all(f"""
        SELECT al.id, al.user_id, al.user_name, al.role, al.outlet_id,
               al.action, al.entity, al.entity_id, al.old_value, al.new_value,
               al.ip, al.created_at,
               o.name AS outlet_name
        FROM audit_logs al
        LEFT JOIN outlets o ON o.id = al.outlet_id
        WHERE {where_clause}
        ORDER BY al.created_at DESC
        LIMIT :limit OFFSET :offset
    """, **params)

    # Get total count
    count = await q_one(f"""
        SELECT COUNT(*) AS c FROM audit_logs WHERE {where_clause}
    """, **{k: v for k, v in params.items() if k not in ("limit", "offset")})

    return {
        "logs": clean_list(rows),
        "total": int(count["c"] or 0),
        "limit": limit,
        "offset": offset,
    }


@router.get("/audit-logs/stats")
async def audit_stats(
    user=Depends(require_permission("audit", "view")),
):
    """Get audit log statistics."""
    where_clause = ""
    if user["role"] != "owner":
        user_outlets = user.get("outlet_ids", [])
        if user_outlets:
            ids_sql = ",".join(f"'{oid}'" for oid in user_outlets)
            where_clause = f"WHERE outlet_id IN ({ids_sql})"
        else:
            where_clause = "WHERE 1=0"

    by_action = await q_all(f"""
        SELECT action, COUNT(*) AS count
        FROM audit_logs
        {where_clause}
        GROUP BY action
        ORDER BY count DESC
        LIMIT 10
    """)

    by_entity = await q_all(f"""
        SELECT entity, COUNT(*) AS count
        FROM audit_logs
        {where_clause}
        GROUP BY entity
        ORDER BY count DESC
        LIMIT 10
    """)

    today = await q_one(f"""
        SELECT COUNT(*) AS c FROM audit_logs
        {where_clause + ' AND ' if where_clause else 'WHERE '} created_at >= CURRENT_DATE
    """)

    return {
        "by_action": [{"action": r["action"], "count": int(r["count"])} for r in by_action],
        "by_entity": [{"entity": r["entity"], "count": int(r["count"])} for r in by_entity],
        "today_count": int(today["c"] or 0),
    }


# ============ HELPER: called from other routes ============
async def log_action(
    user: dict,
    action: str,
    entity: str,
    entity_id: str = None,
    outlet_id: str = None,
    old_value: dict = None,
    new_value: dict = None,
):
    """Insert audit log entry."""
    try:
        await q_exec("""
            INSERT INTO audit_logs (user_id, user_name, role, outlet_id, action, entity, entity_id, old_value, new_value)
            VALUES (:uid, :uname, :role, :oid, :action, :entity, :eid, :old, :new)
        """,
            uid=user.get("id"),
            uname=user.get("name"),
            role=user.get("role"),
            oid=outlet_id,
            action=action,
            entity=entity,
            eid=entity_id,
            old=json.dumps(old_value) if old_value else None,
            new=json.dumps(new_value) if new_value else None,
        )
    except Exception as e:
        # Don't fail the main operation if audit fails
        print(f"Audit log error: {e}")
