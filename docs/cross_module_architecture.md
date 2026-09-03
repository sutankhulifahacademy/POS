# CROSS-MODULE ARCHITECTURE — BUSINESS & TECHNICAL DOCUMENTATION

> Dokumentasi AS-IS tambahan berdasarkan audit source code.
> Source: `backend/server.py`, `backend/database.py`, `backend/utils.py`, `backend/routes/deps.py`, `frontend/src/App.js`, `frontend/src/lib/api.js`, `frontend/src/context/OutletContext.js`, `frontend/src/context/AuthContext.js`, `frontend/src/components/Layout.js`, `backend/sql/postgres_schema.sql`

---

## 1. Purpose

Dokumen ini menjelaskan arsitektur global sistem POS yang menghubungkan semua menu/module. Dokumen ini adalah **tambahan** dan tidak menggantikan dokumentasi per menu.

---

## 2. Architecture Overview

### Stack
- **Frontend**: React 19, Create React App, CRACO, Axios, Recharts.
- **Backend**: FastAPI, Uvicorn, Python 3.11, SQLAlchemy async, asyncpg.
- **Database**: PostgreSQL 15.
- **Auth**: JWT (PyJWT), HTTP-only cookie + Bearer fallback.
- **Reverse Proxy**: Nginx.
- **Deployment**: Docker Compose.
- **Monitoring**: Uptime Kuma.

### Container Layout
```
rdi-frontend (Nginx + React build)  :80
rdi-backend (FastAPI + Uvicorn)     :8001
rdi-postgres (PostgreSQL 15)        :5433→5432
rdi-uptime (Uptime Kuma)            :3001
```

### Request Flow
```
Browser → Nginx (:80) → /api/* → FastAPI (:8001) → PostgreSQL (:5432)
                       → /*    → React static files
```

---

## 3. Global Authentication

### Login Flow
```
USER INPUT (email, password)
 ↓
POST /api/auth/login
 ↓
BACKEND: verify password (bcrypt)
 ↓
GENERATE JWT (PyJWT)
 ↓
SET HTTP-ONLY COOKIE: access_token
 ↓
ALSO RETURN token in response body (for Bearer fallback)
 ↓
FRONTEND: store token in localStorage (sk_token)
 ↓
Axios: withCredentials=true + Authorization: Bearer {token}
 ↓
SUBSEQUENT REQUESTS: cookie OR Bearer header
```

### Auth Helper
- `get_current_user`: decode JWT, fetch user dari DB, return user dict.
- `require_permission(module, action)`: check `role_permissions` untuk non-owner.
- `require_role(*roles)`: check `users.role` against allowed roles.
- Owner bypasses all `require_permission` checks.

### Token
- JWT secret: env `JWT_SECRET` dengan hard-coded fallback `ganti-dengan-string-acak-64-karakter-untuk-produksi`.
- Token expiry: NOT CONFIRMED FROM SOURCE.

### Findings
- Hard-coded JWT secret fallback — SECURITY RISK.
- Dual auth (cookie + localStorage Bearer) — attack surface lebih luas.
- Duplicate JWT libraries di requirements.txt.

---

## 4. Global Authorization

### Dual-Layer Access Control

```
LAYER 1: role_menus (sidebar visibility)
 ├── Frontend: Layout.js fetch /api/menus/my-menus
 ├── Filter menu berdasarkan role_menus.is_visible
 └── POS (/pos) selalu accessible (di luar Layout)

LAYER 2: role_permissions (API authorization)
 ├── Backend: require_permission(module, action)
 ├── Check role_permissions WHERE role_id=user.role AND module=X AND action=Y
 └── Owner bypasses semua check
```

### Role Hierarchy
```
owner    — full access, bypass permission, all outlets
admin    — full CRUD (per module), assigned outlets
manager  — view + create + update (no delete), assigned outlets
supervisor — view only, assigned outlets
kasir    — POS + dinein + attendance + shifts, assigned outlets
```

### Custom Roles
- Owner dapat membuat custom role via Roles menu.
- Custom role menggunakan `role_permissions` dan `role_menus` yang sama.

---

## 5. Global Outlet Architecture

### Outlet Context
```
USER LOGIN
 ↓
GET /api/outlets/my
 ↓
BACKEND: query user_outlet_access
 ↓
RETURN { outlets, all_access }
 ├── Owner: all_access=true, outlets=all
 └── Non-owner: all_access=false, outlets=assigned
 ↓
FRONTEND: OutletContext.Provider
 ↓
outletIdForApi = selectedOutlet || outlets[0]?.id || null
 ↓
SEMUA API CALLS MENGGUNAKAN outlet_id
```

### Outlet Scope Enforcement
- Backend: `filter_outlets_for_user(user, outlet_id)` helper.
- Jika user non-owner dan `outlet_id` tidak di-assign → 403.
- Owner dengan `outlet_ids=[]` → semua outlet.

### Outlet-Scoped Tables
```
outlet_stocks, sales, shifts, attendance, tables, orders,
purchase_orders, stock_transfers, stock_requests, delivery_notes,
expenses, leave_requests, employee_schedules, payroll_periods,
payroll_items, payment_accounts, alerts, audit_logs,
customer_memberships, point_transactions, kitchen_orders,
coupons, online_orders, platform_fee_configs
```

### Global Tables (no outlet_id)
```
users, business, categories, products, customers, suppliers,
roles, menus, role_menus, role_permissions, user_outlet_access,
stock_movements (has outlet_id but global product)
```

---

## 6. Database Relationships

### Core Entity Relationship
```
business (1)
 └── outlets (many)
      ├── user_outlet_access (many) ─── users (many)
      ├── sales (many) ─── stock_movements (many)
      ├── outlet_stocks (many) ─── products (many)
      │                          └── categories (many)
      ├── shifts (many)
      ├── attendance (many)
      ├── tables (many) ─── orders (many) ─── sales (0..1)
      ├── purchase_orders (many)
      ├── stock_transfers (many) ─── transfer_items (many)
      │                          └── delivery_notes (0..1)
      ├── stock_requests (many) ─── stock_request_items (many)
      ├── expenses (many)
      ├── leave_requests (many)
      ├── employee_schedules (many)
      ├── payroll_periods (many) ─── payroll_items (many)
      ├── payment_accounts (many)
      ├── customer_memberships (many) ─── point_transactions (many)
      ├── kitchen_orders (many)
      ├── coupons (many)
      ├── alerts (many)
      └── audit_logs (many)

users (1)
 ├── role (1) ─── role_permissions (many)
 │            └── role_menus (many) ─── menus (many)
 ├── attendance (many)
 ├── shifts (many)
 ├── sales (many)
 ├── payroll_items (many)
 ├── employee_schedules (many)
 ├── leave_requests (many)
 └── audit_logs (many)

customers (1)
 ├── sales (many)
 └── customer_memberships (many) ─── point_transactions (many)

suppliers (1)
 └── purchase_orders (many)
```

### Key FK Constraints
- `products.category_id` → `categories(id)` ON DELETE SET NULL
- `outlet_stocks.product_id` → `products(id)` ON DELETE CASCADE
- `outlet_stocks.outlet_id` → `outlets(id)` ON DELETE CASCADE
- `payment_accounts.outlet_id` → `outlets(id)` ON DELETE SET NULL
- `expenses.outlet_id` → `outlets(id)` ON DELETE SET NULL
- `transfer_items.transfer_id` → `stock_transfers(id)` ON DELETE CASCADE
- `payroll_items.period_id` → `payroll_periods(id)` ON DELETE CASCADE
- `role_permissions.role_id` → `roles(id)` ON DELETE CASCADE
- `role_menus.role_id` → `roles(id)` ON DELETE CASCADE
- `role_menus.menu_id` → `menus(id)` ON DELETE CASCADE

### Missing FK Constraints (Findings)
- `sales.outlet_id` → no FK to `outlets(id)`.
- `sales.customer_id` → no FK to `customers(id)`.
- `sales.cashier_id` → no FK to `users(id)`.
- `sales.shift_id` → no FK to `shifts(id)`.
- `purchase_orders.supplier_id` → no FK to `suppliers(id)`.
- `purchase_orders.outlet_id` → no FK to `outlets(id)`.
- `stock_movements.product_id` → no FK to `products(id)`.
- `audit_logs.user_id` → no FK to `users(id)`.

---

## 7. Dependency Among Menus

### Dependency Graph
```
                    ┌─── Dashboard
                    │
                    ├─── Reports (Sales, P&L, Shifts, Stock, Payment, Transfers)
                    │
                    ├─── AI Assistant
                    │
Sales ──────────────┼─── Loyalty (point accumulation)
                    │
                    ├─── KDS (kitchen order)
                    │
                    └─── Audit Logs

Products ──── POS ──── Sales
         │           │
         │           ├─── Dine-In/Tables
         │           │
         │           └─── KDS
         │
         ├─── Inventory (stock)
         │
         ├─── Purchase Orders (stock in)
         │
         ├─── Transfers (stock move)
         │              │
         │              ├─── Stock Requests
         │              │
         │              └─── Delivery Notes (Surat Jalan)
         │
         └─── Online Orders

Users ──── Roles ──── Permissions
  │
  ├─── Outlets (user_outlet_access)
  │
  ├─── Attendance
  │
  ├─── Shifts
  │
  ├─── Schedules
  │
  ├─── Leave Requests
  │
  └─── Payroll
         │
         ├─── Attendance (attendance_days)
         │
         └─── Leave Requests (leave_days)

Customers ──── Loyalty
          │
          └─── Sales

Suppliers ──── Purchase Orders

Settings ──── Business (tax_rate, theme)
         │
         └─── Categories ──── Products

Payment Accounts ──── POS (transfer payment)
                 │
                 └─── Sales (transfer details)

Card Brands ──── POS (card payment)
             │
             └─── Sales (card details)

Coupons ──── POS (discount)
```

---

## 8. End-to-End Transaction Flow

### Sale Flow (POS/Dine-In)
```
1. USER LOGIN → JWT issued
2. OUTLET CONTEXT LOADED (GET /outlets/my)
3. SHIFT OPEN (POST /shifts/open) — if kasir
4. PRODUCT LOAD (GET /products?outlet_id=...)
5. OUTLET STOCK LOAD (GET /outlet-stocks/:outletId)
6. CUSTOMER SELECT (GET /customers) — optional
7. CART BUILD (frontend state)
8. PRICE RESOLUTION (server-side, pricing_service)
9. PAYMENT METHOD SELECT
10. CHECKOUT (POST /sales)
    a. VALIDATE items + stock
    b. CALCULATE subtotal, tax, total
    c. VALIDATE payment
    d. GENERATE invoice_no
    e. BEGIN TRANSACTION
    f. INSERT sales
    g. DEDUCT products.stock + outlet_stocks.quantity
    h. INSERT stock_movements (reason=sale)
    i. COMMIT
    j. EMIT NEW_SALE (realtime)
    k. CREATE low-stock alert (if needed)
11. RECEIPT DISPLAY + PRINT
12. DATA AVAILABLE IN:
    - Sales Report
    - P&L Report
    - Dashboard
    - Shift Report
    - Payment Reconciliation
    - AI Assistant
    - KDS (dine-in)
    - Loyalty (point accumulation — NOT CONFIRMED)
```

### Stock Flow
```
PURCHASE ORDER (stock in)
 ↓
RECEIVE PO → products.stock + outlet_stocks + stock_movements (restock)
 ↓
SALE (stock out)
 ↓
products.stock - outlet_stocks - stock_movements (sale)
 ↓
TRANSFER (stock move)
 ↓
source: outlet_stocks - stock_movements (transfer_out)
 ↓
destination: outlet_stocks + stock_movements (transfer_in)
 ↓
MANUAL ADJUSTMENT
 ↓
products.stock + stock_movements (adjustment/return/damage)
 ↓
LOW STOCK ALERT (if stock <= threshold)
 ↓
REPORTS (Stock Report, P&L COGS)
```

### Payroll Flow
```
ATTENDANCE (clock-in/out) → attendance records
 ↓
LEAVE REQUESTS (approve) → leave records
 ↓
SCHEDULES (jadwal) → late detection (NOT CONFIRMED)
 ↓
PAYROLL PERIOD CREATE
 ↓
PROCESS PAYROLL
 ├── COUNT attendance_days
 ├── COUNT leave_days
 ├── CALCULATE base_salary + allowances + bonus - deductions
 └── CALCULATE net_salary
 ↓
PAYROLL ITEMS CREATED
 ↓
MARK PAID
 ↓
PAYROLL SELESAI
```

---

## 9. Security Findings (Global)

| ID | Severity | Finding |
|----|----------|---------|
| SEC-F-01 | HIGH | Hard-coded JWT secret fallback `ganti-dengan-string-acak-64-karakter-untuk-produksi` |
| SEC-F-02 | MEDIUM | CORS default `allow_origins=["*"]` dengan `allow_credentials=true` — dapat menyebabkan credential leakage |
| SEC-F-03 | MEDIUM | Dual auth (HTTP-only cookie + localStorage Bearer) — attack surface lebih luas |
| SEC-F-04 | MEDIUM | MongoDB config exists (`MONGO_URL`) tapi tidak ada MongoDB service di Compose — dead config |
| SEC-F-05 | LOW | No HTTPS/TLS di Docker setup (Nginx hanya HTTP) |
| SEC-F-06 | LOW | Duplicate JWT libraries di requirements.txt |
| SEC-F-07 | LOW | Production requirements include development tools |
| SEC-F-08 | LOW | `DB_NAME` env contains `not_used_pg_active` — inconsistent naming |
| SEC-F-09 | LOW | `GET /api/business` public tanpa auth — expose business info |
| SEC-F-10 | LOW | Midtrans defaults to sandbox — perlu switch to production |

---

## 10. Schema Findings (Global)

| ID | Severity | Finding |
|----|----------|---------|
| SCH-F-01 | MEDIUM | Banyak transaction tables tidak memiliki FK constraint ke `outlets`, `users`, `customers` — data integrity risk |
| SCH-F-02 | MEDIUM | `online_order_items` tidak memiliki `outlet_id` sendiri — scope via `order_id` |
| SCH-F-03 | LOW | `users` table tidak memiliki `outlet_id` — outlet access via `user_outlet_access` (by design) |
| SCH-F-04 | LOW | `stock_transfers.status` default `completed` di schema tapi logic menggunakan `pending` — inconsistency |
| SCH-F-05 | LOW | Multiple `is_main=true` outlets tidak dicegah — tidak ada unique constraint |

---

## 11. Implementation Gaps (Global)

| Gap | Keterangan |
|-----|------------|
| Audit logging | Tidak semua module memanggil `log_audit` — inconsistent audit trail |
| Outlet filter | Beberapa endpoint (mis. `GET /api/orders`) tidak memiliki outlet filter eksplisit |
| Stock race condition | Stock deduction tidak menggunakan row lock — concurrent sale can cause negative stock |
| Idempotency | Tidak ada idempotency key di sale creation — double submit can duplicate |
| Realtime | Realtime implementation NOT CONFIRMED — websocket atau polling |
| Shift enforcement | Shift open tidak enforced di backend — sale bisa dibuat tanpa open shift |
| Soft delete | Tidak ada soft delete pattern — semua delete adalah hard delete |
| Pagination | Beberapa list endpoint tidak memiliki pagination — query luas dapat lambat |

---

## 12. Module Status Summary

| Module | Status | Notes |
|--------|--------|-------|
| Dashboard | IMPLEMENTED | Report-derived, no dedicated table |
| Tables | IMPLEMENTED | Dine-in order + checkout |
| Attendance | IMPLEMENTED | Webcam clock-in/out |
| Products | IMPLEMENTED | Multi-pricing, variants |
| Inventory | IMPLEMENTED | Adjustment + movements |
| Purchase Orders | IMPLEMENTED | Draft → received/cancelled |
| Customers | IMPLEMENTED | Global, CrudList |
| Suppliers | IMPLEMENTED | Global, CrudList |
| Outlets | IMPLEMENTED | Owner-only CUD |
| Users | IMPLEMENTED | Outlet assignment, reset password |
| Payment Accounts | IMPLEMENTED | Outlet-scoped, CrudList |
| Roles | IMPLEMENTED | Permission tree, menu visibility |
| POS | IMPLEMENTED | Multi-pricing, multi-payment, shift |
| Transfers | IMPLEMENTED | Stock request → approval → transfer → delivery → receive |
| Reports | IMPLEMENTED | 7 tabs, export Excel/PDF |
| Settings | IMPLEMENTED | Business profile, theme, categories |
| Shifts | IMPLEMENTED | Open/close, reconciliation |
| AI Assistant | IMPLEMENTED | LLM-based, outlet scope |
| Expenses | IMPLEMENTED | Outlet-scoped, CrudList |
| Audit Logs | IMPLEMENTED | Read-only, filter |
| Leave Requests | IMPLEMENTED | Approval flow |
| Loyalty | IMPLEMENTED | Per-outlet membership, adjust points |
| KDS | IMPLEMENTED | Kitchen display, status update |
| Coupons | IMPLEMENTED | Validate + apply di POS |
| Schedules | IMPLEMENTED | Per karyawan per hari |
| Payroll | IMPLEMENTED | Period → process → paid |

---

## 13. Documentation Status

| Document | Status |
|----------|--------|
| 01_dashboard.md | DONE |
| 02_tables.md | DONE |
| 03_attendance.md | DONE |
| 04_products.md | DONE |
| 05_inventory.md | DONE |
| 06_purchase_orders.md | DONE |
| 07_customers.md | DONE |
| 08_suppliers.md | DONE |
| 09_outlets.md | DONE |
| 10_users.md | DONE |
| 11_payment_accounts.md | DONE |
| 12_roles.md | DONE |
| 13_pos.md | DONE |
| 14_transfers.md | DONE |
| 15_reports.md | DONE |
| 16_settings.md | DONE |
| 17_shifts.md | DONE |
| 18_ai_assistant.md | DONE |
| 19_expenses.md | DONE |
| 20_audit_logs.md | DONE |
| 21_leave_requests.md | DONE |
| 22_loyalty.md | DONE |
| 23_kds.md | DONE |
| 24_coupons.md | DONE |
| 25_schedules.md | DONE |
| 26_payroll.md | DONE |
| cross_module_architecture.md | DONE (this document) |

---

## 14. Audit Methodology

Dokumentasi ini berdasarkan **static source code audit** — tidak ada runtime test yang dilakukan. Priority evidence:

1. Source code (backend/routes, frontend/src/pages)
2. Database schema (postgres_schema.sql)
3. API implementation
4. Frontend implementation
5. Existing configuration
6. Existing documentation (v1.0, v2.0 — outdated)
7. Seed/data files

Jika evidence tidak tersedia, digunakan:
- `NOT FOUND`
- `NOT CONFIRMED FROM SOURCE`

Tidak ada fitur baru yang diimplementasikan. Tidak ada bug yang diperbaiki. Dokumentasi murni descriptive AS-IS.
