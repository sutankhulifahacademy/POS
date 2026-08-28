"""Payment service — Midtrans auth and QR code helpers."""
import os
import base64
import io

from fastapi import HTTPException

try:
    import qrcode as _qrcode
    _qr_ok = True
except Exception:
    _qr_ok = False


def _midtrans_auth():
    key = os.environ.get("MIDTRANS_SERVER_KEY", "")
    if not key:
        raise HTTPException(
            503,
            "Midtrans belum dikonfigurasi. Tambahkan MIDTRANS_SERVER_KEY di .env",
        )
    return {
        "Authorization": f"Basic {base64.b64encode(f'{key}:'.encode()).decode()}",
        "Accept": "application/json",
    }


def _qr_data_uri(s: str):
    img = _qrcode.make(s)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
