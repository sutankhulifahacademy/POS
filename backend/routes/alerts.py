"""Alerts routes — notification center."""
from routes.deps import *
from routes.auth import require_permission

router = APIRouter()


@router.get("/alerts")
async def list_alerts(
    limit: int = 50,
    is_read: Optional[bool] = None,
    category: Optional[str] = None,
    severity: Optional[str] = None,
    outlet_id: Optional[str] = None,
    user=Depends(require_permission("alerts", "view")),
):
    """List alerts. Owner sees all, others see their outlet only."""
    where = ["1=1"]
    params = {"limit": limit}

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

    if is_read is not None:
        where.append("is_read = :is_read")
        params["is_read"] = is_read
    if category:
        where.append("category = :category")
        params["category"] = category
    if severity:
        where.append("severity = :severity")
        params["severity"] = severity

    where_clause = " AND ".join(where)

    rows = await q_all(f"""
        SELECT a.*, o.name AS outlet_name
        FROM alerts a
        LEFT JOIN outlets o ON o.id = a.outlet_id
        WHERE {where_clause}
        ORDER BY a.created_at DESC
        LIMIT :limit
    """, **params)

    # Get unread count
    unread = await q_one(f"""
        SELECT COUNT(*) AS c FROM alerts
        WHERE is_read = FALSE AND {where_clause.replace("1=1", "1=1")}
    """, **{k: v for k, v in params.items() if k != "limit"})

    return {
        "alerts": clean_list(rows),
        "unread_count": int(unread["c"] or 0),
    }


@router.put("/alerts/{alert_id}/read")
async def mark_alert_read(
    alert_id: str,
    user=Depends(require_permission("alerts", "view")),
):
    """Mark a single alert as read."""
    r = await q_exec("UPDATE alerts SET is_read = TRUE WHERE id = :id", id=alert_id)
    if r == 0:
        raise HTTPException(404, "Alert not found")
    return {"ok": True}


@router.put("/alerts/read-all")
async def mark_all_alerts_read(
    outlet_id: Optional[str] = None,
    user=Depends(require_permission("alerts", "view")),
):
    """Mark all alerts as read."""
    where_clause = ""
    params = {}
    if outlet_id:
        validate_outlet_access(user, outlet_id)
        where_clause = "AND outlet_id = :outlet_id"
        params["outlet_id"] = outlet_id
    elif user["role"] != "owner":
        user_outlets = user.get("outlet_ids", [])
        if user_outlets:
            ids_sql = ",".join(f"'{oid}'" for oid in user_outlets)
            where_clause = f"AND outlet_id IN ({ids_sql})"
        else:
            return {"ok": True, "updated": 0}

    r = await q_exec(f"""
        UPDATE alerts SET is_read = TRUE
        WHERE is_read = FALSE {where_clause}
    """, **params)
    return {"ok": True, "updated": r}


@router.delete("/alerts/{alert_id}")
async def delete_alert(
    alert_id: str,
    user=Depends(require_permission("alerts", "manage")),
):
    """Delete an alert (owner/admin only)."""
    r = await q_exec("DELETE FROM alerts WHERE id = :id", id=alert_id)
    if r == 0:
        raise HTTPException(404, "Alert not found")
    return {"ok": True}


# ============ HELPER: called from other routes ============
async def create_alert(
    category: str,
    severity: str,
    title: str,
    message: str,
    outlet_id: str = None,
    data: dict = None,
):
    """Create a new alert."""
    try:
        await q_exec("""
            INSERT INTO alerts (outlet_id, category, severity, title, message, data)
            VALUES (:oid, :cat, :sev, :title, :msg, :data)
        """,
            oid=outlet_id,
            cat=category,
            sev=severity,
            title=title,
            msg=message,
            data=json.dumps(data) if data else None,
        )
    except Exception as e:
        print(f"Alert creation error: {e}")
