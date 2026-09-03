"""Online Orders routes — create, list, detail, settlement reconciliation."""
import json
import uuid as _uuid
from datetime import date, datetime
from zoneinfo import ZoneInfo
from routes.deps import *
from routes.auth import require_permission, get_user_outlets
from routes.audit_logs import log_action
from services.online_pricing_service import (
    get_fee_config,
    calculate_settlement,
    calculate_profit,
    calculate_break_even_price,
)
from services.pricing_service import resolve_product_price
from services.money import money

router = APIRouter()
JAKARTA = ZoneInfo("Asia/Jakarta")


def _outlet_filter(user, outlet_id=None):
    """Build outlet SQL filter for online orders. Validates outlet access."""
    if outlet_id:
        # Validate user has access to this outlet
        if user["role"] != "owner" and str(outlet_id) not in user.get("outlet_ids", []):
            raise HTTPException(403, "Tidak ada akses ke outlet ini")
        return " AND o.outlet_id = :outlet_id ", {"outlet_id": outlet_id}
    if user["role"] == "owner":
        return "", {}
    outlets = user.get("outlet_ids", [])
    if not outlets:
        return " AND 1=0 ", {}
    ids = ",".join(f"'{o}'" for o in outlets)
    return f" AND o.outlet_id IN ({ids}) ", {}


# ============================================================
# LIST ONLINE ORDERS
# ============================================================
@router.get("/online-orders")
async def list_online_orders(
    outlet_id: str = None,
    platform_id: str = None,
    status: str = None,
    settlement_status: str = None,
    date_from: str = None,
    date_to: str = None,
    limit: int = 100,
    offset: int = 0,
    user=Depends(require_permission("online_platforms", "view")),
):
    """List online orders with filters. Respects outlet scope."""
    where = ["1=1"]
    params = {"limit": limit, "offset": offset}

    clause, clause_params = _outlet_filter(user, outlet_id)
    # _outlet_filter returns clauses like " AND o.outlet_id = :outlet_id "
    # (with leading "AND"). Strip the leading "AND" and the "o." prefix
    # so we can join with " AND " consistently below.
    normalized = clause.replace(" AND o.", " AND ").strip()
    # Remove leading "AND" if present (it will be re-added by join)
    if normalized.upper().startswith("AND "):
        normalized = normalized[4:].strip()
    if normalized:
        where.append(normalized)
    params.update(clause_params)

    if platform_id:
        where.append("o.platform_id = :pid")
        params["pid"] = platform_id
    if status:
        where.append("o.status = :status")
        params["status"] = status
    if settlement_status:
        where.append("o.settlement_status = :ss")
        params["ss"] = settlement_status
    if date_from:
        where.append("o.created_at >= :df")
        params["df"] = datetime.strptime(date_from[:10], "%Y-%m-%d")
    if date_to:
        where.append("o.created_at <= :dt")
        params["dt"] = datetime.strptime(date_to[:10], "%Y-%m-%d").replace(hour=23, minute=59, second=59)

    where_sql = " AND ".join(where)

    rows = await q_all(f"""
        SELECT o.*, p.name AS platform_name, p.code AS platform_code, p.color AS platform_color,
               out.name AS outlet_name
        FROM online_orders o
        LEFT JOIN online_platforms p ON o.platform_id = p.id
        LEFT JOIN outlets out ON o.outlet_id = out.id
        WHERE {where_sql}
        ORDER BY o.created_at DESC
        LIMIT :limit OFFSET :offset
    """, **params)

    # Get items for each order
    result = []
    for r in rows:
        d = dict(r)
        items = await q_all("SELECT * FROM online_order_items WHERE order_id=:oid", oid=d["id"])
        d["items"] = [dict(i) for i in items]
        result.append(d)

    return result


# ============================================================
# GET ONLINE ORDER DETAIL
# ============================================================
@router.get("/online-orders/{order_id}")
async def get_online_order(
    order_id: str,
    user=Depends(require_permission("online_platforms", "view")),
):
    """Get online order detail with items."""
    order = await q_one("""
        SELECT o.*, p.name AS platform_name, p.code AS platform_code, p.color AS platform_color,
               out.name AS outlet_name
        FROM online_orders o
        LEFT JOIN online_platforms p ON o.platform_id = p.id
        LEFT JOIN outlets out ON o.outlet_id = out.id
        WHERE o.id = :id
    """, id=order_id)
    if not order:
        raise HTTPException(404, "Order not found")

    # Outlet scope check
    if user["role"] != "owner":
        user_outlets = user.get("outlet_ids", [])
        if order["outlet_id"] and str(order["outlet_id"]) not in [str(o) for o in user_outlets]:
            raise HTTPException(403, "Not authorized for this outlet")

    d = dict(order)
    items = await q_all("SELECT * FROM online_order_items WHERE order_id=:oid", oid=order_id)
    d["items"] = [dict(i) for i in items]
    return d


# ============================================================
# CREATE ONLINE ORDER
# ============================================================
@router.post("/online-orders")
async def create_online_order(
    body: dict,
    user=Depends(require_permission("online_platforms", "create")),
):
    """
    Create an online order with automatic settlement calculation.

    Body:
        platform_id, outlet_id, items: [{product_id, variant_name, online_price, cost, quantity}],
        customer_name, platform_order_ref, note,
        merchant_promo_override (optional), advertising_override (optional)
    """
    platform_id = body.get("platform_id")
    outlet_id = body.get("outlet_id")
    items = body.get("items", [])

    if not platform_id:
        raise HTTPException(400, "Platform ID required")
    if not items:
        raise HTTPException(400, "Items required")

    # Outlet scope check
    if user["role"] != "owner" and outlet_id:
        user_outlets = user.get("outlet_ids", [])
        if str(outlet_id) not in [str(o) for o in user_outlets]:
            raise HTTPException(403, "Not authorized for this outlet")

    # Get platform
    platform = await q_one("SELECT * FROM online_platforms WHERE id=:id", id=platform_id)
    if not platform:
        raise HTTPException(404, "Platform not found")

    # Get outlet name
    outlet_name = None
    if outlet_id:
        outlet = await q_one("SELECT name FROM outlets WHERE id=:id", id=outlet_id)
        outlet_name = outlet["name"] if outlet else None

    # Calculate gross sales + COGS from authoritative DB prices.
    # Frontend-supplied online_price and cost are ignored.
    total_gross = 0.0
    total_cogs = 0.0
    total_qty = 0
    normalized_items = []

    for item in items:
        pid = item.get("product_id")
        qty = int(item.get("quantity") or 1)
        if not pid or qty <= 0:
            continue

        product = await q_one(
            """SELECT id, name, online_price, cost, price,
                      retail_price, reseller_price, wholesale_price, variants
               FROM products WHERE id=:id""",
            id=pid,
        )
        if not product:
            raise HTTPException(400, f"Produk {item.get('product_name', pid)} tidak ditemukan")

        variants = product.get("variants") or []
        if isinstance(variants, str):
            try:
                variants = json.loads(variants)
            except Exception:
                variants = []

        product_for_pricing = {
            "price": product["price"],
            "retail_price": product.get("retail_price"),
            "reseller_price": product.get("reseller_price"),
            "wholesale_price": product.get("wholesale_price"),
            "online_price": product.get("online_price"),
            "variants": variants,
        }

        variant_name = item.get("variant_name") or ""
        online_price = await resolve_product_price(
            product_for_pricing,
            variant_name=variant_name,
            sales_channel="online",
            price_type="online",
        )
        cost = money(product.get("cost") or 0)
        qty = int(item.get("quantity") or 1)
        gross = float(online_price * qty)
        cogs = float(cost * qty)

        total_gross += gross
        total_cogs += cogs
        total_qty += qty

        normalized_items.append({
            "product_id": pid,
            "product_name": product["name"],
            "variant_name": variant_name,
            "sku": item.get("sku", ""),
            "online_price": float(online_price),
            "cost": float(cost),
            "quantity": qty,
            "gross_sales": gross,
            "cogs": cogs,
        })

    # Get fee config
    order_date = date.today()
    config = await get_fee_config(platform_id, outlet_id, order_date)
    if not config:
        raise HTTPException(400, f"No active fee config for platform {platform['name']}")

    # Calculate settlement
    settlement = calculate_settlement(
        gross_sales=total_gross,
        config=config,
        merchant_promo_override=body.get("merchant_promo_override"),
        advertising_override=body.get("advertising_override"),
    )

    # Calculate profit
    profit = calculate_profit(settlement, total_cogs)

    # Generate order number
    now = datetime.now(JAKARTA)
    order_no = f"OL-{now.strftime('%Y%m%d')}-{now.strftime('%H%M%S')}-{str(_uuid.uuid4())[:4].upper()}"

    # Insert order
    oid = new_id()
    await q_exec("""
        INSERT INTO online_orders (
            id, order_no, platform_id, platform_name, outlet_id, outlet_name,
            gross_sales, total_quantity,
            commission_amount, fixed_fee, tax_on_fee,
            merchant_promo, platform_promo, advertising_fee, other_fee,
            total_deduction, expected_settlement,
            total_cogs, gross_profit, profit_margin, effective_fee_pct,
            fee_config_id, fee_config_snapshot,
            customer_name, platform_order_ref, note, status,
            created_by, created_by_name
        ) VALUES (
            :id, :ono, :pid, :pname, :oid, :oname,
            :gs, :tq,
            :comm, :fixed, :tax,
            :mp, :pp, :adv, :of,
            :td, :es,
            :cogs, :gp, :pm, :efp,
            :fcid, :fcs,
            :cn, :por, :note, 'completed',
            :uid, :uname
        )
    """,
        id=oid,
        ono=order_no,
        pid=platform_id,
        pname=platform["name"],
        oid=outlet_id,
        oname=outlet_name,
        gs=settlement["gross_sales"],
        tq=total_qty,
        comm=settlement["commission_amount"],
        fixed=settlement["fixed_fee"],
        tax=settlement["tax_on_fee"],
        mp=settlement["merchant_promo"],
        pp=settlement["platform_promo"],
        adv=settlement["advertising_fee"],
        of=settlement["other_fee"],
        td=settlement["total_deduction"],
        es=settlement["expected_settlement"],
        cogs=profit["total_cogs"],
        gp=profit["gross_profit"],
        pm=profit["profit_margin"],
        efp=settlement["effective_fee_pct"],
        fcid=config["id"],
        fcs=json.dumps({k: (str(v) if isinstance(v, (date, datetime, __import__('uuid').UUID)) else v) for k, v in config.items()}, default=str),
        cn=body.get("customer_name", ""),
        por=body.get("platform_order_ref", ""),
        note=body.get("note", ""),
        uid=user.get("id"),
        uname=user.get("name"),
    )

    # Insert items
    for item in normalized_items:
        # Per-item profit = (item gross / total gross) * settlement - item cogs
        item_settlement = (item["gross_sales"] / total_gross * settlement["expected_settlement"]) if total_gross > 0 else 0
        item_profit = item_settlement - item["cogs"]
        await q_exec("""
            INSERT INTO online_order_items (
                id, order_id, product_id, product_name, variant_name, sku,
                online_price, cost, quantity, gross_sales, cogs, profit
            ) VALUES (
                :id, :oid, :pid, :pname, :vname, :sku,
                :op, :cost, :qty, :gs, :cogs, :profit
            )
        """,
            id=new_id(),
            oid=oid,
            pid=item["product_id"],
            pname=item["product_name"],
            vname=item["variant_name"],
            sku=item["sku"],
            op=item["online_price"],
            cost=item["cost"],
            qty=item["quantity"],
            gs=item["gross_sales"],
            cogs=item["cogs"],
            profit=round(item_profit, 2),
        )

    await log_action(user, "create", "online_orders", oid, None, {"order_no": order_no, "platform": platform["name"]})

    return await get_online_order(oid, user)


# ============================================================
# SETTLEMENT RECONCILIATION
# ============================================================
@router.put("/online-orders/{order_id}/reconcile")
async def reconcile_settlement(
    order_id: str,
    body: dict,
    user=Depends(require_permission("online_platforms", "update")),
):
    """
    Reconcile actual settlement.

    Body:
        actual_settlement: float
        settlement_date: str (YYYY-MM-DD)
        settlement_note: str
    """
    order = await q_one("SELECT * FROM online_orders WHERE id=:id", id=order_id)
    if not order:
        raise HTTPException(404, "Order not found")

    # Outlet scope check
    if user["role"] != "owner":
        user_outlets = user.get("outlet_ids", [])
        if order["outlet_id"] and str(order["outlet_id"]) not in [str(o) for o in user_outlets]:
            raise HTTPException(403, "Not authorized for this outlet")

    actual = float(body.get("actual_settlement") or 0)
    expected = float(order["expected_settlement"] or 0)
    variance = actual - expected

    if abs(variance) < 0.01:
        status = "matched"
    else:
        status = "variance"

    # Recalculate profit with actual settlement
    cogs = float(order["total_cogs"] or 0)
    actual_profit = actual - cogs
    actual_margin = (actual_profit / float(order["gross_sales"] or 1) * 100) if order["gross_sales"] else 0

    # Parse settlement_date
    sdate = body.get("settlement_date")
    if sdate and isinstance(sdate, str):
        sdate = datetime.strptime(sdate[:10], "%Y-%m-%d").date()

    await q_exec("""
        UPDATE online_orders
        SET actual_settlement = :actual,
            settlement_variance = :variance,
            settlement_status = :status,
            settlement_date = :sdate,
            settlement_note = :note,
            gross_profit = :profit,
            profit_margin = :margin,
            updated_at = NOW()
        WHERE id = :id
    """,
        id=order_id,
        actual=actual,
        variance=round(variance, 2),
        status=status,
        sdate=sdate,
        note=body.get("settlement_note", ""),
        profit=round(actual_profit, 2),
        margin=round(actual_margin, 2),
    )

    await log_action(user, "reconcile", "online_orders", order_id, dict(order), body)
    return {"ok": True, "variance": round(variance, 2), "status": status}


# ============================================================
# BREAK-EVEN / RECOMMENDED PRICE SIMULATION
# ============================================================
@router.post("/online-orders/break-even")
async def break_even_simulation(
    body: dict,
    user=Depends(require_permission("online_platforms", "view")),
):
    """
    Simulate break-even / recommended online price.

    Body:
        platform_id, outlet_id, cogs (per unit),
        target_profit (per unit, default 0)
    """
    platform_id = body.get("platform_id")
    outlet_id = body.get("outlet_id")
    cogs = float(body.get("cogs") or 0)
    target_profit = float(body.get("target_profit") or 0)

    config = await get_fee_config(platform_id, outlet_id, date.today())
    if not config:
        raise HTTPException(400, "No active fee config for this platform")

    result = calculate_break_even_price(cogs, config, target_profit)
    result["platform_id"] = platform_id
    result["outlet_id"] = outlet_id
    result["cogs"] = cogs
    return result
