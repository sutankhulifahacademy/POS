"""Customer Loyalty routes — points, tiers, memberships."""
from typing import Optional
from routes.deps import *
from routes.audit_logs import log_action

router = APIRouter()

TIERS = ["bronze", "silver", "gold", "platinum"]
TIER_THRESHOLDS = {"bronze": 0, "silver": 500000, "gold": 2000000, "platinum": 5000000}
POINTS_RATE = 0.01  # 1 point per 100 rupiah


def _determine_tier(total_spent: float) -> str:
    tier = "bronze"
    for t in TIERS:
        if total_spent >= TIER_THRESHOLDS[t]:
            tier = t
    return tier


@router.get("/loyalty/memberships")
async def list_memberships(
    user=Depends(get_current_user),
    outlet_id: Optional[str] = None,
    tier: Optional[str] = None,
    limit: int = 100,
):
    where = ["1=1"]
    params = {"l": limit}
    if outlet_id:
        if user["role"] != "owner" and outlet_id not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")
        where.append("cm.outlet_id = :oid")
        params["oid"] = outlet_id
    elif user["role"] != "owner":
        user_outlets = user.get("outlet_ids", [])
        if user_outlets:
            ids_sql = ",".join(f"'{oid}'" for oid in user_outlets)
            where.append(f"cm.outlet_id IN ({ids_sql})")
        else:
            return []
    if tier:
        where.append("cm.tier = :tier")
        params["tier"] = tier

    rows = await q_all(f"""
        SELECT cm.*, c.name AS customer_name, c.email, c.phone,
               o.name AS outlet_name
        FROM customer_memberships cm
        LEFT JOIN customers c ON c.id = cm.customer_id
        LEFT JOIN outlets o ON o.id = cm.outlet_id
        WHERE {' AND '.join(where)}
        ORDER BY cm.total_spent DESC LIMIT :l
    """, **params)
    return clean_list(rows)


@router.get("/loyalty/customer/{customer_id}")
async def get_customer_loyalty(customer_id: str, user=Depends(get_current_user)):
    rows = await q_all("""
        SELECT cm.*, o.name AS outlet_name
        FROM customer_memberships cm
        LEFT JOIN outlets o ON o.id = cm.outlet_id
        WHERE cm.customer_id = :cid
    """, cid=customer_id)
    return clean_list(rows)


@router.get("/loyalty/points/{customer_id}")
async def get_point_history(customer_id: str, user=Depends(get_current_user), limit: int = 50):
    rows = await q_all("""
        SELECT pt.*, o.name AS outlet_name
        FROM point_transactions pt
        LEFT JOIN outlets o ON o.id = pt.outlet_id
        WHERE pt.customer_id = :cid
        ORDER BY pt.created_at DESC LIMIT :l
    """, cid=customer_id, l=limit)
    return clean_list(rows)


@router.post("/loyalty/adjust-points")
async def adjust_points(body: dict, user=Depends(require_permission("loyalty", "update"))):
    """Manually adjust customer points."""
    customer_id = body.get("customer_id")
    points_change = int(body.get("points_change", 0))
    reason = body.get("reason", "Manual adjustment")
    outlet_id = body.get("outlet_id")

    if not customer_id:
        raise HTTPException(400, "customer_id is required")

    # Get or create membership
    membership = await q_one(
        "SELECT * FROM customer_memberships WHERE customer_id = :cid AND outlet_id = :oid",
        cid=customer_id, oid=_u(outlet_id),
    )
    if not membership:
        mid = new_id()
        await q_exec("""
            INSERT INTO customer_memberships (id, customer_id, outlet_id, points, total_spent)
            VALUES (:id, :cid, :oid, 0, 0)
        """, id=mid, cid=customer_id, oid=_u(outlet_id))
        membership = await q_one("SELECT * FROM customer_memberships WHERE id = :id", id=mid)

    new_balance = int(membership["points"] or 0) + points_change
    if new_balance < 0:
        raise HTTPException(400, "Points cannot be negative")

    await q_exec("UPDATE customer_memberships SET points = :p, updated_at = NOW() WHERE id = :id",
                 p=new_balance, id=membership["id"])

    # Log transaction
    ptid = new_id()
    await q_exec("""
        INSERT INTO point_transactions (id, customer_id, outlet_id, points_change, reason, balance_after)
        VALUES (:id, :cid, :oid, :pc, :r, :ba)
    """, id=ptid, cid=customer_id, oid=_u(outlet_id), pc=points_change, r=reason, ba=new_balance)

    return {"ok": True, "new_balance": new_balance}


@router.get("/loyalty/tiers")
async def get_tier_info():
    """Get tier thresholds and info."""
    return {
        "tiers": [
            {"name": t, "threshold": TIER_THRESHOLDS[t], "color": {
                "bronze": "#CD7F32", "silver": "#C0C0C0", "gold": "#FFD700", "platinum": "#E5E4E2"
            }[t]}
            for t in TIERS
        ],
        "points_rate": POINTS_RATE,
    }
