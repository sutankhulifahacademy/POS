import os, base64, hashlib, hmac, io
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Depends
from routes.deps import *
from services.payment_service import _midtrans_auth, _qr_data_uri

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
    rows = await q_all("SELECT product_id, outlet_id, quantity FROM outlet_stocks WHERE outlet_id=:o", o=outlet_id)
    return clean_list(rows)


# ============ MIDTRANS QRIS ============
@router.post("/payments/qris")
async def create_qris(body: QRISCreate, user=Depends(get_current_user)):
    if not _mid_ok:
        raise HTTPException(503, "Midtrans libs missing")
    headers = _midtrans_auth()
    base = os.environ.get("MIDTRANS_BASE_URL", "https://api.sandbox.midtrans.com").rstrip("/")
    order_id = f"POS-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{new_id()[:8]}"
    payload = {"payment_type": "qris", "transaction_details": {"order_id": order_id, "gross_amount": body.amount},
               "qris": {"acquirer": "gopay"}, "custom_expiry": {"expiry_duration": 15, "unit": "minute"}}
    async with _httpx.AsyncClient(timeout=15) as http:
        r = await http.post(f"{base}/v2/charge", json=payload, headers={**headers, "Content-Type": "application/json"})
    if r.status_code not in (200, 201):
        raise HTTPException(r.status_code, r.text)
    result = r.json()
    qs = result.get("qr_string")
    if not qs:
        raise HTTPException(502, "Midtrans tidak mengembalikan qr_string")
    await q_exec("""INSERT INTO qris_orders (order_id, amount, description, transaction_id, status, fraud_status, qr_string, created_at)
                    VALUES (:oid, :a, :d, :tid, :s, :f, :qs, NOW())""",
                 oid=order_id, a=body.amount, d=body.description, tid=result.get("transaction_id"),
                 s=result.get("transaction_status", "pending"), f=result.get("fraud_status"), qs=qs)
    return {"order_id": order_id, "amount": body.amount, "status": result.get("transaction_status", "pending"),
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
    expected = hashlib.sha512(f"{order_id}{data.get('status_code', '')}{data.get('gross_amount', '')}{key}".encode()).hexdigest()
    if not hmac.compare_digest(expected, str(data.get("signature_key", ""))):
        raise HTTPException(403, "Invalid signature")
    local = await q_one("SELECT status FROM qris_orders WHERE order_id=:o", o=order_id)
    if not local:
        raise HTTPException(404, "Unknown order")
    if local["status"] not in ("settlement", "capture"):
        await q_exec("UPDATE qris_orders SET status=:s, fraud_status=:f, updated_at=NOW() WHERE order_id=:o",
                     s=str(data.get("transaction_status", "")), f=data.get("fraud_status"), o=order_id)
    return {"ok": True}
