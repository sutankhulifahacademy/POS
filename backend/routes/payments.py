import os, base64, hashlib, hmac, io, json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Depends
from routes.deps import *
from services.payment_service import _midtrans_auth, _qr_data_uri
from services.money import money, ZERO
from services.pricing_service import resolve_product_price
from services.sales_service import _validate_sale_total
from services.order_service import _calc_total
from services.inventory_service import _get_main_outlet_id

router = APIRouter()

try:
    import httpx as _httpx
    import qrcode as _qrcode
    _mid_ok = True
except Exception:
    _mid_ok = False


# ============ PER-OUTLET STOCK ============
@router.get("/outlet-stocks/{outlet_id}")
async def get_outlet_stocks(outlet_id: str, user=Depends(get_current_user)):
    validate_outlet_access(user, outlet_id)
    rows = await q_all("SELECT product_id, outlet_id, quantity FROM outlet_stocks WHERE outlet_id=:o", o=outlet_id)
    return clean_list(rows)


def _item_get(it, key, default=None):
    if isinstance(it, dict):
        return it.get(key, default)
    return getattr(it, key, default)


# ============ MIDTRANS QRIS ============
async def _calculate_qris_total(items, price_type, sales_channel="offline"):
    """Calculate canonical backend total from product items."""
    normalized = []
    for it in items:
        pid = _item_get(it, "product_id")
        qty = int(_item_get(it, "quantity") or 0)
        if not pid or qty <= 0:
            continue
        product = await q_one(
            """SELECT id, name, price, cost, variants,
                      retail_price, reseller_price, wholesale_price, online_price
               FROM products WHERE id=:id""",
            id=pid,
        )
        if not product:
            raise HTTPException(400, f"Produk {_item_get(it, 'name', pid)} tidak ditemukan")

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

        variant_name = _item_get(it, "variant_name") or ""
        resolved_price = await resolve_product_price(
            product_for_pricing,
            variant_name=variant_name,
            sales_channel=sales_channel,
            price_type=price_type,
        )

        normalized.append({
            "product_id": pid,
            "name": product["name"],
            "quantity": qty,
            "price": float(resolved_price),
            "cost": float(money(product.get("cost") or 0)),
            "variant_name": variant_name,
            "note": _item_get(it, "note", ""),
        })

    subtotal = _calc_total(normalized)
    return normalized, subtotal


@router.post("/payments/qris")
async def create_qris(
    body: QRISCreate,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    user=Depends(get_current_user),
):
    if not _mid_ok:
        raise HTTPException(503, "Midtrans libs missing")

    # Outlet authorization
    outlet_id = body.outlet_id
    if not outlet_id:
        outlet_id = await _get_main_outlet_id()
    if user["role"] != "owner" and str(outlet_id) not in user.get("outlet_ids", []):
        raise HTTPException(403, "Tidak ada akses ke outlet ini")

    price_type = (body.price_type or "ecceran").lower()
    sales_channel = (getattr(body, "sales_channel", "offline") or "offline").lower()

    # F1: cashier must not use privileged pricing tiers for QRIS payments.
    assert_price_type_authorized(user, price_type, sales_channel)

    # Backend-calculated canonical amount; frontend amount is ignored.
    if not body.items:
        raise HTTPException(400, "Item transaksi wajib disertakan untuk perhitungan QRIS")

    normalized_items, subtotal = await _calculate_qris_total(body.items, price_type)
    total = _validate_sale_total(subtotal, body.discount, body.tax)

    # QRIS gross_amount must be integer (smallest currency unit). IDR is whole Rupiah.
    amount_int = int(total)
    if amount_int <= 0:
        raise HTTPException(400, "Total transaksi tidak valid untuk QRIS")

    # Atomic idempotency: serialize same-key requests with PostgreSQL
    # advisory lock, then check/create the qris_orders row inside one
    # transaction so duplicate Midtrans charges cannot occur.
    from database import transaction as _tx, execute as _tx_exec, session_one as _tx_one

    async with _tx() as session:
        if idempotency_key:
            await _tx_exec(
                session,
                "SELECT pg_advisory_xact_lock(hashtext(:key), 0)",
                key=idempotency_key,
            )
            existing = await _tx_one(
                session,
                "SELECT * FROM qris_orders WHERE idempotency_key=:k",
                k=idempotency_key,
            )
            if existing:
                return {
                    "order_id": existing["order_id"],
                    "amount": existing["amount"],
                    "status": existing["status"],
                    "qr_image": _qr_data_uri(existing["qr_string"]) if existing.get("qr_string") else "",
                }

        headers = _midtrans_auth()
        base = os.environ.get("MIDTRANS_BASE_URL", "https://api.sandbox.midtrans.com").rstrip("/")
        order_id = f"POS-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{new_id()[:8]}"
        payload = {"payment_type": "qris", "transaction_details": {"order_id": order_id, "gross_amount": amount_int},
                   "qris": {"acquirer": "gopay"}, "custom_expiry": {"expiry_duration": 15, "unit": "minute"}}
        async with _httpx.AsyncClient(timeout=15) as http:
            r = await http.post(f"{base}/v2/charge", json=payload, headers={**headers, "Content-Type": "application/json"})
        if r.status_code not in (200, 201):
            raise HTTPException(502, "Gagal membuat QRIS. Silakan coba lagi.")
        result = r.json()
        qs = result.get("qr_string")
        if not qs:
            raise HTTPException(502, "Midtrans tidak mengembalikan qr_string")

        # Persist QRIS order with canonical snapshot
        await _tx_exec(
            session,
            """INSERT INTO qris_orders
               (order_id, amount, description, transaction_id, status, fraud_status, qr_string,
                items, discount, tax, subtotal, outlet_id, price_type, idempotency_key, created_at)
               VALUES (:oid, :a, :d, :tid, :s, :f, :qs,
                       CAST(:it AS jsonb), :disc, :tax, :sub, :oid2, :pt, :ik, NOW())""",
            oid=order_id, a=amount_int, d=body.description, tid=result.get("transaction_id"),
            s=result.get("transaction_status", "pending"), f=result.get("fraud_status"), qs=qs,
            it=json.dumps(normalized_items), disc=money(body.discount), tax=money(body.tax),
            sub=subtotal, oid2=_u(outlet_id), pt=price_type, ik=idempotency_key,
        )

    return {"order_id": order_id, "amount": amount_int, "status": result.get("transaction_status", "pending"),
            "qr_image": _qr_data_uri(qs)}


@router.get("/payments/{order_id}")
async def payment_status(order_id: str, user=Depends(get_current_user)):
    local = await q_one("SELECT * FROM qris_orders WHERE order_id=:o", o=order_id)
    if not local:
        raise HTTPException(404, "Not found")
    try:
        headers = _midtrans_auth()
        base = os.environ.get("MIDTRANS_BASE_URL", "https://api.sandbox.midtrans.com").rstrip("/")
        async with _httpx.AsyncClient(timeout=10) as http:
            r = await http.get(f"{base}/v2/{order_id}/status", headers=headers)
        if r.status_code == 200:
            result = r.json()
            new_status = result.get("transaction_status", local["status"])
            fraud = result.get("fraud_status")
            if local["status"] not in ("settlement", "capture"):
                await q_exec("UPDATE qris_orders SET status=:s, fraud_status=:f, updated_at=NOW() WHERE order_id=:o",
                             s=new_status, f=fraud, o=order_id)
                local["status"] = new_status
                local["fraud_status"] = fraud
    except Exception:
        pass
    paid = local["status"] in ("settlement", "capture") and ((local.get("fraud_status") or "").lower() in ("", "accept"))
    return {"order_id": order_id, "status": local["status"], "paid": paid}


@router.post("/midtrans/webhook")
async def midtrans_webhook(request: Request):
    data = await request.json()
    order_id = str(data.get("order_id", ""))
    key = os.environ.get("MIDTRANS_SERVER_KEY", "")
    if not key:
        raise HTTPException(503, "Midtrans not configured")

    # ---- Signature validation ----
    expected = hashlib.sha512(
        f"{order_id}{data.get('status_code', '')}{data.get('gross_amount', '')}{key}".encode()
    ).hexdigest()
    if not hmac.compare_digest(expected, str(data.get("signature_key", ""))):
        raise HTTPException(403, "Invalid signature")

    # ---- Replay protection: conditional UPDATE ----
    # Only update if the current status is NOT already settlement/capture.
    # If the webhook is replayed, the status is already terminal and the
    # UPDATE will affect 0 rows — the duplicate is silently ignored.
    local = await q_one("SELECT status, amount FROM qris_orders WHERE order_id=:o", o=order_id)
    if not local:
        raise HTTPException(404, "Unknown order")

    # Validate amount matches (prevent amount tampering via webhook)
    webhook_amount = float(data.get("gross_amount", 0))
    if local["amount"] and abs(float(local["amount"]) - webhook_amount) > 0.01:
        raise HTTPException(400, "Amount mismatch")

    new_status = str(data.get("transaction_status", ""))
    fraud = data.get("fraud_status")

    # Conditional UPDATE — only if not already in terminal state
    result = await q_exec(
        """UPDATE qris_orders
           SET status=:s, fraud_status=:f, updated_at=NOW()
           WHERE order_id=:o AND status NOT IN ('settlement', 'capture')""",
        s=new_status, f=fraud, o=order_id,
    )

    # Log webhook receipt for audit trail (even if duplicate)
    # result.rowcount == 0 means duplicate/replay — silently accept

    return {"ok": True}
