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

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from config import CORS_ORIGINS, ADMIN_EMAIL, ADMIN_PASSWORD
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

# ============ APP ============
app = FastAPI(title="Sutan Khulifah POS API (PostgreSQL)")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============ MOUNT ROUTERS ============
app.include_router(auth_router, prefix="/api")
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

# ============ CORS ============
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
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
    # Seed admin
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
    elif not verify_password(ADMIN_PASSWORD, existing["password_hash"]):
        await q_exec(
            "UPDATE users SET password_hash=:h WHERE email=:e",
            h=hash_password(ADMIN_PASSWORD),
            e=ADMIN_EMAIL.lower(),
        )

    # Seed sample kasir
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


@app.on_event("shutdown")
async def shutdown():
    await close_database()
