"""Online Platform routes — platform CRUD + fee config CRUD with effective dates + outlet scope."""
import json
from datetime import date, datetime
from routes.deps import *
from routes.auth import require_permission
from routes.audit_logs import log_action

router = APIRouter()


# ============================================================
# PLATFORMS
# ============================================================

@router.get("/online-platforms")
async def list_platforms(
    user=Depends(require_permission("online_platforms", "view")),
):
    """List all online platforms."""
    rows = await q_all("""
        SELECT * FROM online_platforms ORDER BY sort_order, name
    """)
    return [dict(r) for r in rows]


@router.post("/online-platforms")
async def create_platform(
    body: dict,
    user=Depends(require_permission("online_platforms", "create")),
):
    """Create a new online platform (extensible — not limited to GrabFood/GoFood/ShopeeFood)."""
    pid = new_id()
    await q_exec("""
        INSERT INTO online_platforms (id, code, name, is_active, icon, color, sort_order)
        VALUES (:id, :code, :name, :active, :icon, :color, :sort)
    """,
        id=pid,
        code=body.get("code", "").lower(),
        name=body.get("name", ""),
        active=body.get("is_active", True),
        icon=body.get("icon", "Smartphone"),
        color=body.get("color", "#00B14F"),
        sort=body.get("sort_order", 0),
    )
    await log_action(user, "create", "online_platforms", pid, None, body)
    return {"id": pid, **body}


@router.put("/online-platforms/{platform_id}")
async def update_platform(
    platform_id: str,
    body: dict,
    user=Depends(require_permission("online_platforms", "update")),
):
    """Update an online platform."""
    old = await q_one("SELECT * FROM online_platforms WHERE id=:id", id=platform_id)
    if not old:
        raise HTTPException(404, "Platform not found")
    await q_exec("""
        UPDATE online_platforms
        SET name=:name, is_active=:active, icon=:icon, color=:color, sort_order=:sort,
            updated_at=NOW()
        WHERE id=:id
    """,
        id=platform_id,
        name=body.get("name", old["name"]),
        active=body.get("is_active", old["is_active"]),
        icon=body.get("icon", old["icon"]),
        color=body.get("color", old["color"]),
        sort=body.get("sort_order", old["sort_order"]),
    )
    await log_action(user, "update", "online_platforms", platform_id, dict(old), body)
    return {"id": platform_id, **body}


@router.delete("/online-platforms/{platform_id}")
async def delete_platform(
    platform_id: str,
    user=Depends(require_permission("online_platforms", "delete")),
):
    """Delete an online platform (cascade deletes fee configs)."""
    old = await q_one("SELECT * FROM online_platforms WHERE id=:id", id=platform_id)
    if not old:
        raise HTTPException(404, "Platform not found")
    await q_exec("DELETE FROM online_platforms WHERE id=:id", id=platform_id)
    await log_action(user, "delete", "online_platforms", platform_id, dict(old), None)
    return {"ok": True}


# ============================================================
# FEE CONFIGS (with effective dates + outlet scope)
# ============================================================

@router.get("/online-platforms/{platform_id}/fee-configs")
async def list_fee_configs(
    platform_id: str,
    outlet_id: str = None,
    user=Depends(require_permission("online_platforms", "view")),
):
    """List fee configs for a platform, optionally filtered by outlet."""
    if outlet_id:
        rows = await q_all("""
            SELECT * FROM platform_fee_configs
            WHERE platform_id = :pid AND outlet_id = :oid
            ORDER BY effective_date DESC
        """, pid=platform_id, oid=outlet_id)
    else:
        rows = await q_all("""
            SELECT * FROM platform_fee_configs
            WHERE platform_id = :pid
            ORDER BY outlet_id NULLS FIRST, effective_date DESC
        """, pid=platform_id)
    return [dict(r) for r in rows]


@router.post("/online-platforms/{platform_id}/fee-configs")
async def create_fee_config(
    platform_id: str,
    body: dict,
    user=Depends(require_permission("online_platforms", "create")),
):
    """
    Create a new fee config with effective date.

    If a config with the same effective_date exists for the same platform+outlet,
    the old config's end_date is set to the day before the new effective_date
    (history preservation — old config is NOT overwritten).
    """
    # Close previous config's end_date
    new_effective_str = body.get("effective_date")
    outlet_id = body.get("outlet_id")

    # Parse to date object for asyncpg
    if new_effective_str:
        if isinstance(new_effective_str, str):
            new_effective = datetime.strptime(new_effective_str[:10], "%Y-%m-%d").date()
        else:
            new_effective = new_effective_str
    else:
        new_effective = date.today()

    if new_effective:
        if outlet_id:
            await q_exec("""
                UPDATE platform_fee_configs
                SET end_date = (:ed - INTERVAL '1 day')::date,
                    is_active = FALSE,
                    updated_at = NOW()
                WHERE platform_id = :pid
                  AND outlet_id = :oid
                  AND end_date IS NULL
                  AND effective_date < :ed
            """, pid=platform_id, oid=outlet_id, ed=new_effective)
        else:
            await q_exec("""
                UPDATE platform_fee_configs
                SET end_date = (:ed - INTERVAL '1 day')::date,
                    is_active = FALSE,
                    updated_at = NOW()
                WHERE platform_id = :pid
                  AND outlet_id IS NULL
                  AND end_date IS NULL
                  AND effective_date < :ed
            """, pid=platform_id, ed=new_effective)

    fid = new_id()
    await q_exec("""
        INSERT INTO platform_fee_configs (
            id, platform_id, outlet_id,
            commission_pct, fixed_fee, tax_on_fee_pct,
            promo_merchant_pct, promo_platform_pct,
            advertising_fee, other_fee_pct, other_fixed_fee,
            fee_calc_base, effective_date, end_date, is_active, note,
            created_by, created_by_name
        ) VALUES (
            :id, :pid, :oid,
            :comm, :fixed, :tax,
            :pm, :pp,
            :adv, :ofp, :off,
            :fcb, :ed, NULL, TRUE, :note,
            :uid, :uname
        )
    """,
        id=fid,
        pid=platform_id,
        oid=outlet_id,
        comm=body.get("commission_pct", 0),
        fixed=body.get("fixed_fee", 0),
        tax=body.get("tax_on_fee_pct", 0),
        pm=body.get("promo_merchant_pct", 0),
        pp=body.get("promo_platform_pct", 0),
        adv=body.get("advertising_fee", 0),
        ofp=body.get("other_fee_pct", 0),
        off=body.get("other_fixed_fee", 0),
        fcb=body.get("fee_calc_base", "gross"),
        ed=new_effective,
        note=body.get("note", ""),
        uid=user.get("id"),
        uname=user.get("name"),
    )
    await log_action(user, "create", "platform_fee_configs", fid, None, body)
    return {"id": fid, **body}


@router.put("/online-platforms/{platform_id}/fee-configs/{config_id}")
async def update_fee_config(
    platform_id: str,
    config_id: str,
    body: dict,
    user=Depends(require_permission("online_platforms", "update")),
):
    """Update a fee config. Note: effective_date cannot be changed (history preservation)."""
    old = await q_one("SELECT * FROM platform_fee_configs WHERE id=:id AND platform_id=:pid", id=config_id, pid=platform_id)
    if not old:
        raise HTTPException(404, "Fee config not found")
    await q_exec("""
        UPDATE platform_fee_configs
        SET commission_pct=:comm, fixed_fee=:fixed, tax_on_fee_pct=:tax,
            promo_merchant_pct=:pm, promo_platform_pct=:pp,
            advertising_fee=:adv, other_fee_pct=:ofp, other_fixed_fee=:off,
            fee_calc_base=:fcb, is_active=:active, note=:note,
            updated_at=NOW()
        WHERE id=:id
    """,
        id=config_id,
        comm=body.get("commission_pct", old["commission_pct"]),
        fixed=body.get("fixed_fee", old["fixed_fee"]),
        tax=body.get("tax_on_fee_pct", old["tax_on_fee_pct"]),
        pm=body.get("promo_merchant_pct", old["promo_merchant_pct"]),
        pp=body.get("promo_platform_pct", old["promo_platform_pct"]),
        adv=body.get("advertising_fee", old["advertising_fee"]),
        ofp=body.get("other_fee_pct", old["other_fee_pct"]),
        off=body.get("other_fixed_fee", old["other_fixed_fee"]),
        fcb=body.get("fee_calc_base", old["fee_calc_base"]),
        active=body.get("is_active", old["is_active"]),
        note=body.get("note", old["note"]),
    )
    await log_action(user, "update", "platform_fee_configs", config_id, dict(old), body)
    return {"id": config_id, **body}


@router.delete("/online-platforms/{platform_id}/fee-configs/{config_id}")
async def delete_fee_config(
    platform_id: str,
    config_id: str,
    user=Depends(require_permission("online_platforms", "delete")),
):
    """Delete a fee config."""
    old = await q_one("SELECT * FROM platform_fee_configs WHERE id=:id AND platform_id=:pid", id=config_id, pid=platform_id)
    if not old:
        raise HTTPException(404, "Fee config not found")
    await q_exec("DELETE FROM platform_fee_configs WHERE id=:id", id=config_id)
    await log_action(user, "delete", "platform_fee_configs", config_id, dict(old), None)
    return {"ok": True}
