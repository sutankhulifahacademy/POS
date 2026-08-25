from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import logging
import jwt
import bcrypt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict

# ============ CONFIG ============
JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@example.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Sutan Khulifah POS API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============ HELPERS ============
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def new_id() -> str:
    return str(uuid.uuid4())

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=12),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def require_role(*roles):
    async def dep(user: dict = Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Forbidden: insufficient role")
        return user
    return dep

# ============ MODELS ============
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Literal["admin", "manager", "kasir"] = "kasir"

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class BusinessSetup(BaseModel):
    name: str
    business_type: Literal["retail", "fnb", "fashion", "general"]
    currency: str = "IDR"
    tax_rate: float = 0.0
    address: Optional[str] = ""

class OutletIn(BaseModel):
    name: str
    address: Optional[str] = ""
    phone: Optional[str] = ""
    is_main: bool = False

class CategoryIn(BaseModel):
    name: str
    color: Optional[str] = "#D4AF37"

class ProductIn(BaseModel):
    name: str
    sku: str
    barcode: Optional[str] = ""
    category_id: Optional[str] = ""
    price: float
    cost: float = 0.0
    stock: int = 0
    low_stock_threshold: int = 5
    unit: str = "pcs"
    image_url: Optional[str] = ""
    description: Optional[str] = ""
    is_active: bool = True

class StockAdjustIn(BaseModel):
    product_id: str
    delta: int  # positive or negative
    reason: str  # "restock", "sale", "adjustment", "return"
    note: Optional[str] = ""

class CustomerIn(BaseModel):
    name: str
    phone: Optional[str] = ""
    email: Optional[str] = ""
    address: Optional[str] = ""

class SupplierIn(BaseModel):
    name: str
    contact_person: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    address: Optional[str] = ""

class CartItem(BaseModel):
    product_id: str
    name: str
    price: float
    quantity: int

class SaleIn(BaseModel):
    outlet_id: Optional[str] = ""
    customer_id: Optional[str] = ""
    items: List[CartItem]
    payment_method: Literal["cash", "card", "qris", "transfer"] = "cash"
    amount_paid: float
    discount: float = 0.0
    tax: float = 0.0
    note: Optional[str] = ""

# ============ AUTH ROUTES ============
@api.post("/auth/register")
async def register(body: RegisterIn, response: Response):
    email = body.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_doc = {
        "id": new_id(),
        "email": email,
        "name": body.name,
        "role": body.role,
        "password_hash": hash_password(body.password),
        "created_at": now_iso(),
    }
    await db.users.insert_one(user_doc)
    token = create_access_token(user_doc["id"], email, body.role)
    response.set_cookie("access_token", token, httponly=True, secure=True, samesite="none", max_age=43200, path="/")
    return {"id": user_doc["id"], "email": email, "name": body.name, "role": body.role, "token": token}

@api.post("/auth/login")
async def login(body: LoginIn, response: Response):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], email, user["role"])
    response.set_cookie("access_token", token, httponly=True, secure=True, samesite="none", max_age=43200, path="/")
    return {"id": user["id"], "email": email, "name": user["name"], "role": user["role"], "token": token}

@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

# ============ BUSINESS ============
@api.get("/business")
async def get_business(user: dict = Depends(get_current_user)):
    b = await db.business.find_one({}, {"_id": 0})
    return b

@api.post("/business")
async def setup_business(body: BusinessSetup, user: dict = Depends(require_role("admin"))):
    existing = await db.business.find_one({}, {"_id": 0})
    doc = body.model_dump()
    doc["updated_at"] = now_iso()
    if existing:
        await db.business.update_one({"id": existing["id"]}, {"$set": doc})
        merged = {**existing, **doc}
        return merged
    doc["id"] = new_id()
    doc["created_at"] = now_iso()
    await db.business.insert_one(doc)
    doc.pop("_id", None)
    # Create default main outlet
    outlet = {
        "id": new_id(), "name": "Outlet Utama", "address": doc.get("address", ""),
        "phone": "", "is_main": True, "created_at": now_iso()
    }
    if await db.outlets.count_documents({}) == 0:
        await db.outlets.insert_one(outlet)
    return doc

# ============ GENERIC CRUD FACTORY ============
def make_crud(path: str, collection: str, model_cls, role_write=("admin", "manager")):
    @api.get(f"/{path}")
    async def list_items(user: dict = Depends(get_current_user)):
        items = await db[collection].find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
        return items

    @api.post(f"/{path}")
    async def create_item(body: model_cls, user: dict = Depends(require_role(*role_write))):
        doc = body.model_dump()
        doc["id"] = new_id()
        doc["created_at"] = now_iso()
        doc["updated_at"] = now_iso()
        await db[collection].insert_one(doc)
        doc.pop("_id", None)
        return doc

    @api.put(f"/{path}/{{item_id}}")
    async def update_item(item_id: str, body: model_cls, user: dict = Depends(require_role(*role_write))):
        doc = body.model_dump()
        doc["updated_at"] = now_iso()
        result = await db[collection].update_one({"id": item_id}, {"$set": doc})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Not found")
        updated = await db[collection].find_one({"id": item_id}, {"_id": 0})
        return updated

    @api.delete(f"/{path}/{{item_id}}")
    async def delete_item(item_id: str, user: dict = Depends(require_role(*role_write))):
        result = await db[collection].delete_one({"id": item_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Not found")
        return {"ok": True}

make_crud("outlets", "outlets", OutletIn)
make_crud("categories", "categories", CategoryIn)
make_crud("customers", "customers", CustomerIn, role_write=("admin", "manager", "kasir"))
make_crud("suppliers", "suppliers", SupplierIn)

# ============ PRODUCTS (with stock movement handling) ============
@api.get("/products")
async def list_products(user: dict = Depends(get_current_user)):
    items = await db.products.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    return items

@api.post("/products")
async def create_product(body: ProductIn, user: dict = Depends(require_role("admin", "manager"))):
    existing = await db.products.find_one({"sku": body.sku})
    if existing:
        raise HTTPException(status_code=400, detail="SKU already exists")
    doc = body.model_dump()
    doc["id"] = new_id()
    doc["created_at"] = now_iso()
    doc["updated_at"] = now_iso()
    await db.products.insert_one(doc)
    # Log initial stock as movement
    if doc["stock"] > 0:
        await db.stock_movements.insert_one({
            "id": new_id(),
            "product_id": doc["id"],
            "product_name": doc["name"],
            "delta": doc["stock"],
            "reason": "initial",
            "note": "Initial stock",
            "user_id": user["id"],
            "created_at": now_iso(),
        })
    doc.pop("_id", None)
    return doc

@api.put("/products/{product_id}")
async def update_product(product_id: str, body: ProductIn, user: dict = Depends(require_role("admin", "manager"))):
    doc = body.model_dump()
    doc["updated_at"] = now_iso()
    result = await db.products.update_one({"id": product_id}, {"$set": doc})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return await db.products.find_one({"id": product_id}, {"_id": 0})

@api.delete("/products/{product_id}")
async def delete_product(product_id: str, user: dict = Depends(require_role("admin", "manager"))):
    result = await db.products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"ok": True}

@api.post("/inventory/adjust")
async def adjust_stock(body: StockAdjustIn, user: dict = Depends(require_role("admin", "manager"))):
    product = await db.products.find_one({"id": body.product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    new_stock = max(0, product["stock"] + body.delta)
    await db.products.update_one({"id": body.product_id}, {"$set": {"stock": new_stock, "updated_at": now_iso()}})
    movement = {
        "id": new_id(),
        "product_id": body.product_id,
        "product_name": product["name"],
        "delta": body.delta,
        "reason": body.reason,
        "note": body.note,
        "user_id": user["id"],
        "created_at": now_iso(),
    }
    await db.stock_movements.insert_one(movement)
    movement.pop("_id", None)
    return {"product_id": body.product_id, "new_stock": new_stock, "movement": movement}

@api.get("/inventory/movements")
async def list_movements(user: dict = Depends(get_current_user), limit: int = 200):
    items = await db.stock_movements.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return items

# ============ SALES / POS CHECKOUT ============
@api.post("/sales")
async def create_sale(body: SaleIn, user: dict = Depends(get_current_user)):
    if not body.items:
        raise HTTPException(status_code=400, detail="Cart is empty")
    subtotal = 0.0
    # Validate stock and compute totals
    for item in body.items:
        product = await db.products.find_one({"id": item.product_id})
        if not product:
            raise HTTPException(status_code=400, detail=f"Product {item.name} not found")
        if product["stock"] < item.quantity:
            raise HTTPException(status_code=400, detail=f"Insufficient stock for {product['name']}")
        subtotal += item.price * item.quantity
    total = subtotal - body.discount + body.tax
    change = max(0, body.amount_paid - total)
    if body.payment_method == "cash" and body.amount_paid < total:
        raise HTTPException(status_code=400, detail="Insufficient payment amount")

    sale_id = new_id()
    invoice_no = f"INV-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{sale_id[:6].upper()}"
    sale_doc = {
        "id": sale_id,
        "invoice_no": invoice_no,
        "outlet_id": body.outlet_id,
        "customer_id": body.customer_id,
        "cashier_id": user["id"],
        "cashier_name": user.get("name", ""),
        "items": [i.model_dump() for i in body.items],
        "subtotal": subtotal,
        "discount": body.discount,
        "tax": body.tax,
        "total": total,
        "payment_method": body.payment_method,
        "amount_paid": body.amount_paid,
        "change": change,
        "note": body.note,
        "created_at": now_iso(),
    }
    await db.sales.insert_one(sale_doc)

    # Decrement stock + log movements
    for item in body.items:
        await db.products.update_one({"id": item.product_id}, {"$inc": {"stock": -item.quantity}})
        await db.stock_movements.insert_one({
            "id": new_id(),
            "product_id": item.product_id,
            "product_name": item.name,
            "delta": -item.quantity,
            "reason": "sale",
            "note": f"Sale {invoice_no}",
            "user_id": user["id"],
            "created_at": now_iso(),
        })

    # Update customer loyalty
    if body.customer_id:
        points = int(total // 10000)  # 1 point per Rp 10.000
        await db.customers.update_one(
            {"id": body.customer_id},
            {"$inc": {"loyalty_points": points, "total_spent": total, "visit_count": 1}}
        )

    sale_doc.pop("_id", None)
    return sale_doc

@api.get("/sales")
async def list_sales(user: dict = Depends(get_current_user), limit: int = 200):
    items = await db.sales.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return items

@api.get("/sales/{sale_id}")
async def get_sale(sale_id: str, user: dict = Depends(get_current_user)):
    sale = await db.sales.find_one({"id": sale_id}, {"_id": 0})
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    return sale

# ============ REPORTS ============
@api.get("/reports/dashboard")
async def report_dashboard(user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    sales = await db.sales.find({}, {"_id": 0}).to_list(10000)
    products = await db.products.find({}, {"_id": 0}).to_list(5000)
    customers_count = await db.customers.count_documents({})

    today_sales = [s for s in sales if s["created_at"].startswith(today)]
    revenue_today = sum(s["total"] for s in today_sales)
    revenue_total = sum(s["total"] for s in sales)
    items_sold_today = sum(sum(i["quantity"] for i in s["items"]) for s in today_sales)
    low_stock = [p for p in products if p["stock"] <= p.get("low_stock_threshold", 5)]

    # Last 7 days
    daily = {}
    for s in sales:
        d = s["created_at"][:10]
        daily[d] = daily.get(d, 0) + s["total"]
    # Sort last 7 days
    sorted_days = sorted(daily.items())[-7:]

    # Top products
    product_sales = {}
    for s in sales:
        for i in s["items"]:
            key = i["product_id"]
            if key not in product_sales:
                product_sales[key] = {"name": i["name"], "quantity": 0, "revenue": 0}
            product_sales[key]["quantity"] += i["quantity"]
            product_sales[key]["revenue"] += i["price"] * i["quantity"]
    top_products = sorted(product_sales.values(), key=lambda x: x["revenue"], reverse=True)[:5]

    return {
        "revenue_today": revenue_today,
        "revenue_total": revenue_total,
        "transactions_today": len(today_sales),
        "transactions_total": len(sales),
        "items_sold_today": items_sold_today,
        "products_count": len(products),
        "customers_count": customers_count,
        "low_stock_count": len(low_stock),
        "low_stock_items": low_stock[:10],
        "daily_revenue": [{"date": d, "revenue": r} for d, r in sorted_days],
        "top_products": top_products,
    }

# ============ SEED / STARTUP ============
@app.on_event("startup")
async def startup_event():
    await db.users.create_index("email", unique=True)
    await db.products.create_index("sku", unique=True)
    # Seed admin
    existing = await db.users.find_one({"email": ADMIN_EMAIL.lower()})
    if not existing:
        await db.users.insert_one({
            "id": new_id(),
            "email": ADMIN_EMAIL.lower(),
            "name": "Owner Sutan Khulifah",
            "role": "admin",
            "password_hash": hash_password(ADMIN_PASSWORD),
            "created_at": now_iso(),
        })
        logger.info(f"Seeded admin: {ADMIN_EMAIL}")
    elif not verify_password(ADMIN_PASSWORD, existing["password_hash"]):
        await db.users.update_one(
            {"email": ADMIN_EMAIL.lower()},
            {"$set": {"password_hash": hash_password(ADMIN_PASSWORD)}}
        )
    # Seed sample kasir
    kasir = await db.users.find_one({"email": "kasir@sutankhulifah.com"})
    if not kasir:
        await db.users.insert_one({
            "id": new_id(),
            "email": "kasir@sutankhulifah.com",
            "name": "Kasir Demo",
            "role": "kasir",
            "password_hash": hash_password("Kasir@2026"),
            "created_at": now_iso(),
        })

@app.on_event("shutdown")
async def shutdown_event():
    client.close()

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
