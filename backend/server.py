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

class VariantIn(BaseModel):
    name: str
    sku: Optional[str] = ""
    price: float
    stock: int = 0

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
    variants: Optional[List[VariantIn]] = []

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
    variant_name: Optional[str] = ""
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

class POItem(BaseModel):
    product_id: str
    name: str
    quantity: int
    cost: float

class POIn(BaseModel):
    supplier_id: str
    supplier_name: str
    items: List[POItem]
    note: Optional[str] = ""

class ShiftOpenIn(BaseModel):
    outlet_id: Optional[str] = ""
    opening_cash: float = 0.0
    note: Optional[str] = ""

class ShiftCloseIn(BaseModel):
    actual_cash: float
    note: Optional[str] = ""

class UserCreateIn(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Literal["admin", "manager", "kasir"] = "kasir"

class UserUpdateIn(BaseModel):
    name: Optional[str] = None
    role: Optional[Literal["admin", "manager", "kasir"]] = None
    is_active: Optional[bool] = None

class PasswordResetIn(BaseModel):
    new_password: str

class TransferItem(BaseModel):
    product_id: str
    name: str
    quantity: int

class TransferIn(BaseModel):
    from_outlet_id: str
    to_outlet_id: str
    from_outlet_name: str
    to_outlet_name: str
    items: List[TransferItem]
    note: Optional[str] = ""

class TableIn(BaseModel):
    name: str
    capacity: int = 2
    outlet_id: Optional[str] = ""
    zone: Optional[str] = "Utama"

class OrderItemIn(BaseModel):
    product_id: str
    name: str
    price: float
    quantity: int
    variant_name: Optional[str] = ""
    note: Optional[str] = ""

class OrderOpenIn(BaseModel):
    table_id: str
    outlet_id: Optional[str] = ""
    guest_count: int = 1
    items: Optional[List[OrderItemIn]] = []

class OrderUpdateItemsIn(BaseModel):
    items: List[OrderItemIn]

class OrderCheckoutIn(BaseModel):
    payment_method: Literal["cash", "card", "qris", "transfer"] = "cash"
    amount_paid: float
    discount: float = 0.0
    tax: float = 0.0
    customer_id: Optional[str] = ""

class QRISCreateIn(BaseModel):
    amount: int
    description: Optional[str] = "POS checkout"

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

@api.get("/products/by-barcode/{code}")
async def product_by_barcode(code: str, user: dict = Depends(get_current_user)):
    p = await db.products.find_one({"$or": [{"barcode": code}, {"sku": code}]}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    return p

# ============ PURCHASE ORDERS ============
@api.get("/purchase-orders")
async def list_pos(user: dict = Depends(get_current_user)):
    items = await db.purchase_orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items

@api.post("/purchase-orders")
async def create_po(body: POIn, user: dict = Depends(require_role("admin", "manager"))):
    total = sum(i.quantity * i.cost for i in body.items)
    po_no = f"PO-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    doc = {
        "id": new_id(),
        "po_no": po_no,
        "supplier_id": body.supplier_id,
        "supplier_name": body.supplier_name,
        "items": [i.model_dump() for i in body.items],
        "total": total,
        "status": "draft",  # draft | received | cancelled
        "note": body.note,
        "created_by": user["id"],
        "created_at": now_iso(),
        "received_at": None,
    }
    await db.purchase_orders.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.post("/purchase-orders/{po_id}/receive")
async def receive_po(po_id: str, user: dict = Depends(require_role("admin", "manager"))):
    po = await db.purchase_orders.find_one({"id": po_id})
    if not po:
        raise HTTPException(status_code=404, detail="PO not found")
    if po["status"] != "draft":
        raise HTTPException(status_code=400, detail=f"PO status is {po['status']}")
    for item in po["items"]:
        await db.products.update_one({"id": item["product_id"]}, {"$inc": {"stock": item["quantity"]}, "$set": {"updated_at": now_iso()}})
        main_outlet = await _get_main_outlet_id()
        if main_outlet:
            await _adjust_outlet_stock(item["product_id"], main_outlet, item["quantity"])
        await db.stock_movements.insert_one({
            "id": new_id(),
            "product_id": item["product_id"],
            "product_name": item["name"],
            "delta": item["quantity"],
            "reason": "purchase",
            "note": f"PO {po['po_no']}",
            "outlet_id": main_outlet,
            "user_id": user["id"],
            "created_at": now_iso(),
        })
    await db.purchase_orders.update_one({"id": po_id}, {"$set": {"status": "received", "received_at": now_iso()}})
    return {"ok": True, "po_id": po_id}

@api.delete("/purchase-orders/{po_id}")
async def delete_po(po_id: str, user: dict = Depends(require_role("admin", "manager"))):
    result = await db.purchase_orders.delete_one({"id": po_id, "status": "draft"})
    if result.deleted_count == 0:
        raise HTTPException(status_code=400, detail="Cannot delete: not draft or not found")
    return {"ok": True}

# ============ SHIFTS ============
@api.get("/shifts/active")
async def active_shift(user: dict = Depends(get_current_user)):
    s = await db.shifts.find_one({"cashier_id": user["id"], "status": "open"}, {"_id": 0})
    return s

@api.get("/shifts")
async def list_shifts(user: dict = Depends(get_current_user), limit: int = 100):
    items = await db.shifts.find({}, {"_id": 0}).sort("opened_at", -1).to_list(limit)
    return items

@api.post("/shifts/open")
async def open_shift(body: ShiftOpenIn, user: dict = Depends(get_current_user)):
    existing = await db.shifts.find_one({"cashier_id": user["id"], "status": "open"})
    if existing:
        raise HTTPException(status_code=400, detail="Shift already open")
    doc = {
        "id": new_id(),
        "cashier_id": user["id"],
        "cashier_name": user.get("name", ""),
        "outlet_id": body.outlet_id,
        "opening_cash": body.opening_cash,
        "status": "open",
        "opened_at": now_iso(),
        "closed_at": None,
        "actual_cash": None,
        "expected_cash": None,
        "difference": None,
        "cash_sales": 0.0,
        "non_cash_sales": 0.0,
        "transaction_count": 0,
        "note": body.note,
    }
    await db.shifts.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.post("/shifts/close")
async def close_shift(body: ShiftCloseIn, user: dict = Depends(get_current_user)):
    shift = await db.shifts.find_one({"cashier_id": user["id"], "status": "open"})
    if not shift:
        raise HTTPException(status_code=400, detail="No open shift")
    # Aggregate sales in shift
    sales = await db.sales.find({"shift_id": shift["id"]}).to_list(5000)
    cash_sales = sum(s["total"] for s in sales if s.get("payment_method") == "cash")
    non_cash_sales = sum(s["total"] for s in sales if s.get("payment_method") != "cash")
    expected_cash = shift["opening_cash"] + cash_sales
    difference = body.actual_cash - expected_cash
    update = {
        "status": "closed",
        "closed_at": now_iso(),
        "actual_cash": body.actual_cash,
        "expected_cash": expected_cash,
        "difference": difference,
        "cash_sales": cash_sales,
        "non_cash_sales": non_cash_sales,
        "transaction_count": len(sales),
        "close_note": body.note,
    }
    await db.shifts.update_one({"id": shift["id"]}, {"$set": update})
    return {**shift, **update, "_id": None}

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
    active_shift_doc = await db.shifts.find_one({"cashier_id": user["id"], "status": "open"})
    shift_id = active_shift_doc["id"] if active_shift_doc else None
    sale_doc = {
        "id": sale_id,
        "invoice_no": invoice_no,
        "shift_id": shift_id,
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
        if body.outlet_id:
            await _adjust_outlet_stock(item.product_id, body.outlet_id, -item.quantity)
        await db.stock_movements.insert_one({
            "id": new_id(),
            "product_id": item.product_id,
            "product_name": item.name,
            "delta": -item.quantity,
            "reason": "sale",
            "note": f"Sale {invoice_no}",
            "outlet_id": body.outlet_id,
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

# ============ USER MANAGEMENT (admin only) ============
@api.get("/users")
async def list_users(user: dict = Depends(require_role("admin"))):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)
    return users

@api.post("/users")
async def create_user(body: UserCreateIn, user: dict = Depends(require_role("admin"))):
    email = body.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email sudah terdaftar")
    doc = {
        "id": new_id(),
        "email": email,
        "name": body.name,
        "role": body.role,
        "password_hash": hash_password(body.password),
        "is_active": True,
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc

@api.put("/users/{user_id}")
async def update_user(user_id: str, body: UserUpdateIn, user: dict = Depends(require_role("admin"))):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No updates")
    updates["updated_at"] = now_iso()
    result = await db.users.update_one({"id": user_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    updated = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return updated

@api.post("/users/{user_id}/reset-password")
async def reset_user_password(user_id: str, body: PasswordResetIn, user: dict = Depends(require_role("admin"))):
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password minimal 6 karakter")
    result = await db.users.update_one({"id": user_id}, {"$set": {"password_hash": hash_password(body.new_password), "updated_at": now_iso()}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}

@api.delete("/users/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(require_role("admin"))):
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Tidak bisa menghapus akun sendiri")
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}

# ============ STOCK TRANSFERS ============
@api.get("/stock-transfers")
async def list_transfers(user: dict = Depends(get_current_user), limit: int = 200):
    items = await db.stock_transfers.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return items

@api.post("/stock-transfers")
async def create_transfer(body: TransferIn, user: dict = Depends(require_role("admin", "manager"))):
    if body.from_outlet_id == body.to_outlet_id:
        raise HTTPException(status_code=400, detail="Outlet sumber dan tujuan tidak boleh sama")
    if not body.items:
        raise HTTPException(status_code=400, detail="Item tidak boleh kosong")
    # Validate products exist & stock
    for it in body.items:
        p = await db.products.find_one({"id": it.product_id})
        if not p:
            raise HTTPException(status_code=400, detail=f"Produk {it.name} tidak ditemukan")
        if p["stock"] < it.quantity:
            raise HTTPException(status_code=400, detail=f"Stok {p['name']} tidak cukup untuk transfer")
    transfer_no = f"TRF-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    transfer_id = new_id()
    doc = {
        "id": transfer_id,
        "transfer_no": transfer_no,
        "from_outlet_id": body.from_outlet_id,
        "to_outlet_id": body.to_outlet_id,
        "from_outlet_name": body.from_outlet_name,
        "to_outlet_name": body.to_outlet_name,
        "items": [i.model_dump() for i in body.items],
        "total_quantity": sum(i.quantity for i in body.items),
        "note": body.note,
        "status": "completed",
        "created_by": user["id"],
        "created_by_name": user.get("name", ""),
        "created_at": now_iso(),
    }
    await db.stock_transfers.insert_one(doc)
    # Log two movements per item for audit
    for it in body.items:
        await db.stock_movements.insert_one({
            "id": new_id(),
            "product_id": it.product_id,
            "product_name": it.name,
            "delta": -it.quantity,
            "reason": "transfer_out",
            "note": f"{transfer_no} → {body.to_outlet_name}",
            "outlet_id": body.from_outlet_id,
            "user_id": user["id"],
            "created_at": now_iso(),
        })
        await _adjust_outlet_stock(it.product_id, body.from_outlet_id, -it.quantity)
        await db.stock_movements.insert_one({
            "id": new_id(),
            "product_id": it.product_id,
            "product_name": it.name,
            "delta": it.quantity,
            "reason": "transfer_in",
            "note": f"{transfer_no} ← {body.from_outlet_name}",
            "outlet_id": body.to_outlet_id,
            "user_id": user["id"],
            "created_at": now_iso(),
        })
        await _adjust_outlet_stock(it.product_id, body.to_outlet_id, it.quantity)
    doc.pop("_id", None)
    return doc

# ============ SEED / STARTUP ============
async def _get_main_outlet_id():
    o = await db.outlets.find_one({"is_main": True})
    if not o:
        o = await db.outlets.find_one({})
    return o["id"] if o else None

async def _get_outlet_stock(product_id: str, outlet_id: str) -> int:
    entry = await db.outlet_stocks.find_one({"product_id": product_id, "outlet_id": outlet_id})
    if entry is None:
        # Lazy-init: if this is the main outlet, seed from product.stock; else 0
        product = await db.products.find_one({"id": product_id}, {"_id": 0, "stock": 1})
        main_id = await _get_main_outlet_id()
        qty = product["stock"] if (product and outlet_id == main_id) else 0
        await db.outlet_stocks.insert_one({"product_id": product_id, "outlet_id": outlet_id, "quantity": qty, "updated_at": now_iso()})
        return qty
    return entry["quantity"]

async def _adjust_outlet_stock(product_id: str, outlet_id: str, delta: int):
    await _get_outlet_stock(product_id, outlet_id)  # ensure exists
    await db.outlet_stocks.update_one({"product_id": product_id, "outlet_id": outlet_id}, {"$inc": {"quantity": delta}, "$set": {"updated_at": now_iso()}})

# ============ TABLES (F&B) ============
make_crud_placeholder = None  # avoid unused

@api.get("/tables")
async def list_tables(user: dict = Depends(get_current_user)):
    tables = await db.tables.find({}, {"_id": 0}).sort("name", 1).to_list(500)
    # Attach active order id if any
    for t in tables:
        active = await db.orders.find_one({"table_id": t["id"], "status": "open"}, {"_id": 0})
        t["active_order_id"] = active["id"] if active else None
        t["active_order_total"] = active["total"] if active else 0
    return tables

@api.post("/tables")
async def create_table(body: TableIn, user: dict = Depends(require_role("admin", "manager"))):
    doc = body.model_dump()
    doc["id"] = new_id()
    doc["status"] = "available"
    doc["created_at"] = now_iso()
    await db.tables.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.put("/tables/{table_id}")
async def update_table(table_id: str, body: TableIn, user: dict = Depends(require_role("admin", "manager"))):
    doc = body.model_dump()
    doc["updated_at"] = now_iso()
    result = await db.tables.update_one({"id": table_id}, {"$set": doc})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Meja tidak ditemukan")
    return await db.tables.find_one({"id": table_id}, {"_id": 0})

@api.delete("/tables/{table_id}")
async def delete_table(table_id: str, user: dict = Depends(require_role("admin", "manager"))):
    open_order = await db.orders.find_one({"table_id": table_id, "status": "open"})
    if open_order:
        raise HTTPException(status_code=400, detail="Meja masih memiliki order terbuka")
    result = await db.tables.delete_one({"id": table_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Meja tidak ditemukan")
    return {"ok": True}

# ============ ORDERS (Dine-in) ============
def _calc_order_total(items):
    return sum(i["price"] * i["quantity"] for i in items)

@api.get("/orders")
async def list_orders(status: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {}
    if status:
        q["status"] = status
    items = await db.orders.find(q, {"_id": 0}).sort("opened_at", -1).to_list(500)
    return items

@api.post("/orders")
async def open_order(body: OrderOpenIn, user: dict = Depends(get_current_user)):
    table = await db.tables.find_one({"id": body.table_id}, {"_id": 0})
    if not table:
        raise HTTPException(status_code=404, detail="Meja tidak ditemukan")
    existing = await db.orders.find_one({"table_id": body.table_id, "status": "open"})
    if existing:
        raise HTTPException(status_code=400, detail="Meja sudah memiliki order terbuka")
    items = [i.model_dump() for i in (body.items or [])]
    doc = {
        "id": new_id(),
        "order_no": f"ORD-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
        "table_id": body.table_id,
        "table_name": table["name"],
        "outlet_id": body.outlet_id or table.get("outlet_id", ""),
        "guest_count": body.guest_count,
        "items": items,
        "total": _calc_order_total(items),
        "status": "open",
        "cashier_id": user["id"],
        "cashier_name": user.get("name", ""),
        "opened_at": now_iso(),
        "closed_at": None,
    }
    await db.orders.insert_one(doc)
    await db.tables.update_one({"id": body.table_id}, {"$set": {"status": "occupied"}})
    doc.pop("_id", None)
    return doc

@api.put("/orders/{order_id}/items")
async def update_order_items(order_id: str, body: OrderUpdateItemsIn, user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id})
    if not order or order["status"] != "open":
        raise HTTPException(status_code=400, detail="Order tidak aktif")
    items = [i.model_dump() for i in body.items]
    await db.orders.update_one({"id": order_id}, {"$set": {"items": items, "total": _calc_order_total(items), "updated_at": now_iso()}})
    return await db.orders.find_one({"id": order_id}, {"_id": 0})

@api.post("/orders/{order_id}/checkout")
async def checkout_order(order_id: str, body: OrderCheckoutIn, user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id})
    if not order or order["status"] != "open":
        raise HTTPException(status_code=400, detail="Order tidak aktif")
    if not order["items"]:
        raise HTTPException(status_code=400, detail="Order kosong")
    subtotal = _calc_order_total(order["items"])
    total = subtotal - body.discount + body.tax
    if body.payment_method == "cash" and body.amount_paid < total:
        raise HTTPException(status_code=400, detail="Uang bayar kurang")
    # Validate stock
    for it in order["items"]:
        p = await db.products.find_one({"id": it["product_id"]})
        if not p or p["stock"] < it["quantity"]:
            raise HTTPException(status_code=400, detail=f"Stok kurang untuk {it['name']}")
    change = max(0, body.amount_paid - total)
    sale_id = new_id()
    invoice_no = f"INV-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{sale_id[:6].upper()}"
    active_shift_doc = await db.shifts.find_one({"cashier_id": user["id"], "status": "open"})
    shift_id = active_shift_doc["id"] if active_shift_doc else None
    outlet_id = order.get("outlet_id") or await _get_main_outlet_id()
    sale_doc = {
        "id": sale_id,
        "invoice_no": invoice_no,
        "shift_id": shift_id,
        "outlet_id": outlet_id,
        "customer_id": body.customer_id or "",
        "cashier_id": user["id"],
        "cashier_name": user.get("name", ""),
        "items": order["items"],
        "subtotal": subtotal,
        "discount": body.discount,
        "tax": body.tax,
        "total": total,
        "payment_method": body.payment_method,
        "amount_paid": body.amount_paid,
        "change": change,
        "source": "dine-in",
        "table_id": order["table_id"],
        "table_name": order["table_name"],
        "note": "",
        "created_at": now_iso(),
    }
    await db.sales.insert_one(sale_doc)
    # Decrement stock + outlet stock + log movements
    for it in order["items"]:
        await db.products.update_one({"id": it["product_id"]}, {"$inc": {"stock": -it["quantity"]}})
        if outlet_id:
            await _adjust_outlet_stock(it["product_id"], outlet_id, -it["quantity"])
        await db.stock_movements.insert_one({
            "id": new_id(), "product_id": it["product_id"], "product_name": it["name"],
            "delta": -it["quantity"], "reason": "sale", "note": f"Sale {invoice_no}",
            "outlet_id": outlet_id, "user_id": user["id"], "created_at": now_iso(),
        })
    # Close order + free table
    await db.orders.update_one({"id": order_id}, {"$set": {"status": "closed", "closed_at": now_iso(), "sale_id": sale_id}})
    await db.tables.update_one({"id": order["table_id"]}, {"$set": {"status": "available"}})
    sale_doc.pop("_id", None)
    return sale_doc

@api.delete("/orders/{order_id}")
async def cancel_order(order_id: str, user: dict = Depends(require_role("admin", "manager", "kasir"))):
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order tidak ditemukan")
    if order["status"] != "open":
        raise HTTPException(status_code=400, detail="Order sudah selesai")
    await db.orders.update_one({"id": order_id}, {"$set": {"status": "cancelled", "closed_at": now_iso()}})
    await db.tables.update_one({"id": order["table_id"]}, {"$set": {"status": "available"}})
    return {"ok": True}

# ============ PER-OUTLET STOCK ============
@api.get("/outlet-stocks/{outlet_id}")
async def get_outlet_stocks(outlet_id: str, user: dict = Depends(get_current_user)):
    entries = await db.outlet_stocks.find({"outlet_id": outlet_id}, {"_id": 0}).to_list(5000)
    return entries

# ============ MIDTRANS QRIS ============
import base64, hashlib, hmac, io
try:
    import httpx as _httpx
    import qrcode as _qrcode
    _midtrans_libs_ok = True
except Exception:
    _midtrans_libs_ok = False

def _midtrans_auth_header():
    key = os.environ.get("MIDTRANS_SERVER_KEY", "")
    if not key:
        raise HTTPException(status_code=503, detail="Midtrans belum dikonfigurasi. Tambahkan MIDTRANS_SERVER_KEY di .env")
    token = base64.b64encode(f"{key}:".encode()).decode()
    return {"Authorization": f"Basic {token}", "Accept": "application/json"}

def _qr_data_uri(qr_string: str) -> str:
    img = _qrcode.make(qr_string)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

@api.post("/payments/qris")
async def create_qris(body: QRISCreateIn, user: dict = Depends(get_current_user)):
    if not _midtrans_libs_ok:
        raise HTTPException(status_code=503, detail="Midtrans libraries not installed")
    headers = _midtrans_auth_header()
    base = os.environ.get("MIDTRANS_BASE_URL", "https://api.sandbox.midtrans.com").rstrip("/")
    order_id = f"POS-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{new_id()[:8]}"
    payload = {
        "payment_type": "qris",
        "transaction_details": {"order_id": order_id, "gross_amount": body.amount},
        "qris": {"acquirer": "gopay"},
        "custom_expiry": {"expiry_duration": 15, "unit": "minute"},
    }
    async with _httpx.AsyncClient(timeout=15) as http:
        r = await http.post(f"{base}/v2/charge", json=payload, headers={**headers, "Content-Type": "application/json"})
    if r.status_code not in (200, 201):
        raise HTTPException(status_code=r.status_code, detail=r.text)
    result = r.json()
    qr_string = result.get("qr_string")
    if not qr_string:
        raise HTTPException(status_code=502, detail="Midtrans tidak mengembalikan qr_string")
    await db.qris_orders.insert_one({
        "order_id": order_id, "amount": body.amount, "description": body.description,
        "transaction_id": result.get("transaction_id"),
        "status": result.get("transaction_status", "pending"),
        "fraud_status": result.get("fraud_status"),
        "qr_string": qr_string, "created_at": now_iso(),
    })
    return {
        "order_id": order_id, "transaction_id": result.get("transaction_id"),
        "amount": body.amount, "status": result.get("transaction_status", "pending"),
        "qr_image": _qr_data_uri(qr_string),
    }

@api.get("/payments/{order_id}")
async def payment_status(order_id: str, user: dict = Depends(get_current_user)):
    local = await db.qris_orders.find_one({"order_id": order_id}, {"_id": 0})
    if not local:
        raise HTTPException(status_code=404, detail="Order tidak ditemukan")
    try:
        headers = _midtrans_auth_header()
        base = os.environ.get("MIDTRANS_BASE_URL", "https://api.sandbox.midtrans.com").rstrip("/")
        async with _httpx.AsyncClient(timeout=10) as http:
            r = await http.get(f"{base}/v2/{order_id}/status", headers=headers)
        if r.status_code == 200:
            result = r.json()
            status = result.get("transaction_status", "unknown")
            fraud = result.get("fraud_status")
            if local["status"] not in ("settlement", "capture"):
                await db.qris_orders.update_one({"order_id": order_id}, {"$set": {"status": status, "fraud_status": fraud, "updated_at": now_iso()}})
                local["status"] = status
                local["fraud_status"] = fraud
    except Exception:
        pass
    paid = local["status"] in ("settlement", "capture") and (local.get("fraud_status") is None or local.get("fraud_status", "").lower() == "accept")
    return {"order_id": order_id, "status": local["status"], "paid": paid}

@api.post("/midtrans/webhook")
async def midtrans_webhook(request: Request):
    data = await request.json()
    order_id = str(data.get("order_id", ""))
    status_code = str(data.get("status_code", ""))
    gross_amount = str(data.get("gross_amount", ""))
    received = str(data.get("signature_key", ""))
    key = os.environ.get("MIDTRANS_SERVER_KEY", "")
    if not key:
        raise HTTPException(status_code=503, detail="Midtrans not configured")
    expected = hashlib.sha512(f"{order_id}{status_code}{gross_amount}{key}".encode()).hexdigest()
    if not hmac.compare_digest(expected, received):
        raise HTTPException(status_code=403, detail="Invalid signature")
    local = await db.qris_orders.find_one({"order_id": order_id})
    if not local:
        raise HTTPException(status_code=404, detail="Unknown order")
    new_status = str(data.get("transaction_status", ""))
    if local["status"] not in ("settlement", "capture"):
        await db.qris_orders.update_one({"order_id": order_id}, {"$set": {
            "status": new_status, "fraud_status": data.get("fraud_status"),
            "updated_at": now_iso(),
        }})
    return {"ok": True}

# ============ SEED / STARTUP (moved) ============
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
