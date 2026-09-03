# PRODUCTS (PRODUK) — BUSINESS & TECHNICAL DOCUMENTATION

> Dokumentasi AS-IS berdasarkan audit source code.
> Source: `frontend/src/pages/Products.js`, `backend/routes/products.py`, `backend/services/pricing_service.py`, `backend/models/products.py`, `backend/sql/postgres_schema.sql`

---

## 1. Module Overview

Menu Products mengelola master data produk F&B: nama, SKU, barcode, kategori, harga, cost, stok, unit, varian, tipe produk, dan multi-pricing (retail, reseller, wholesale, online). Produk adalah master data global yang stok-nya outlet-scoped via `outlet_stocks`.

---

## 2. Business Purpose

Menyediakan katalog produk terpusat yang digunakan oleh POS, Dine-In, Purchase Orders, Inventory, Transfers, dan Reports. Multi-pricing mendukung penjualan ke berbagai channel (eceran, reseller, partai, online).

---

## 3. Business Objective

- Mengelola katalog produk secara terpusat.
- Mendukung varian produk (size, rasa, dll).
- Mendukung multiple harga per channel (retail/reseller/wholesale/online).
- Menyimpan HPP (cost) untuk perhitungan profit.
- Menghubungkan produk dengan kategori dan stok per outlet.

---

## 4. Actors / Roles

| Role | Akses | Keterangan |
|------|-------|------------|
| Owner | YA | Full CRUD |
| Admin | YA | Full CRUD |
| Manager | YA | View + Create + Update (no delete) |
| Supervisor | YA | View |
| Kasir | TIDAK | Tidak ada menu Products (hanya POS) |

Berdasarkan `seed_roles.sql`: manager memiliki `products: view, create, update` (tidak ada delete).

---

## 5. Outlet Scope

**Klasifikasi: HYBRID (Global master + Outlet-scoped stock)**

- Master data produk (`products` table) = **GLOBAL** — tidak ada `outlet_id`.
- Stok produk (`outlet_stocks` table) = **OUTLET-SCOPED** — per `outlet_id`.
- Frontend mengirim `outlet_id` untuk join dengan `outlet_stocks`.
- Backend `list_products` join `products` dengan `outlet_stocks` berdasarkan `outlet_id`.

Sumber: `backend/routes/products.py` line 8, `frontend/src/pages/Products.js` line 11.

---

## 6. Role & Permission

| Aksi | Owner | Admin | Manager | Supervisor | Kasir |
|------|-------|-------|---------|------------|-------|
| View Products | YA | YA | YA | YA | TIDAK |
| Create Product | YA | YA | YA | TIDAK | TIDAK |
| Update Product | YA | YA | YA | TIDAK | TIDAK |
| Delete Product | YA | YA | TIDAK | TIDAK | TIDAK |

Backend:
- `GET /api/products` → `get_current_user`
- `POST /api/products` → `require_permission("products", "create")`
- `PUT /api/products/{id}` → `require_permission("products", "update")`
- `DELETE /api/products/{id}` → `require_permission("products", "delete")`

---

## 7. Business Flow

```
MANAGER/ADMIN BUKA MENU PRODUK
 ↓
PILIH OUTLET (untuk lihat stok)
 ↓
LIHAT DAFTAR PRODUK + STOK OUTLET
 ↓
[TAMBAH PRODUK]
 ↓
ISI: nama, SKU, barcode, kategori, price, cost, stock, unit, variants, pricing
 ↓
UPLOAD GAMBAR (opsional)
 ↓
SIMPAN
 ↓
PRODUK TERSEDIA DI POS & DINE-IN
```

---

## 8. Detailed Business Rules

1. SKU harus unik (`products.sku` UNIQUE constraint).
2. Barcode opsional, dapat digunakan untuk pencarian produk di POS.
3. `price` = harga utama/legacy (NOT NULL).
4. `cost` = HPP untuk perhitungan profit (default 0).
5. `stock` = stok global/utama (default 0) — digunakan untuk outlet utama.
6. `outlet_stocks` = stok per outlet (terpisah dari `products.stock`).
7. `variants` = JSONB array, setiap varian dapat memiliki pricing sendiri.
8. `product_type` = `standard` (default) — tipe lain: NOT CONFIRMED FROM SOURCE (v2.0 doc menyebutkan paket/bundle via kategori, tapi implementasi `product_type` column default `standard`).
9. Additional pricing (retail/reseller/wholesale/online) = opsional, fallback ke `price` jika NULL.
10. `is_active` = true/false — produk non-aktif tidak tampil di POS.
11. `low_stock_threshold` = ambang batas stok rendah (default 5).

---

## 9. State / Status

Produk tidak memiliki state machine kompleks. Status:

```
is_active: true  ↔  false
```

---

## 10. Technical Architecture

```
Browser
 ↓
React Component (Products.js)
 ↓
API Client (lib/api.js)
 ↓
FastAPI Endpoint (routes/products.py)
 ↓
Auth (get_current_user / require_permission)
 ↓
Business Logic
 ↓
SQL Query (raw SQL)
 ↓
PostgreSQL (products, categories, outlet_stocks, stock_movements)
 ↓
Response
 ↓
UI Update
```

---

## 11. Technical Flow

### Create Product
1. `Products.js` → user isi form → upload gambar via `POST /api/uploads`.
2. `POST /api/products` dengan `{ name, sku, barcode, category_id, price, cost, stock, unit, variants, product_type, retail_price, reseller_price, wholesale_price, online_price, image_url, is_active }`.
3. Backend `create_product` (products.py L51):
   - Cek SKU uniqueness.
   - Insert ke `products`.
   - Log initial stock movement ke `stock_movements`.
4. Response → frontend reload list.

### Update Product
1. `PUT /api/products/{id}` dengan field yang diubah.
2. Backend `update_product` (products.py L76):
   - Cek SKU duplicate (selain dirinya sendiri).
   - Dynamic field update.
3. Response → frontend reload.

### Delete Product
1. `DELETE /api/products/{id}`.
2. Backend `delete_product` (products.py L170):
   - Delete dari `products` table.

### List Products
1. `GET /api/products?outlet_id={uuid}`.
2. Backend `list_products` (products.py L8):
   - Join `products` dengan `outlet_stocks` berdasarkan `outlet_id`.
   - Filter `is_active = TRUE`.
   - Non-owner: outlet scope via `filter_outlets_for_user`.

### Barcode Lookup
1. `GET /api/products/by-barcode/{code}`.
2. Backend `product_by_barcode` (products.py L45):
   - `SELECT ... WHERE barcode = :code OR sku = :code`.

---

## 12. Frontend

**File:** `frontend/src/pages/Products.js`

| Elemen | Detail |
|--------|--------|
| Context | `useOutlet()` — `outletIdForApi` (line 11) |
| API Calls | `POST /uploads`, `GET /products?outlet_id=...`, `GET /categories`, `POST /products`, `PUT /products/:id`, `DELETE /products/:id` |
| State | `items`, `categories`, `form`, `editing`, `showForm`, `search`, `uploadingImage` |
| UI | Product table with search, add/edit modal (name, SKU, barcode, category, cost/price/stock, low stock threshold, unit, image, variants, price types: retail/reseller/wholesale/online), image upload |
| Form Fields | name, sku, barcode, category_id, price, cost, stock, low_stock_threshold, unit, image_url, description, is_active, variants (JSONB), product_type, retail_price, reseller_price, wholesale_price, online_price |

---

## 13. Backend

**File:** `backend/routes/products.py`

| Endpoint | Method | Function | Line | Auth |
|----------|--------|----------|------|------|
| `/api/products` | GET | `list_products` | L8 | `get_current_user` |
| `/api/products/by-barcode/{code}` | GET | `product_by_barcode` | L45 | `get_current_user` |
| `/api/products` | POST | `create_product` | L51 | `require_permission("products", "create")` |
| `/api/products/{product_id}` | PUT | `update_product` | L76 | `require_permission("products", "update")` |
| `/api/products/{product_id}` | DELETE | `delete_product` | L170 | `require_permission("products", "delete")` |

---

## 14. API

```
GET /api/products?outlet_id={uuid}
GET /api/products/by-barcode/{code}
POST /api/products { name, sku, barcode, category_id, price, cost, stock, ... }
PUT /api/products/{id} { ...fields }
DELETE /api/products/{id}
```

---

## 15. Database

### Table: `products`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `name` | varchar(255) | — | NOT NULL |
| `sku` | varchar(100) | — | UNIQUE, NOT NULL |
| `barcode` | varchar(100) | — | |
| `category_id` | uuid FK | — | → `categories(id)` ON DELETE SET NULL |
| `price` | numeric(12,2) | — | NOT NULL — harga utama/legacy |
| `cost` | numeric(12,2) | 0 | HPP |
| `stock` | integer | 0 | Stok global/utama |
| `low_stock_threshold` | integer | 5 | |
| `unit` | varchar(50) | `'pcs'` | |
| `image_url` | text | — | |
| `description` | text | — | |
| `is_active` | boolean | true | |
| `variants` | jsonb | `'[]'` | Array varian |
| `product_type` | varchar(20) | `'standard'` | |
| `retail_price` | numeric(12,2) | NULL | Harga eceran |
| `reseller_price` | numeric(12,2) | NULL | Harga reseller |
| `wholesale_price` | numeric(12,2) | NULL | Harga partai |
| `online_price` | numeric(12,2) | NULL | Harga online |
| `created_at` | timestamptz | `now()` | |
| `updated_at` | timestamptz | — | |

**Indexes:** `idx_products_sku`, `idx_products_barcode`, `idx_products_category`

### Table: `outlet_stocks`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `product_id` | uuid FK | — | → `products(id)` ON DELETE CASCADE |
| `outlet_id` | uuid FK | — | → `outlets(id)` ON DELETE CASCADE |
| `quantity` | integer | 0 | |
| `updated_at` | timestamptz | `now()` | |

**Constraint:** UNIQUE (`product_id`, `outlet_id`)
**Index:** `idx_outlet_stocks_outlet`

### Table: `categories`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `name` | varchar(255) | — | NOT NULL |
| `color` | varchar(20) | `'#D4AF37'` | |
| `created_at` | timestamptz | `now()` | |

**Relationship:**
```
categories (1) ─── (many) products
products (1) ─── (many) outlet_stocks
```

---

## 16. Data Flow

```
USER INPUT (form produk)
 ↓
FRONTEND STATE (form object)
 ↓
[UPLOAD GAMBAR] → POST /uploads → image_url
 ↓
API: POST /products
 ↓
BACKEND: create_product()
 ↓
VALIDATE SKU uniqueness
 ↓
INSERT products
 ↓
LOG stock_movements (initial stock)
 ↓
RESPONSE
 ↓
FRONTEND RELOAD LIST
```

---

## 17. Validation

- SKU harus unik (backend cek + DB UNIQUE constraint).
- `price` NOT NULL.
- `name` NOT NULL.
- `sku` NOT NULL.
- Barcode opsional.
- Additional pricing opsional (nullable).

---

## 18. Calculation

### Price Resolution (di POS/Sales)
```
Channel: online → online_price (fallback: price)
Channel: offline, price_type: ecceran → retail_price (fallback: price)
Channel: offline, price_type: reseller → reseller_price (fallback: price)
Channel: offline, price_type: partai → wholesale_price (fallback: price)
```

Sumber: `backend/services/pricing_service.py` `_resolve_price_from_obj` (L19) dan `resolve_product_price` (L66).

### Variant Pricing
Jika varian memiliki field pricing sendiri (retail_price, reseller_price, wholesale_price, online_price), varian pricing diprioritaskan atas product-level pricing.

### COGS
```
cost = products.cost (per item)
total_cogs = cost × quantity
```

---

## 19. Audit Log

| Action | Entity | Dicatat? |
|--------|--------|----------|
| Create Product | `product` | NOT CONFIRMED FROM SOURCE (stock_movement dicatat, audit log tidak eksplisit) |
| Update Product | `product` | NOT CONFIRMED FROM SOURCE |
| Delete Product | `product` | NOT CONFIRMED FROM SOURCE |

> Initial stock movement dicatat di `stock_movements` saat create product. Audit log ke `audit_logs` table tidak terlihat eksplisit di products route.

---

## 20. Reports

- Produk masuk ke: Sales Report (by product), Profit/Loss Report (COGS), Stock Report, Dashboard (product count, low stock).
- `cost` digunakan untuk perhitungan gross profit di P&L.
- `low_stock_threshold` digunakan untuk alert stok rendah.

---

## 21. Integration / Dependency

| Dependency | Keterangan |
|------------|------------|
| Categories | Pengelompokan produk |
| Outlet Stocks | Stok per outlet |
| POS | Pencarian & penjualan produk |
| Dine-In/Tables | Item order |
| Purchase Orders | Restock produk |
| Inventory | Stock adjustment |
| Transfers | Transfer stok antar outlet |
| Sales | Transaksi penjualan |
| Reports | COGS, profit, stock |
| Online Orders | Item online order |
| KDS | Item untuk kitchen display |

---

## 22. Error Handling

| Kondisi | HTTP | Behavior |
|---------|------|----------|
| SKU duplicate | 400 | "SKU already exists" |
| Product not found | 404 | "Product not found" |
| Unauthorized | 401/403 | Redirect/blocked |
| Upload fail | 400 | Error message |

---

## 23. Edge Cases

- Produk dengan varian tetapi varian tidak ada pricing → fallback ke product-level price.
- Produk dihapus saat ada transaksi referensi → `category_id` SET NULL, tapi `sales.items` JSONB tetap menyimpan snapshot.
- Produk non-aktif (`is_active=false`) → tidak tampil di POS, tapi data tetap di DB.
- Stok outlet belum ada → auto-create saat sale/transfer pertama.
- Barcode sama dengan SKU → `product_by_barcode` mencari keduanya.

---

## 24. Security

| Aspek | Status |
|-------|--------|
| Authentication | YA |
| Authorization | YA — `require_permission` untuk CUD |
| Outlet Enforcement | List produk join outlet_stocks, tapi master data global — CUD tidak outlet-scoped |
| SQL Injection | Aman — parameterized |
| File Upload | `POST /uploads` — type/size validation |

---

## 25. QA / Test Cases

```
TC-PRD-001: Create product standard
Given: Manager dengan permission create
When: Isi form lengkap + submit
Then: Product created, muncul di list

TC-PRD-002: SKU duplicate
Given: Produk dengan SKU "ABC001" exists
When: Create produk baru dengan SKU "ABC001"
Then: Error 400 "SKU already exists"

TC-PRD-003: Update product
Given: Produk exists
When: Update price dan cost
Then: Product updated

TC-PRD-004: Delete product
Given: Produk exists (manager)
When: Manager delete
Then: Error 403 (manager tidak punya delete permission)

TC-PRD-005: Barcode lookup
Given: Produk dengan barcode "8990001234567"
When: GET /products/by-barcode/8990001234567
Then: Produk ditemukan

TC-PRD-006: Multi-pricing
Given: Produk dengan retail_price=15000, wholesale_price=12000
When: Sale offline ecceran
Then: Harga = 15000
When: Sale offline partai
Then: Harga = 12000

TC-PRD-007: Fallback to price
Given: Produk dengan retail_price=NULL, price=10000
When: Sale offline ecceran
Then: Harga = 10000 (fallback)
```

---

## 26. Current Implementation Status

```
STATUS: IMPLEMENTED
```

CRUD produk, multi-pricing, varian, barcode lookup, dan image upload berfungsi.

---

## 27. Bugs / Findings

| ID | Severity | Finding |
|----|----------|---------|
| PRD-F-01 | LOW | Audit logging untuk product CRUD tidak terlihat eksplisit di route |
| PRD-F-02 | LOW | `product_type` column ada tapi hanya default `standard` — implementasi tipe lain (paket/bundle) tidak terkonfirmasi dari route code |
| PRD-F-03 | LOW | Delete product bersifat hard delete — dapat menyebabkan referensi hilang (sales.items JSONB tetap aman karena snapshot) |

---

## 28. Gaps

| Gap | Keterangan |
|-----|------------|
| Soft delete | Tidak ada soft delete — `is_active` ada tapi delete adalah hard delete |
| Product import/export | Tidak ada bulk import/export produk |
| Bundle/Paket composition | `product_type` ada tapi composition logic tidak terlihat di products route (v2.0 doc menyebutkan category-based detection) |
| Price history | Tidak ada history perubahan harga |

---

## 29. Dependency Map

```
Products
 ├── Categories (pengelompokan)
 ├── Outlet Stocks (stok per outlet)
 ├── POS (penjualan)
 ├── Dine-In/Tables (order)
 ├── Purchase Orders (restock)
 ├── Inventory (adjustment)
 ├── Transfers (antar outlet)
 ├── Sales (transaksi)
 ├── Online Orders (online sales)
 ├── KDS (kitchen display)
 └── Reports (COGS, profit, stock)
```

---

## 30. End-to-End Flow

```
MANAGER BUKA MENU PRODUK
 ↓
PILIH OUTLET (lihat stok)
 ↓
LIHAT DAFTAR PRODUK
 ↓
[TAMBAH PRODUK]
 ↓
ISI FORM + UPLOAD GAMBAR
 ↓
POST /products
 ↓
VALIDATE SKU
 ↓
INSERT products + stock_movements
 ↓
PRODUK TERSEDIA
 ↓
DIGUNAKAN OLEH:
 ├── POS (penjualan)
 ├── DINE-IN (order)
 ├── PO (restock)
 ├── INVENTORY (adjustment)
 ├── TRANSFER (antar outlet)
 └── REPORTS (COGS, profit)
```
