"""
Sutan Khulifah POS - Entry Point
PostgreSQL backend (SQLAlchemy async + raw SQL)
"""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from config import CORS_ORIGINS, ADMIN_EMAIL, ADMIN_PASSWORD, DEBUG, ENVIRONMENT
from database import q_one, q_exec, close_database
from utils import new_id, hash_password, verify_password

# ============ ROUTERS ============
from routes.auth import router as auth_router
from routes.business import router as business_router
from routes.users import router as users_router
from routes.outlets import router as outlets_router
from routes.categories import router as categories_router
from routes.customers import router as customers_router
from routes.suppliers import router as suppliers_router
from routes.products import router as products_router
from routes.inventory import router as inventory_router
from routes.sales import router as sales_router
from routes.reports import router as reports_router
from routes.purchase_orders import router as purchase_orders_router
from routes.shifts import router as shifts_router
from routes.stock_transfers import router as stock_transfers_router
from routes.stock_requests import router as stock_requests_router
from routes.delivery_notes import router as delivery_notes_router
from routes.tables import router as tables_router
from routes.orders import router as orders_router
from routes.payments import router as payments_router
from routes.payment_accounts import router as payment_accounts_router
from routes.card_brands import router as card_brands_router
from routes.roles import router as roles_router
from routes.menus import router as menus_router
from routes.attendance import router as attendance_router
from routes.uploads import router as uploads_router
from routes.realtime import router as realtime_router
from routes.ai import router as ai_router
from routes.audit_logs import router as audit_logs_router
from routes.alerts import router as alerts_router
from routes.expenses import router as expenses_router
from routes.leave_requests import router as leave_requests_router
from routes.receipt_config import router as receipt_config_router
from routes.loyalty import router as loyalty_router
from routes.kds import router as kds_router
from routes.coupons import router as coupons_router
from routes.schedules import router as schedules_router
from routes.payroll import router as payroll_router
from routes.online_platforms import router as online_platforms_router
from routes.online_orders import router as online_orders_router
from routes.online_profit import router as online_profit_router

# ============ APP ============
# Disable API docs in production to prevent schema leakage.
app = FastAPI(
    title="Sutan Khulifah POS API (PostgreSQL)",
    docs_url="/docs" if DEBUG else None,
    redoc_url="/redoc" if DEBUG else None,
    openapi_url="/openapi.json" if DEBUG else None,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ============ CSRF PROTECTION (Origin validation) ============
# With SameSite=Lax cookies, cross-site mutations are already blocked
# by the browser. This Origin/Referer check is defense-in-depth.
# It validates that mutating requests originate from an allowed origin.

_MUTATION_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method in _MUTATION_METHODS:
            origin = request.headers.get("origin", "")
            referer = request.headers.get("referer", "")

            # For same-origin requests, Origin is typically empty or matches.
            # Check against allowed CORS origins.
            if origin:
                # Strip trailing slash for comparison
                origin_clean = origin.rstrip("/")
                allowed = [o.rstrip("/") for o in CORS_ORIGINS]
                # Also allow same-host requests (no Origin header = same-origin)
                if origin_clean not in allowed:
                    return JSONResponse(
                        status_code=403,
                        content={"detail": "Forbidden: origin not allowed"},
                    )
            elif referer:
                # Fall back to Referer header
                try:
                    from urllib.parse import urlparse
                    parsed = urlparse(referer)
                    ref_origin = f"{parsed.scheme}://{parsed.netloc}"
                    ref_clean = ref_origin.rstrip("/")
                    allowed = [o.rstrip("/") for o in CORS_ORIGINS]
                    if ref_clean not in allowed:
                        return JSONResponse(
                            status_code=403,
                            content={"detail": "Forbidden: referer not allowed"},
                        )
                except Exception:
                    pass
            # If neither Origin nor Referer is present, allow the request.
            # Some legitimate clients (curl, Postman) don't send these headers.
            # The SameSite=Lax cookie is the primary CSRF defense.

        return await call_next(request)


app.add_middleware(CSRFMiddleware)


# ============ GLOBAL EXCEPTION HANDLER ============
# Prevent internal error/stack trace leakage to clients.
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Terjadi kesalahan internal. Tim teknis telah diberi notifikasi."},
    )

# ============ MOUNT ROUTERS ============
app.include_router(auth_router, prefix="/api")

# ============ HEALTH CHECK ============
@app.get("/api/health")
async def health_check():
    return {"status": "ok"}
app.include_router(business_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(outlets_router, prefix="/api")
app.include_router(categories_router, prefix="/api")
app.include_router(customers_router, prefix="/api")
app.include_router(suppliers_router, prefix="/api")
app.include_router(products_router, prefix="/api")
app.include_router(inventory_router, prefix="/api")
app.include_router(sales_router, prefix="/api")
app.include_router(reports_router, prefix="/api")
app.include_router(purchase_orders_router, prefix="/api")
app.include_router(shifts_router, prefix="/api")
app.include_router(stock_transfers_router, prefix="/api")
app.include_router(stock_requests_router, prefix="/api")
app.include_router(delivery_notes_router, prefix="/api")
app.include_router(tables_router, prefix="/api")
app.include_router(orders_router, prefix="/api")
app.include_router(payments_router, prefix="/api")
app.include_router(payment_accounts_router, prefix="/api")
app.include_router(card_brands_router, prefix="/api")
app.include_router(roles_router, prefix="/api")
app.include_router(menus_router, prefix="/api")
app.include_router(attendance_router, prefix="/api")
app.include_router(uploads_router, prefix="/api")
app.include_router(realtime_router, prefix="/api")
app.include_router(ai_router, prefix="/api")
app.include_router(audit_logs_router, prefix="/api")
app.include_router(alerts_router, prefix="/api")
app.include_router(expenses_router, prefix="/api")
app.include_router(leave_requests_router, prefix="/api")
app.include_router(receipt_config_router, prefix="/api")
app.include_router(loyalty_router, prefix="/api")
app.include_router(kds_router, prefix="/api")
app.include_router(coupons_router, prefix="/api")
app.include_router(schedules_router, prefix="/api")
app.include_router(payroll_router, prefix="/api")
app.include_router(online_platforms_router, prefix="/api")
app.include_router(online_orders_router, prefix="/api")
app.include_router(online_profit_router, prefix="/api")

# ============ CORS ============
# Use consolidated CORS_ORIGINS from config.py (which reads env with a safe
# non-wildcard default). Avoid re-reading os.environ here — the previous
# inline default of "*" combined with allow_credentials=True was a credential
# leakage risk (CORS reflection).
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
)

# ============ STATIC FILES (uploads) ============
from pathlib import Path as _Path
from fastapi.staticfiles import StaticFiles

_uploads_dir = _Path(__file__).parent / "uploads"
_uploads_dir.mkdir(exist_ok=True)
app.mount("/api/uploads", StaticFiles(directory=str(_uploads_dir)), name="uploads")

# ============ STARTUP / SHUTDOWN ============
@app.on_event("startup")
async def startup():
    # Seed admin (only if missing). In production (DEBUG=false) we never
    # overwrite an existing admin's password — that would let anyone with
    # access to the env file silently take over the account. In DEBUG/dev
    # mode we sync the password from env so developers can reset via env.
    existing = await q_one(
        "SELECT id, password_hash FROM users WHERE email=:e",
        e=ADMIN_EMAIL.lower(),
    )
    if not existing:
        await q_exec(
            """INSERT INTO users (id, email, name, role, password_hash, is_active, created_at)
               VALUES (:id, :e, :n, 'admin', :h, TRUE, NOW())""",
            id=new_id(),
            e=ADMIN_EMAIL.lower(),
            n="Owner Sutan Khulifah",
            h=hash_password(ADMIN_PASSWORD),
        )
        logger.info(f"Seeded admin: {ADMIN_EMAIL}")
    elif DEBUG and not verify_password(ADMIN_PASSWORD, existing["password_hash"]):
        # Dev-only: sync admin password from env so devs can reset via .env.
        await q_exec(
            "UPDATE users SET password_hash=:h WHERE email=:e",
            h=hash_password(ADMIN_PASSWORD),
            e=ADMIN_EMAIL.lower(),
        )
        logger.info("Synced admin password from env (DEBUG mode).")

    # Demo kasir seed is gated behind DEBUG flag. Never seed demo accounts
    # in production — they ship with publicly known passwords.
    if DEBUG:
        k = await q_one(
            "SELECT id FROM users WHERE email=:e",
            e="kasir@sutankhulifah.com",
        )
        if not k:
            await q_exec(
                """INSERT INTO users (id, email, name, role, password_hash, is_active, created_at)
                   VALUES (:id, :e, 'Kasir Demo', 'kasir', :h, TRUE, NOW())""",
                id=new_id(),
                e="kasir@sutankhulifah.com",
                h=hash_password("Kasir@2026"),
            )
            logger.info("Seeded demo kasir (DEBUG mode only).")


@app.on_event("shutdown")
async def shutdown():
    await close_database()
