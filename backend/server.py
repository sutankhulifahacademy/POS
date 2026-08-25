"""Sutan Khulifah POS - PostgreSQL backend (SQLAlchemy async + raw SQL for pragmatic clarity)."""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os, uuid, json, logging, base64, hashlib, hmac, io
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal, Any
import jwt
import bcrypt

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import text

# ============ CONFIG ============
JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]
POSTGRES_URL = os.environ["POSTGRES_URL"]
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@example.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")

engine = create_async_engine(POSTGRES_URL, pool_pre_ping=True, pool_size=10, max_overflow=20)

app = FastAPI(title="Sutan Khulifah POS API (PostgreSQL)")
api = APIRouter(prefix="/api")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============ DB HELPERS ============
async def q_all(sql: str, **params):
    async with engine.begin() as conn:
        r = await conn.execute(text(sql), params)
        return [dict(m) for m in r.mappings().all()]

async def q_one(sql: str, **params):
    async with engine.begin() as conn:
        r = await conn.execute(text(sql), params)
        row = r.mappings().first()
        return dict(row) if row else None

async def q_exec(sql: str, **params):
    async with engine.begin() as conn:
        r = await conn.execute(text(sql), params)
        return r

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def new_id():
    return str(uuid.uuid4())

def _serialize(v):
    """Convert non-JSON-serializable values (UUID, datetime) to str."""
    if isinstance(v, uuid.UUID):
        return str(v)
    if isinstance(v, datetime):
        return v.isoformat()
    return v

def clean(row):
    if row is None:
        return None
    return {k: _serialize(v) for k, v in row.items()}

def clean_list(rows):
    return [clean(r) for r in rows]

def hash_password(pw): return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()
def verify_password(pw, hashed):
    try: return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception: return False

def create_token(uid, email, role):
    return jwt.encode({"sub": uid, "email": email, "role": role,
                       "exp": datetime.now(timezone.utc) + timedelta(hours=12),
                       "type": "access"}, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request):
    token = request.cookies.get("access_token") or ""
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "): token = auth[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await q_one("SELECT id, email, name, role, is_active FROM users WHERE id = :id", id=payload["sub"])
        if not user: raise HTTPException(401, "User not found")
        return clean(user)
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

def require_role(*roles):
    async def dep(user: dict = Depends(get_current_user)):
        if user["role"] not in roles: raise HTTPException(403, "Forbidden")
        return user
    return dep

# ============ MODELS ============
class RegisterIn(BaseModel):
    email: EmailStr; password: str; name: str; role: Literal["admin","manager","kasir"]="kasir"
class LoginIn(BaseModel):
    email: EmailStr; password: str
class BusinessIn(BaseModel):
    name: str; business_type: Literal["retail","fnb","fashion","general"]; currency: str="IDR"; tax_rate: float=0.0; address: Optional[str]=""
class OutletIn(BaseModel):
    name: str; address: Optional[str]=""; phone: Optional[str]=""; is_main: bool=False
class CategoryIn(BaseModel):
    name: str; color: Optional[str]="#F4C842"
class VariantIn(BaseModel):
    name: str; sku: Optional[str]=""; price: float; stock: int=0
class ProductIn(BaseModel):
    name: str; sku: str; barcode: Optional[str]=""; category_id: Optional[str]=""; price: float
    cost: float=0.0; stock: int=0; low_stock_threshold: int=5; unit: str="pcs"
    image_url: Optional[str]=""; description: Optional[str]=""; is_active: bool=True
    variants: Optional[List[VariantIn]]=[]
class StockAdjustIn(BaseModel):
    product_id: str; delta: int; reason: str; note: Optional[str]=""
class CustomerIn(BaseModel):
    name: str; phone: Optional[str]=""; email: Optional[str]=""; address: Optional[str]=""
class SupplierIn(BaseModel):
    name: str; contact_person: Optional[str]=""; phone: Optional[str]=""; email: Optional[str]=""; address: Optional[str]=""
class CartItem(BaseModel):
    product_id: str; variant_name: Optional[str]=""; name: str; price: float; quantity: int
class SaleIn(BaseModel):
    outlet_id: Optional[str]=""; customer_id: Optional[str]=""; items: List[CartItem]
    payment_method: Literal["cash","card","qris","transfer"]="cash"; amount_paid: float
    discount: float=0.0; tax: float=0.0; note: Optional[str]=""
class POItem(BaseModel):
    product_id: str; name: str; quantity: int; cost: float
class POIn(BaseModel):
    supplier_id: str; supplier_name: str; items: List[POItem]; note: Optional[str]=""
class ShiftOpenIn(BaseModel):
    outlet_id: Optional[str]=""; opening_cash: float=0.0; note: Optional[str]=""
class ShiftCloseIn(BaseModel):
    actual_cash: float; note: Optional[str]=""
class UserCreateIn(BaseModel):
    email: EmailStr; password: str; name: str; role: Literal["admin","manager","kasir"]="kasir"
    phone: Optional[str] = ""
    address: Optional[str] = ""
    job_title: Optional[str] = ""
    photo: Optional[str] = ""
    ktp_image: Optional[str] = ""
    ktp_number: Optional[str] = ""

class UserUpdateIn(BaseModel):
    name: Optional[str] = None
    role: Optional[Literal["admin","manager","kasir"]] = None
    is_active: Optional[bool] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    job_title: Optional[str] = None
    photo: Optional[str] = None
    ktp_image: Optional[str] = None
    ktp_number: Optional[str] = None
class PasswordResetIn(BaseModel):
    new_password: str
class TransferItem(BaseModel):
    product_id: str; name: str; quantity: int
class TransferIn(BaseModel):
    from_outlet_id: str; to_outlet_id: str; from_outlet_name: str; to_outlet_name: str
    items: List[TransferItem]; note: Optional[str]=""
class TableIn(BaseModel):
    name: str; capacity: int=2; outlet_id: Optional[str]=""; zone: Optional[str]="Utama"
class OrderItemIn(BaseModel):
    product_id: str; name: str; price: float; quantity: int; variant_name: Optional[str]=""; note: Optional[str]=""
class OrderOpenIn(BaseModel):
    table_id: str; outlet_id: Optional[str]=""; guest_count: int=1; items: Optional[List[OrderItemIn]]=[]
class OrderUpdateItemsIn(BaseModel):
    items: List[OrderItemIn]
class OrderCheckoutIn(BaseModel):
    payment_method: Literal["cash","card","qris","transfer"]="cash"; amount_paid: float
    discount: float=0.0; tax: float=0.0; customer_id: Optional[str]=""
class QRISCreateIn(BaseModel):
    amount: int; description: Optional[str]="POS checkout"

# ============ HELPERS ============
def _u(v):
    """Convert empty string to None for UUID columns."""
    return None if not v or v == "" else v

# ============ AUTH ============
@api.post("/auth/register")
async def register(body: RegisterIn, response: Response):
    email = body.email.lower()
    exists = await q_one("SELECT id FROM users WHERE email = :e", e=email)
    if exists: raise HTTPException(400, "Email already registered")
    uid = new_id()
    await q_exec("""INSERT INTO users (id, email, name, role, password_hash, is_active, created_at)
                    VALUES (:id, :e, :n, :r, :h, TRUE, NOW())""",
                 id=uid, e=email, n=body.name, r=body.role, h=hash_password(body.password))
    tok = create_token(uid, email, body.role)
    response.set_cookie("access_token", tok, httponly=True, secure=True, samesite="none", max_age=43200, path="/")
    return {"id": uid, "email": email, "name": body.name, "role": body.role, "token": tok}

@api.post("/auth/login")
async def login(body: LoginIn, response: Response):
    email = body.email.lower()
    u = await q_one("SELECT id, email, name, role, password_hash FROM users WHERE email = :e", e=email)
    if not u or not verify_password(body.password, u["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    tok = create_token(str(u["id"]), u["email"], u["role"])
    response.set_cookie("access_token", tok, httponly=True, secure=True, samesite="none", max_age=43200, path="/")
    return {"id": str(u["id"]), "email": u["email"], "name": u["name"], "role": u["role"], "token": tok}

@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}

@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user

# ============ BUSINESS ============
@api.get("/business")
async def get_business(user=Depends(get_current_user)):
    return clean(await q_one("SELECT * FROM business LIMIT 1"))

@api.post("/business")
async def setup_business(body: BusinessIn, user=Depends(require_role("admin"))):
    existing = await q_one("SELECT id FROM business LIMIT 1")
    if existing:
        await q_exec("""UPDATE business SET name=:n, business_type=:bt, currency=:c, tax_rate=:t, address=:a, updated_at=NOW()
                        WHERE id=:id""", id=existing["id"], n=body.name, bt=body.business_type,
                     c=body.currency, t=body.tax_rate, a=body.address or "")
    else:
        await q_exec("""INSERT INTO business (id, name, business_type, currency, tax_rate, address, created_at)
                        VALUES (:id, :n, :bt, :c, :t, :a, NOW())""",
                     id=new_id(), n=body.name, bt=body.business_type, c=body.currency, t=body.tax_rate, a=body.address or "")
        # Seed main outlet if none
        cnt = await q_one("SELECT COUNT(*) AS c FROM outlets")
        if cnt["c"] == 0:
            await q_exec("""INSERT INTO outlets (id, name, address, phone, is_main, created_at)
                            VALUES (:id, 'Outlet Utama', :a, '', TRUE, NOW())""",
                         id=new_id(), a=body.address or "")
    return clean(await q_one("SELECT * FROM business LIMIT 1"))

# ============ USERS (owner + manager can add/edit; only owner can delete) ============
@api.get("/users")
async def list_users(user=Depends(require_role("admin", "manager"))):
    rows = await q_all("""SELECT id, email, name, role, is_active, phone, address, job_title, photo,
                                  ktp_number, created_at, updated_at FROM users ORDER BY created_at DESC""")
    return clean_list(rows)

@api.get("/users/{user_id}")
async def get_user(user_id: str, user=Depends(require_role("admin", "manager"))):
    row = await q_one("""SELECT id, email, name, role, is_active, phone, address, job_title, photo,
                                 ktp_image, ktp_number, created_at, updated_at FROM users WHERE id=:id""", id=user_id)
    if not row: raise HTTPException(404, "User not found")
    return clean(row)

@api.post("/users")
async def create_user(body: UserCreateIn, user=Depends(require_role("admin", "manager"))):
    email = body.email.lower()
    if body.role == "admin" and user["role"] != "admin":
        raise HTTPException(403, "Hanya owner yang bisa membuat akun admin")
    exists = await q_one("SELECT id FROM users WHERE email = :e", e=email)
    if exists: raise HTTPException(400, "Email sudah terdaftar")
    uid = new_id()
    await q_exec("""INSERT INTO users (id, email, name, role, password_hash, is_active, phone, address,
                    job_title, photo, ktp_image, ktp_number, created_at)
                    VALUES (:id, :e, :n, :r, :h, TRUE, :ph, :ad, :jt, :pt, :ki, :kn, NOW())""",
                 id=uid, e=email, n=body.name, r=body.role, h=hash_password(body.password),
                 ph=body.phone or "", ad=body.address or "", jt=body.job_title or "",
                 pt=body.photo or "", ki=body.ktp_image or "", kn=body.ktp_number or "")
    return clean(await q_one("""SELECT id, email, name, role, is_active, phone, address, job_title, photo,
                                  ktp_number, created_at FROM users WHERE id=:id""", id=uid))

@api.put("/users/{user_id}")
async def update_user(user_id: str, body: UserUpdateIn, user=Depends(require_role("admin", "manager"))):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates: raise HTTPException(400, "No updates")
    if updates.get("role") == "admin" and user["role"] != "admin":
        raise HTTPException(403, "Hanya owner yang bisa mengubah peran ke admin")
    sets = ", ".join(f"{k}=:{k}" for k in updates.keys())
    updates["id"] = user_id
    r = await q_exec(f"UPDATE users SET {sets}, updated_at=NOW() WHERE id=:id", **updates)
    if r.rowcount == 0: raise HTTPException(404, "User not found")
    return clean(await q_one("SELECT id, email, name, role, is_active FROM users WHERE id=:id", id=user_id))

@api.post("/users/{user_id}/reset-password")
async def reset_pw(user_id: str, body: PasswordResetIn, user=Depends(require_role("admin", "manager"))):
    if len(body.new_password) < 6: raise HTTPException(400, "Password minimal 6 karakter")
    r = await q_exec("UPDATE users SET password_hash=:h, updated_at=NOW() WHERE id=:id",
                     h=hash_password(body.new_password), id=user_id)
    if r.rowcount == 0: raise HTTPException(404, "User not found")
    return {"ok": True}

@api.delete("/users/{user_id}")
async def delete_user(user_id: str, user=Depends(require_role("admin"))):
    if str(user_id) == str(user["id"]): raise HTTPException(400, "Tidak bisa menghapus akun sendiri")
    r = await q_exec("DELETE FROM users WHERE id=:id", id=user_id)
    if r.rowcount == 0: raise HTTPException(404, "User not found")
    return {"ok": True}

# ============ CRUD FACTORY ============
def make_crud(path, table, model_cls, cols, role_write=("admin", "manager")):
    @api.get(f"/{path}")
    async def _list(user=Depends(get_current_user)):
        rows = await q_all(f"SELECT * FROM {table} ORDER BY created_at DESC NULLS LAST")
        return clean_list(rows)
    @api.post(f"/{path}")
    async def _create(body: model_cls, user=Depends(require_role(*role_write))):
        d = body.model_dump()
        d["id"] = new_id()
        col_list = ", ".join(["id"] + cols + ["created_at"])
        val_list = ", ".join([":id"] + [f":{c}" for c in cols] + ["NOW()"])
        await q_exec(f"INSERT INTO {table} ({col_list}) VALUES ({val_list})", **{"id": d["id"], **{c: d.get(c) for c in cols}})
        return clean(await q_one(f"SELECT * FROM {table} WHERE id=:id", id=d["id"]))
    @api.put(f"/{path}/{{item_id}}")
    async def _update(item_id: str, body: model_cls, user=Depends(require_role(*role_write))):
        d = body.model_dump()
        sets = ", ".join([f"{c}=:{c}" for c in cols])
        r = await q_exec(f"UPDATE {table} SET {sets}, updated_at=NOW() WHERE id=:id", id=item_id, **{c: d.get(c) for c in cols})
        if r.rowcount == 0: raise HTTPException(404, "Not found")
        return clean(await q_one(f"SELECT * FROM {table} WHERE id=:id", id=item_id))
    @api.delete(f"/{path}/{{item_id}}")
    async def _delete(item_id: str, user=Depends(require_role(*role_write))):
        r = await q_exec(f"DELETE FROM {table} WHERE id=:id", id=item_id)
        if r.rowcount == 0: raise HTTPException(404, "Not found")
        return {"ok": True}

make_crud("outlets", "outlets", OutletIn, ["name", "address", "phone", "is_main"])
make_crud("categories", "categories", CategoryIn, ["name", "color"])
make_crud("customers", "customers", CustomerIn, ["name", "phone", "email", "address"], role_write=("admin","manager","kasir"))
make_crud("suppliers", "suppliers", SupplierIn, ["name", "contact_person", "phone", "email", "address"])

# ============ PRODUCTS ============
@api.get("/products")
async def list_products(user=Depends(get_current_user)):
    rows = await q_all("SELECT * FROM products ORDER BY created_at DESC")
    return clean_list(rows)

@api.get("/products/by-barcode/{code}")
async def product_by_barcode(code: str, user=Depends(get_current_user)):
    p = await q_one("SELECT * FROM products WHERE barcode=:c OR sku=:c LIMIT 1", c=code)
    if not p: raise HTTPException(404, "Product not found")
    return clean(p)

@api.post("/products")
async def create_product(body: ProductIn, user=Depends(require_role("admin","manager"))):
    exists = await q_one("SELECT id FROM products WHERE sku=:s", s=body.sku)
    if exists: raise HTTPException(400, "SKU already exists")
    pid = new_id()
    variants_json = json.dumps([v.model_dump() for v in (body.variants or [])])
    await q_exec("""INSERT INTO products (id, name, sku, barcode, category_id, price, cost, stock, low_stock_threshold,
                                           unit, image_url, description, is_active, variants, created_at)
                    VALUES (:id, :n, :s, :b, :ci, :p, :c, :st, :lt, :u, :img, :d, :a, CAST(:v AS jsonb), NOW())""",
                 id=pid, n=body.name, s=body.sku, b=body.barcode or "", ci=_u(body.category_id),
                 p=body.price, c=body.cost, st=body.stock, lt=body.low_stock_threshold,
                 u=body.unit, img=body.image_url or "", d=body.description or "",
                 a=body.is_active, v=variants_json)
    if body.stock > 0:
        await q_exec("""INSERT INTO stock_movements (id, product_id, product_name, delta, reason, note, user_id, created_at)
                        VALUES (:id, :pid, :pn, :d, 'initial', 'Initial stock', :u, NOW())""",
                     id=new_id(), pid=pid, pn=body.name, d=body.stock, u=user["id"])
    return clean(await q_one("SELECT * FROM products WHERE id=:id", id=pid))

@api.put("/products/{product_id}")
async def update_product(product_id: str, body: ProductIn, user=Depends(require_role("admin","manager"))):
    variants_json = json.dumps([v.model_dump() for v in (body.variants or [])])
    r = await q_exec("""UPDATE products SET name=:n, sku=:s, barcode=:b, category_id=:ci, price=:p, cost=:c,
                        stock=:st, low_stock_threshold=:lt, unit=:u, image_url=:img, description=:d, is_active=:a,
                        variants=CAST(:v AS jsonb), updated_at=NOW() WHERE id=:id""",
                     id=product_id, n=body.name, s=body.sku, b=body.barcode or "", ci=_u(body.category_id),
                     p=body.price, c=body.cost, st=body.stock, lt=body.low_stock_threshold, u=body.unit,
                     img=body.image_url or "", d=body.description or "", a=body.is_active, v=variants_json)
    if r.rowcount == 0: raise HTTPException(404, "Product not found")
    return clean(await q_one("SELECT * FROM products WHERE id=:id", id=product_id))

@api.delete("/products/{product_id}")
async def delete_product(product_id: str, user=Depends(require_role("admin","manager"))):
    r = await q_exec("DELETE FROM products WHERE id=:id", id=product_id)
    if r.rowcount == 0: raise HTTPException(404, "Not found")
    return {"ok": True}

# ============ INVENTORY ============
async def _get_main_outlet_id():
    r = await q_one("SELECT id FROM outlets WHERE is_main=TRUE LIMIT 1")
    if not r:
        r = await q_one("SELECT id FROM outlets LIMIT 1")
    return str(r["id"]) if r else None

async def _adjust_outlet_stock(product_id: str, outlet_id: str, delta: int):
    if not outlet_id: return
    existing = await q_one("SELECT id, quantity FROM outlet_stocks WHERE product_id=:p AND outlet_id=:o",
                           p=product_id, o=outlet_id)
    main = await _get_main_outlet_id()
    if not existing:
        # Seed: main outlet gets product.stock, others get 0
        product = await q_one("SELECT stock FROM products WHERE id=:id", id=product_id)
        base = product["stock"] if (product and str(outlet_id) == main) else 0
        await q_exec("""INSERT INTO outlet_stocks (product_id, outlet_id, quantity, updated_at)
                        VALUES (:p, :o, :q, NOW())""", p=product_id, o=outlet_id, q=base + delta)
    else:
        await q_exec("UPDATE outlet_stocks SET quantity=quantity+:d, updated_at=NOW() WHERE id=:id",
                     d=delta, id=existing["id"])

@api.post("/inventory/adjust")
async def adjust_stock(body: StockAdjustIn, user=Depends(require_role("admin","manager"))):
    p = await q_one("SELECT * FROM products WHERE id=:id", id=body.product_id)
    if not p: raise HTTPException(404, "Product not found")
    new_stock = max(0, p["stock"] + body.delta)
    await q_exec("UPDATE products SET stock=:s, updated_at=NOW() WHERE id=:id", s=new_stock, id=body.product_id)
    await q_exec("""INSERT INTO stock_movements (id, product_id, product_name, delta, reason, note, user_id, created_at)
                    VALUES (:id, :pid, :pn, :d, :r, :note, :u, NOW())""",
                 id=new_id(), pid=body.product_id, pn=p["name"], d=body.delta, r=body.reason, note=body.note or "", u=user["id"])
    return {"product_id": body.product_id, "new_stock": new_stock}

@api.get("/inventory/movements")
async def list_movements(user=Depends(get_current_user), limit: int = 200):
    rows = await q_all("SELECT * FROM stock_movements ORDER BY created_at DESC LIMIT :l", l=limit)
    return clean_list(rows)

# ============ SALES ============
@api.post("/sales")
async def create_sale(body: SaleIn, user=Depends(get_current_user)):
    if not body.items: raise HTTPException(400, "Cart is empty")
    subtotal = 0.0
    for it in body.items:
        p = await q_one("SELECT id, name, stock FROM products WHERE id=:id", id=it.product_id)
        if not p: raise HTTPException(400, f"Product {it.name} not found")
        if p["stock"] < it.quantity: raise HTTPException(400, f"Insufficient stock for {p['name']}")
        subtotal += it.price * it.quantity
    total = subtotal - body.discount + body.tax
    if body.payment_method == "cash" and body.amount_paid < total:
        raise HTTPException(400, "Insufficient payment amount")
    change = max(0, body.amount_paid - total)
    sale_id = new_id()
    invoice_no = f"INV-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{sale_id[:6].upper()}"
    active_shift = await q_one("SELECT id FROM shifts WHERE cashier_id=:c AND status='open' LIMIT 1", c=user["id"])
    shift_id = str(active_shift["id"]) if active_shift else None
    outlet_id = _u(body.outlet_id) or await _get_main_outlet_id()
    items_json = json.dumps([i.model_dump() for i in body.items])
    await q_exec("""INSERT INTO sales (id, invoice_no, shift_id, outlet_id, customer_id, cashier_id, cashier_name,
                                        items, subtotal, discount, tax, total, payment_method, amount_paid,
                                        change_amount, source, note, created_at)
                    VALUES (:id, :inv, :sid, :oid, :cid, :ci, :cn, CAST(:it AS jsonb), :sub, :disc, :tax, :tot,
                            :pm, :paid, :chg, 'pos', :note, NOW())""",
                 id=sale_id, inv=invoice_no, sid=_u(shift_id), oid=_u(outlet_id), cid=_u(body.customer_id),
                 ci=user["id"], cn=user.get("name",""), it=items_json, sub=subtotal, disc=body.discount,
                 tax=body.tax, tot=total, pm=body.payment_method, paid=body.amount_paid, chg=change, note=body.note or "")
    for it in body.items:
        await q_exec("UPDATE products SET stock=stock-:q WHERE id=:id", q=it.quantity, id=it.product_id)
        if outlet_id:
            await _adjust_outlet_stock(it.product_id, outlet_id, -it.quantity)
        await q_exec("""INSERT INTO stock_movements (id, product_id, product_name, delta, reason, note, outlet_id, user_id, created_at)
                        VALUES (:id, :pid, :pn, :d, 'sale', :note, :oid, :u, NOW())""",
                     id=new_id(), pid=it.product_id, pn=it.name, d=-it.quantity, note=f"Sale {invoice_no}",
                     oid=_u(outlet_id), u=user["id"])
    if body.customer_id:
        pts = int(total // 10000)
        await q_exec("""UPDATE customers SET loyalty_points=loyalty_points+:p, total_spent=total_spent+:t,
                        visit_count=visit_count+1 WHERE id=:id""",
                     p=pts, t=total, id=body.customer_id)
    row = await q_one("SELECT *, change_amount AS change FROM sales WHERE id=:id", id=sale_id)
    return clean(row)

@api.get("/sales")
async def list_sales(user=Depends(get_current_user), limit: int = 200):
    rows = await q_all("SELECT *, change_amount AS change FROM sales ORDER BY created_at DESC LIMIT :l", l=limit)
    return clean_list(rows)

@api.get("/sales/{sale_id}")
async def get_sale(sale_id: str, user=Depends(get_current_user)):
    r = await q_one("SELECT *, change_amount AS change FROM sales WHERE id=:id", id=sale_id)
    if not r: raise HTTPException(404, "Not found")
    return clean(r)

# ============ REPORTS ============
@api.get("/reports/dashboard")
async def report_dashboard(user=Depends(get_current_user)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    stats = await q_one("""
        SELECT
          COALESCE(SUM(CASE WHEN DATE(created_at AT TIME ZONE 'UTC') = CAST(:t AS DATE) THEN total ELSE 0 END), 0) AS rev_today,
          COALESCE(SUM(total), 0) AS rev_total,
          COUNT(*) FILTER (WHERE DATE(created_at AT TIME ZONE 'UTC') = CAST(:t AS DATE)) AS tx_today,
          COUNT(*) AS tx_total
        FROM sales""", t=today)
    items_today = await q_one("""
        SELECT COALESCE(SUM((elem->>'quantity')::int), 0) AS c
        FROM sales, jsonb_array_elements(items) elem
        WHERE DATE(created_at AT TIME ZONE 'UTC') = CAST(:t AS DATE)""", t=today)
    products_count = await q_one("SELECT COUNT(*) AS c FROM products")
    customers_count = await q_one("SELECT COUNT(*) AS c FROM customers")
    low_stock = await q_all("""SELECT * FROM products WHERE stock <= low_stock_threshold LIMIT 10""")
    daily = await q_all("""
        SELECT DATE(created_at AT TIME ZONE 'UTC') AS date, SUM(total) AS revenue
        FROM sales GROUP BY DATE(created_at AT TIME ZONE 'UTC')
        ORDER BY date DESC LIMIT 7""")
    top = await q_all("""
        SELECT elem->>'product_id' AS product_id, elem->>'name' AS name,
               SUM((elem->>'quantity')::int) AS quantity,
               SUM((elem->>'price')::numeric * (elem->>'quantity')::int) AS revenue
        FROM sales, jsonb_array_elements(items) elem
        GROUP BY elem->>'product_id', elem->>'name'
        ORDER BY revenue DESC LIMIT 5""")
    return {
        "revenue_today": float(stats["rev_today"]),
        "revenue_total": float(stats["rev_total"]),
        "transactions_today": stats["tx_today"],
        "transactions_total": stats["tx_total"],
        "items_sold_today": items_today["c"],
        "products_count": products_count["c"],
        "customers_count": customers_count["c"],
        "low_stock_count": len(low_stock),
        "low_stock_items": clean_list(low_stock),
        "daily_revenue": [{"date": str(d["date"]), "revenue": float(d["revenue"])} for d in sorted(daily, key=lambda x: str(x["date"]))],
        "top_products": [{"name": t["name"], "quantity": t["quantity"], "revenue": float(t["revenue"])} for t in top],
    }

# ============ PURCHASE ORDERS ============
@api.get("/purchase-orders")
async def list_pos(user=Depends(get_current_user)):
    rows = await q_all("SELECT * FROM purchase_orders ORDER BY created_at DESC LIMIT 500")
    return clean_list(rows)

@api.post("/purchase-orders")
async def create_po(body: POIn, user=Depends(require_role("admin","manager"))):
    total = sum(i.quantity * i.cost for i in body.items)
    po_no = f"PO-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    pid = new_id()
    items_json = json.dumps([i.model_dump() for i in body.items])
    await q_exec("""INSERT INTO purchase_orders (id, po_no, supplier_id, supplier_name, items, total, status, note, created_by, created_at)
                    VALUES (:id, :po, :sid, :sn, CAST(:it AS jsonb), :t, 'draft', :note, :u, NOW())""",
                 id=pid, po=po_no, sid=_u(body.supplier_id), sn=body.supplier_name,
                 it=items_json, t=total, note=body.note or "", u=user["id"])
    return clean(await q_one("SELECT * FROM purchase_orders WHERE id=:id", id=pid))

@api.post("/purchase-orders/{po_id}/receive")
async def receive_po(po_id: str, user=Depends(require_role("admin","manager"))):
    po = await q_one("SELECT * FROM purchase_orders WHERE id=:id", id=po_id)
    if not po: raise HTTPException(404, "PO not found")
    if po["status"] != "draft": raise HTTPException(400, f"PO status is {po['status']}")
    main = await _get_main_outlet_id()
    items = po["items"] if isinstance(po["items"], list) else json.loads(po["items"])
    for it in items:
        await q_exec("UPDATE products SET stock=stock+:q, updated_at=NOW() WHERE id=:id", q=it["quantity"], id=it["product_id"])
        if main:
            await _adjust_outlet_stock(it["product_id"], main, it["quantity"])
        await q_exec("""INSERT INTO stock_movements (id, product_id, product_name, delta, reason, note, outlet_id, user_id, created_at)
                        VALUES (:id, :pid, :pn, :d, 'purchase', :note, :oid, :u, NOW())""",
                     id=new_id(), pid=it["product_id"], pn=it["name"], d=it["quantity"],
                     note=f"PO {po['po_no']}", oid=_u(main), u=user["id"])
    await q_exec("UPDATE purchase_orders SET status='received', received_at=NOW() WHERE id=:id", id=po_id)
    return {"ok": True, "po_id": po_id}

@api.delete("/purchase-orders/{po_id}")
async def delete_po(po_id: str, user=Depends(require_role("admin","manager"))):
    r = await q_exec("DELETE FROM purchase_orders WHERE id=:id AND status='draft'", id=po_id)
    if r.rowcount == 0: raise HTTPException(400, "Cannot delete: not draft or not found")
    return {"ok": True}

# ============ SHIFTS ============
@api.get("/shifts/active")
async def active_shift(user=Depends(get_current_user)):
    return clean(await q_one("SELECT * FROM shifts WHERE cashier_id=:c AND status='open' LIMIT 1", c=user["id"]))

@api.get("/shifts")
async def list_shifts(user=Depends(get_current_user), limit: int = 100):
    rows = await q_all("SELECT * FROM shifts ORDER BY opened_at DESC LIMIT :l", l=limit)
    return clean_list(rows)

@api.post("/shifts/open")
async def open_shift(body: ShiftOpenIn, user=Depends(get_current_user)):
    existing = await q_one("SELECT id FROM shifts WHERE cashier_id=:c AND status='open'", c=user["id"])
    if existing: raise HTTPException(400, "Shift already open")
    sid = new_id()
    await q_exec("""INSERT INTO shifts (id, cashier_id, cashier_name, outlet_id, opening_cash, status, opened_at, note)
                    VALUES (:id, :ci, :cn, :oid, :cash, 'open', NOW(), :note)""",
                 id=sid, ci=user["id"], cn=user.get("name",""), oid=_u(body.outlet_id),
                 cash=body.opening_cash, note=body.note or "")
    return clean(await q_one("SELECT * FROM shifts WHERE id=:id", id=sid))

@api.post("/shifts/close")
async def close_shift(body: ShiftCloseIn, user=Depends(get_current_user)):
    shift = await q_one("SELECT * FROM shifts WHERE cashier_id=:c AND status='open' LIMIT 1", c=user["id"])
    if not shift: raise HTTPException(400, "No open shift")
    agg = await q_one("""SELECT
        COALESCE(SUM(CASE WHEN payment_method='cash' THEN total ELSE 0 END), 0) AS cash_sales,
        COALESCE(SUM(CASE WHEN payment_method<>'cash' THEN total ELSE 0 END), 0) AS non_cash_sales,
        COUNT(*) AS cnt FROM sales WHERE shift_id=:sid""", sid=shift["id"])
    expected = float(shift["opening_cash"]) + float(agg["cash_sales"])
    diff = body.actual_cash - expected
    await q_exec("""UPDATE shifts SET status='closed', closed_at=NOW(), actual_cash=:ac, expected_cash=:ec,
                    difference=:d, cash_sales=:cs, non_cash_sales=:ncs, transaction_count=:tc, close_note=:cn
                    WHERE id=:id""",
                 id=shift["id"], ac=body.actual_cash, ec=expected, d=diff,
                 cs=float(agg["cash_sales"]), ncs=float(agg["non_cash_sales"]),
                 tc=agg["cnt"], cn=body.note or "")
    return clean(await q_one("SELECT * FROM shifts WHERE id=:id", id=shift["id"]))

# ============ TRANSFERS ============
@api.get("/stock-transfers")
async def list_transfers(user=Depends(get_current_user), limit: int = 200):
    rows = await q_all("SELECT * FROM stock_transfers ORDER BY created_at DESC LIMIT :l", l=limit)
    return clean_list(rows)

@api.post("/stock-transfers")
async def create_transfer(body: TransferIn, user=Depends(require_role("admin","manager"))):
    if body.from_outlet_id == body.to_outlet_id: raise HTTPException(400, "Outlet sumber dan tujuan tidak boleh sama")
    if not body.items: raise HTTPException(400, "Item tidak boleh kosong")
    for it in body.items:
        p = await q_one("SELECT * FROM products WHERE id=:id", id=it.product_id)
        if not p: raise HTTPException(400, f"Produk {it.name} tidak ditemukan")
        if p["stock"] < it.quantity: raise HTTPException(400, f"Stok {p['name']} tidak cukup")
    tno = f"TRF-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    tid = new_id()
    total_qty = sum(i.quantity for i in body.items)
    items_json = json.dumps([i.model_dump() for i in body.items])
    await q_exec("""INSERT INTO stock_transfers (id, transfer_no, from_outlet_id, to_outlet_id, from_outlet_name,
                    to_outlet_name, items, total_quantity, note, status, created_by, created_by_name, created_at)
                    VALUES (:id, :tno, :fo, :to, :fn, :tn, CAST(:it AS jsonb), :tq, :note, 'completed', :cb, :cbn, NOW())""",
                 id=tid, tno=tno, fo=_u(body.from_outlet_id), to=_u(body.to_outlet_id),
                 fn=body.from_outlet_name, tn=body.to_outlet_name, it=items_json,
                 tq=total_qty, note=body.note or "", cb=user["id"], cbn=user.get("name",""))
    for it in body.items:
        for delta, reason, oid, other in [(-it.quantity, "transfer_out", body.from_outlet_id, body.to_outlet_name),
                                            (it.quantity, "transfer_in", body.to_outlet_id, body.from_outlet_name)]:
            await q_exec("""INSERT INTO stock_movements (id, product_id, product_name, delta, reason, note, outlet_id, user_id, created_at)
                            VALUES (:id, :pid, :pn, :d, :r, :note, :oid, :u, NOW())""",
                         id=new_id(), pid=it.product_id, pn=it.name, d=delta, r=reason,
                         note=f"{tno} {'→' if delta<0 else '←'} {other}", oid=_u(oid), u=user["id"])
        await _adjust_outlet_stock(it.product_id, body.from_outlet_id, -it.quantity)
        await _adjust_outlet_stock(it.product_id, body.to_outlet_id, it.quantity)
    return clean(await q_one("SELECT * FROM stock_transfers WHERE id=:id", id=tid))

# ============ TABLES ============
@api.get("/tables")
async def list_tables(user=Depends(get_current_user)):
    rows = await q_all("""SELECT t.*,
        (SELECT id FROM orders WHERE table_id=t.id AND status='open' LIMIT 1) AS active_order_id,
        COALESCE((SELECT total FROM orders WHERE table_id=t.id AND status='open' LIMIT 1), 0) AS active_order_total
        FROM tables t ORDER BY name""")
    return clean_list(rows)

@api.post("/tables")
async def create_table(body: TableIn, user=Depends(require_role("admin","manager"))):
    tid = new_id()
    await q_exec("""INSERT INTO tables (id, name, capacity, outlet_id, zone, status, created_at)
                    VALUES (:id, :n, :c, :oid, :z, 'available', NOW())""",
                 id=tid, n=body.name, c=body.capacity, oid=_u(body.outlet_id), z=body.zone or "Utama")
    return clean(await q_one("SELECT * FROM tables WHERE id=:id", id=tid))

@api.put("/tables/{table_id}")
async def update_table(table_id: str, body: TableIn, user=Depends(require_role("admin","manager"))):
    r = await q_exec("""UPDATE tables SET name=:n, capacity=:c, outlet_id=:oid, zone=:z, updated_at=NOW()
                        WHERE id=:id""", id=table_id, n=body.name, c=body.capacity,
                     oid=_u(body.outlet_id), z=body.zone or "Utama")
    if r.rowcount == 0: raise HTTPException(404, "Not found")
    return clean(await q_one("SELECT * FROM tables WHERE id=:id", id=table_id))

@api.delete("/tables/{table_id}")
async def delete_table(table_id: str, user=Depends(require_role("admin","manager"))):
    active = await q_one("SELECT id FROM orders WHERE table_id=:t AND status='open'", t=table_id)
    if active: raise HTTPException(400, "Meja masih memiliki order terbuka")
    r = await q_exec("DELETE FROM tables WHERE id=:id", id=table_id)
    if r.rowcount == 0: raise HTTPException(404, "Not found")
    return {"ok": True}

# ============ ORDERS (Dine-in) ============
def _calc_total(items):
    return sum(float(i["price"]) * int(i["quantity"]) for i in items)

@api.get("/orders")
async def list_orders(status: Optional[str] = None, user=Depends(get_current_user)):
    if status:
        rows = await q_all("SELECT * FROM orders WHERE status=:s ORDER BY opened_at DESC LIMIT 500", s=status)
    else:
        rows = await q_all("SELECT * FROM orders ORDER BY opened_at DESC LIMIT 500")
    return clean_list(rows)

@api.post("/orders")
async def open_order(body: OrderOpenIn, user=Depends(get_current_user)):
    table = await q_one("SELECT * FROM tables WHERE id=:id", id=body.table_id)
    if not table: raise HTTPException(404, "Meja tidak ditemukan")
    existing = await q_one("SELECT id FROM orders WHERE table_id=:t AND status='open'", t=body.table_id)
    if existing: raise HTTPException(400, "Meja sudah memiliki order terbuka")
    items = [i.model_dump() for i in (body.items or [])]
    oid = new_id()
    await q_exec("""INSERT INTO orders (id, order_no, table_id, table_name, outlet_id, guest_count, items, total,
                                          status, cashier_id, cashier_name, opened_at)
                    VALUES (:id, :ono, :tid, :tn, :oid, :g, CAST(:it AS jsonb), :tot, 'open', :ci, :cn, NOW())""",
                 id=oid, ono=f"ORD-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
                 tid=body.table_id, tn=table["name"], oid=_u(body.outlet_id or table.get("outlet_id")),
                 g=body.guest_count, it=json.dumps(items), tot=_calc_total(items),
                 ci=user["id"], cn=user.get("name",""))
    await q_exec("UPDATE tables SET status='occupied' WHERE id=:id", id=body.table_id)
    return clean(await q_one("SELECT * FROM orders WHERE id=:id", id=oid))

@api.put("/orders/{order_id}/items")
async def update_order_items(order_id: str, body: OrderUpdateItemsIn, user=Depends(get_current_user)):
    order = await q_one("SELECT status FROM orders WHERE id=:id", id=order_id)
    if not order or order["status"] != "open": raise HTTPException(400, "Order tidak aktif")
    items = [i.model_dump() for i in body.items]
    await q_exec("UPDATE orders SET items=CAST(:it AS jsonb), total=:t, updated_at=NOW() WHERE id=:id",
                 it=json.dumps(items), t=_calc_total(items), id=order_id)
    return clean(await q_one("SELECT * FROM orders WHERE id=:id", id=order_id))

@api.post("/orders/{order_id}/checkout")
async def checkout_order(order_id: str, body: OrderCheckoutIn, user=Depends(get_current_user)):
    order = await q_one("SELECT * FROM orders WHERE id=:id", id=order_id)
    if not order or order["status"] != "open": raise HTTPException(400, "Order tidak aktif")
    items = order["items"] if isinstance(order["items"], list) else json.loads(order["items"])
    if not items: raise HTTPException(400, "Order kosong")
    subtotal = _calc_total(items)
    total = subtotal - body.discount + body.tax
    if body.payment_method == "cash" and body.amount_paid < total: raise HTTPException(400, "Uang bayar kurang")
    for it in items:
        p = await q_one("SELECT stock, name FROM products WHERE id=:id", id=it["product_id"])
        if not p or p["stock"] < it["quantity"]: raise HTTPException(400, f"Stok kurang untuk {it['name']}")
    change = max(0, body.amount_paid - total)
    sale_id = new_id()
    invoice_no = f"INV-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{sale_id[:6].upper()}"
    active_shift = await q_one("SELECT id FROM shifts WHERE cashier_id=:c AND status='open' LIMIT 1", c=user["id"])
    shift_id = str(active_shift["id"]) if active_shift else None
    outlet_id = str(order["outlet_id"]) if order.get("outlet_id") else await _get_main_outlet_id()
    await q_exec("""INSERT INTO sales (id, invoice_no, shift_id, outlet_id, customer_id, cashier_id, cashier_name,
                    items, subtotal, discount, tax, total, payment_method, amount_paid, change_amount,
                    source, table_id, table_name, created_at)
                    VALUES (:id, :inv, :sid, :oid, :cid, :ci, :cn, CAST(:it AS jsonb), :sub, :disc, :tax, :tot,
                            :pm, :paid, :chg, 'dine-in', :tid, :tn, NOW())""",
                 id=sale_id, inv=invoice_no, sid=_u(shift_id), oid=_u(outlet_id), cid=_u(body.customer_id),
                 ci=user["id"], cn=user.get("name",""), it=json.dumps(items),
                 sub=subtotal, disc=body.discount, tax=body.tax, tot=total, pm=body.payment_method,
                 paid=body.amount_paid, chg=change, tid=_u(str(order["table_id"])), tn=order["table_name"])
    for it in items:
        await q_exec("UPDATE products SET stock=stock-:q WHERE id=:id", q=it["quantity"], id=it["product_id"])
        if outlet_id:
            await _adjust_outlet_stock(it["product_id"], outlet_id, -it["quantity"])
        await q_exec("""INSERT INTO stock_movements (id, product_id, product_name, delta, reason, note, outlet_id, user_id, created_at)
                        VALUES (:id, :pid, :pn, :d, 'sale', :note, :oid, :u, NOW())""",
                     id=new_id(), pid=it["product_id"], pn=it["name"], d=-it["quantity"],
                     note=f"Sale {invoice_no}", oid=_u(outlet_id), u=user["id"])
    await q_exec("UPDATE orders SET status='closed', closed_at=NOW(), sale_id=:sid WHERE id=:id", sid=sale_id, id=order_id)
    await q_exec("UPDATE tables SET status='available' WHERE id=:id", id=order["table_id"])
    row = await q_one("SELECT *, change_amount AS change FROM sales WHERE id=:id", id=sale_id)
    return clean(row)

@api.delete("/orders/{order_id}")
async def cancel_order(order_id: str, user=Depends(get_current_user)):
    order = await q_one("SELECT table_id, status FROM orders WHERE id=:id", id=order_id)
    if not order: raise HTTPException(404, "Not found")
    if order["status"] != "open": raise HTTPException(400, "Order sudah selesai")
    await q_exec("UPDATE orders SET status='cancelled', closed_at=NOW() WHERE id=:id", id=order_id)
    await q_exec("UPDATE tables SET status='available' WHERE id=:id", id=order["table_id"])
    return {"ok": True}

# ============ PER-OUTLET STOCK ============
@api.get("/outlet-stocks/{outlet_id}")
async def get_outlet_stocks(outlet_id: str, user=Depends(get_current_user)):
    rows = await q_all("SELECT product_id, outlet_id, quantity FROM outlet_stocks WHERE outlet_id=:o", o=outlet_id)
    return clean_list(rows)

# ============ MIDTRANS QRIS ============
try:
    import httpx as _httpx
    import qrcode as _qrcode
    _mid_ok = True
except Exception:
    _mid_ok = False

def _midtrans_auth():
    key = os.environ.get("MIDTRANS_SERVER_KEY", "")
    if not key: raise HTTPException(503, "Midtrans belum dikonfigurasi. Tambahkan MIDTRANS_SERVER_KEY di .env")
    return {"Authorization": f"Basic {base64.b64encode(f'{key}:'.encode()).decode()}", "Accept": "application/json"}

def _qr_data_uri(s: str):
    img = _qrcode.make(s); buf = io.BytesIO(); img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

@api.post("/payments/qris")
async def create_qris(body: QRISCreateIn, user=Depends(get_current_user)):
    if not _mid_ok: raise HTTPException(503, "Midtrans libs missing")
    headers = _midtrans_auth()
    base = os.environ.get("MIDTRANS_BASE_URL", "https://api.sandbox.midtrans.com").rstrip("/")
    order_id = f"POS-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{new_id()[:8]}"
    payload = {"payment_type": "qris", "transaction_details": {"order_id": order_id, "gross_amount": body.amount},
               "qris": {"acquirer": "gopay"}, "custom_expiry": {"expiry_duration": 15, "unit": "minute"}}
    async with _httpx.AsyncClient(timeout=15) as http:
        r = await http.post(f"{base}/v2/charge", json=payload, headers={**headers, "Content-Type": "application/json"})
    if r.status_code not in (200, 201): raise HTTPException(r.status_code, r.text)
    result = r.json()
    qs = result.get("qr_string")
    if not qs: raise HTTPException(502, "Midtrans tidak mengembalikan qr_string")
    await q_exec("""INSERT INTO qris_orders (order_id, amount, description, transaction_id, status, fraud_status, qr_string, created_at)
                    VALUES (:oid, :a, :d, :tid, :s, :f, :qs, NOW())""",
                 oid=order_id, a=body.amount, d=body.description, tid=result.get("transaction_id"),
                 s=result.get("transaction_status", "pending"), f=result.get("fraud_status"), qs=qs)
    return {"order_id": order_id, "amount": body.amount, "status": result.get("transaction_status", "pending"),
            "qr_image": _qr_data_uri(qs)}

@api.get("/payments/{order_id}")
async def payment_status(order_id: str, user=Depends(get_current_user)):
    local = await q_one("SELECT * FROM qris_orders WHERE order_id=:o", o=order_id)
    if not local: raise HTTPException(404, "Not found")
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
                local["status"] = new_status; local["fraud_status"] = fraud
    except Exception:
        pass
    paid = local["status"] in ("settlement", "capture") and ((local.get("fraud_status") or "").lower() in ("", "accept"))
    return {"order_id": order_id, "status": local["status"], "paid": paid}

@api.post("/midtrans/webhook")
async def midtrans_webhook(request: Request):
    data = await request.json()
    order_id = str(data.get("order_id", ""))
    key = os.environ.get("MIDTRANS_SERVER_KEY", "")
    if not key: raise HTTPException(503, "Midtrans not configured")
    expected = hashlib.sha512(f"{order_id}{data.get('status_code','')}{data.get('gross_amount','')}{key}".encode()).hexdigest()
    if not hmac.compare_digest(expected, str(data.get("signature_key", ""))):
        raise HTTPException(403, "Invalid signature")
    local = await q_one("SELECT status FROM qris_orders WHERE order_id=:o", o=order_id)
    if not local: raise HTTPException(404, "Unknown order")
    if local["status"] not in ("settlement", "capture"):
        await q_exec("UPDATE qris_orders SET status=:s, fraud_status=:f, updated_at=NOW() WHERE order_id=:o",
                     s=str(data.get("transaction_status", "")), f=data.get("fraud_status"), o=order_id)
    return {"ok": True}

# ============ STARTUP ============
@app.on_event("startup")
async def startup():
    # Seed admin
    existing = await q_one("SELECT id, password_hash FROM users WHERE email=:e", e=ADMIN_EMAIL.lower())
    if not existing:
        await q_exec("""INSERT INTO users (id, email, name, role, password_hash, is_active, created_at)
                        VALUES (:id, :e, :n, 'admin', :h, TRUE, NOW())""",
                     id=new_id(), e=ADMIN_EMAIL.lower(), n="Owner Sutan Khulifah", h=hash_password(ADMIN_PASSWORD))
        logger.info(f"Seeded admin: {ADMIN_EMAIL}")
    elif not verify_password(ADMIN_PASSWORD, existing["password_hash"]):
        await q_exec("UPDATE users SET password_hash=:h WHERE email=:e",
                     h=hash_password(ADMIN_PASSWORD), e=ADMIN_EMAIL.lower())
    # Seed sample kasir
    k = await q_one("SELECT id FROM users WHERE email=:e", e="kasir@sutankhulifah.com")
    if not k:
        await q_exec("""INSERT INTO users (id, email, name, role, password_hash, is_active, created_at)
                        VALUES (:id, :e, 'Kasir Demo', 'kasir', :h, TRUE, NOW())""",
                     id=new_id(), e="kasir@sutankhulifah.com", h=hash_password("Kasir@2026"))

@app.on_event("shutdown")
async def shutdown():
    await engine.dispose()

app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True,
                   allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
                   allow_methods=["*"], allow_headers=["*"])
