# INVENTORY — BUSINESS & TECHNICAL DOCUMENTATION

> Dokumentasi AS-IS berdasarkan audit source code.
> Source: `frontend/src/pages/Inventory.js`, `backend/routes/inventory.py`, `backend/services/inventory_service.py`, `backend/sql/postgres_schema.sql`

---

## 1. Module Overview

Menu Inventory mengelola stok produk per outlet, adjustment stok (restock, adjustment, return, damage), dan history pergerakan stok (`stock_movements`). Inventory adalah module outlet-scoped yang melacak semua perubahan stok dari berbagai sumber (sale, purchase, transfer, adjustment).

---

## 2. Business Purpose

Memberikan visibilitas dan kontrol terhadap stok barang per outlet, mencatat semua pergerakan stok untuk auditabilitas, dan mendeteksi stok rendah.

---

## 3. Business Objective

- Melihat stok produk per outlet secara real-time.
- Melakukan adjustment stok (restock, return, damage, correction).
- Mencatat semua pergerakan stok di `stock_movements`.
- Mendeteksi produk dengan stok rendah.
- Menyediakan data stok untuk POS, Reports, dan Dashboard.

---

## 4. Actors / Roles

| Role | Akses | Keterangan |
|------|-------|------------|
| Owner | YA | Semua outlet |
| Admin | YA | Outlet yang di-assign |
| Manager | YA | Outlet yang di-assign |
| Supervisor | YA | View only |
| Kasir | TIDAK | Tidak ada menu Inventory |

Berdasarkan `seed_roles.sql`: manager memiliki `inventory: view, update`.

---

## 5. Outlet Scope

**Klasifikasi: OUTLET-SCOPED**

- `outlet_stocks` memiliki `outlet_id` — stok per outlet.
- `stock_movements` memiliki `outlet_id` — pergerakan per outlet.
- Frontend mengirim `outlet_id` via query param.
- Backend memfilter berdasarkan `outlet_id` atau `filter_outlets_for_user`.

Sumber: `backend/routes/inventory.py` lines 9-53, `frontend/src/pages/Inventory.js` line 9.

---

## 6. Role & Permission

| Aksi | Owner | Admin | Manager | Supervisor | Kasir |
|------|-------|-------|---------|------------|-------|
| View Stock | YA | YA | YA | YA | TIDAK |
| View Movements | YA | YA | YA | YA | TIDAK |
| Adjust Stock | YA | YA | YA | TIDAK | TIDAK |

Backend:
- `GET /api/inventory/movements` → `get_current_user`
- `GET /api/inventory/stock` → `get_current_user`
- `POST /api/inventory/adjust` → `require_permission("inventory", "update")`

---

## 7. Business Flow

```
MANAGER BUKA MENU INVENTORY
 ↓
PILIH OUTLET
 ↓
LIHAT STOK PRODUK PER OUTLET
 ↓
[PILIH TAB: ADJUSTMENT / HISTORY]
 ↓
[ADJUSTMENT]
 ↓
PILIH PRODUK
 ↓
PILIH DELTA (+/-)
 ↓
PILIH REASON (restock/adjustment/return/damage)
 ↓
TAMBAH NOTE (opsional)
 ↓
SUBMIT
 ↓
STOK UPDATE + MOVEMENT DICATAT
 ↓
[HISTORY]
 ↓
LIHAT SEMUA PERGERAKAN STOK
```

---

## 8. Detailed Business Rules

1. Stok per outlet disimpan di `outlet_stocks.quantity`.
2. Stok global/utama disimpan di `products.stock` (untuk outlet utama).
3. Adjustment: `new_stock = max(0, stock + delta)` — stok tidak bisa negatif.
4. Setiap adjustment mencatat `stock_movements` dengan `delta`, `reason`, `note`.
5. Reason: `restock`, `adjustment`, `return`, `damage`, `sale`, `void`.
6. `stock_movements` juga dicatat oleh: Sale (reason=`sale`, delta=-qty), Purchase Order receive (reason=`restock`), Transfer (reason=`transfer_in`/`transfer_out`), Void Sale (reason=`void`, delta=+qty).
7. Outlet utama auto-seed stok dari `products.stock` jika `outlet_stocks` belum ada.
8. **Void sale stock reversal**: Saat sale di-void (`POST /sales/{id}/void`), stok dikembalikan — `products.stock` dan `outlet_stocks.quantity` ditambah kembali, `stock_movements` dengan `reason=void` (delta=+qty) dicatat. Proses ini dilakukan dalam satu database transaction.

---

## 9. State / Status

Inventory tidak memiliki state machine. `stock_movements.reason` values:

```
restock      — penambahan stok (PO receive, manual restock)
sale         — pengurangan stok (POS sale)
void         — pengembalian stok (void sale, delta=+qty)
adjustment   — koreksi stok
return       — retur barang
damage       — barang rusak
transfer_in  — stok masuk dari transfer
transfer_out — stok keluar dari transfer
```

Sumber: `backend/routes/inventory.py`, `backend/services/sales_service.py`, `backend/routes/purchase_orders.py`, `backend/routes/stock_transfers.py`.

---

## 10. Technical Architecture

```
Browser
 ↓
React Component (Inventory.js)
 ↓
API Client (lib/api.js)
 ↓
FastAPI Endpoint (routes/inventory.py)
 ↓
Auth (get_current_user / require_permission)
 ↓
Business Logic (inventory_service.py)
 ↓
SQL Query (raw SQL)
 ↓
PostgreSQL (outlet_stocks, stock_movements, products)
 ↓
Response
 ↓
UI Update
```

---

## 11. Technical Flow

### Adjust Stock
1. `Inventory.js` → user pilih produk, input delta, pilih reason, add note.
2. `POST /api/inventory/adjust` dengan `{ product_id, delta, reason, note, outlet_id }`.
3. Backend `adjust_stock` (inventory.py L9):
   - `new_stock = max(0, current_stock + delta)`.
   - Update `products.stock` (global).
   - Insert `stock_movements` dengan `delta`, `reason`, `note`, `outlet_id`, `user_id`.
4. Response → frontend reload.

### List Movements
1. `GET /api/inventory/movements?outlet_id={uuid}`.
2. Backend `list_movements` (inventory.py L20):
   - Join `outlet_stocks`/`outlets`.
   - Filter by `outlet_id` or `filter_outlets_for_user`.
   - Limit 200, ordered by `created_at` DESC.

### List Outlet Stock
1. `GET /api/inventory/stock?outlet_id={uuid}`.
2. Backend `list_outlet_stock` (inventory.py L53):
   - Returns product quantities per outlet.

---

## 12. Frontend

**File:** `frontend/src/pages/Inventory.js`

| Elemen | Detail |
|--------|--------|
| Context | `useOutlet()` — `outletIdForApi` (line 9) |
| API Calls | `GET /products?outlet_id=...`, `GET /inventory/movements?outlet_id=...`, `POST /inventory/adjust` |
| State | `products`, `movements`, `selected`, `delta`, `reason`, `note`, `tab` (adjust/history) |
| UI | Two tabs: Adjustment form (product selector, +/- stepper, reason dropdown, note) + History table |
| Reasons | restock, adjustment, return, damage |

---

## 13. Backend

**File:** `backend/routes/inventory.py`

| Endpoint | Method | Function | Line | Auth |
|----------|--------|----------|------|------|
| `/api/inventory/adjust` | POST | `adjust_stock` | L9 | `require_permission("inventory", "update")` |
| `/api/inventory/movements` | GET | `list_movements` | L20 | `get_current_user` |
| `/api/inventory/stock` | GET | `list_outlet_stock` | L53 | `get_current_user` |

**File:** `backend/services/inventory_service.py`

| Function | Line | Purpose |
|----------|------|---------|
| `_get_main_outlet_id()` | L5 | Get outlet dengan `is_main=TRUE` |
| `_adjust_outlet_stock(product_id, outlet_id, delta)` | L12 | Insert/update `outlet_stocks` quantity |

---

## 14. API

```
POST /api/inventory/adjust { product_id, delta, reason, note, outlet_id }
GET /api/inventory/movements?outlet_id={uuid}
GET /api/inventory/stock?outlet_id={uuid}
```

---

## 15. Database

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

### Table: `stock_movements`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `product_id` | uuid | — | NOT NULL |
| `product_name` | varchar(255) | — | |
| `delta` | integer | — | NOT NULL (+/-) |
| `reason` | varchar(50) | — | NOT NULL |
| `note` | text | — | |
| `outlet_id` | uuid | — | |
| `user_id` | uuid | — | |
| `created_at` | timestamptz | `now()` | |
| `adjustment_type` | varchar(20) | `'restock'` | |
| `reference_no` | varchar(100) | — | Invoice/PO/Transfer no |
| `approved_by` | uuid | — | |

**Indexes:** `idx_movements_product`, `idx_movements_created`, `idx_stock_movements_outlet`

**Relationship:**
```
products (1) ─── (many) outlet_stocks
products (1) ─── (many) stock_movements
outlets (1) ─── (many) outlet_stocks
outlets (1) ─── (many) stock_movements
```

---

## 16. Data Flow

### Adjustment Flow
```
USER INPUT (product, delta, reason, note)
 ↓
FRONTEND STATE
 ↓
API: POST /inventory/adjust
 ↓
BACKEND: adjust_stock()
 ↓
CALCULATE: new_stock = max(0, stock + delta)
 ↓
UPDATE products.stock
 ↓
INSERT stock_movements
 ↓
RESPONSE
 ↓
FRONTEND RELOAD
```

### Sale Impact (from POS)
```
SALE CREATED
 ↓
sales_service._deduct_sale_stock()
 ↓
UPDATE products.stock (deduct)
 ↓
UPDATE/INSERT outlet_stocks (deduct)
 ↓
INSERT stock_movements (reason=sale, delta=-qty)
```

### Void Sale Impact (stock reversal)
```
SALE VOIDED (POST /sales/{id}/void)
 ↓
UPDATE sales SET status='voided'
 ↓
LOOP ITEMS:
 ├── UPDATE products.stock (add back)
 ├── UPDATE/INSERT outlet_stocks (add back)
 └── INSERT stock_movements (reason=void, delta=+qty)
 ↓
COMMIT (atomic transaction)
 ↓
audit_logs: SALE_VOIDED
```

### Purchase Receive Impact
```
PO RECEIVED
 ↓
receive_po()
 ↓
UPDATE products.stock (add)
 ↓
UPDATE/INSERT outlet_stocks (add)
 ↓
INSERT stock_movements (reason=restock, delta=+qty)
```

### Transfer Impact
```
TRANSFER CREATED
 ↓
create_transfer()
 ↓
DEDUCT source outlet_stocks
 ↓
INSERT stock_movements (reason=transfer_out, delta=-qty)
 ↓
[ITEM APPROVED AT DESTINATION]
 ↓
ADD destination outlet_stocks
 ↓
INSERT stock_movements (reason=transfer_in, delta=+qty)
```

---

## 17. Validation

- `delta` dapat positif (restock/return) atau negatif (damage/adjustment).
- `new_stock = max(0, stock + delta)` — stok tidak bisa negatif.
- `reason` required.
- `product_id` required.

---

## 18. Calculation

### Stock Balance
```
current_stock = outlet_stocks.quantity (per outlet)
global_stock = products.stock
```

### Movement Delta
```
delta > 0 → stock in
delta < 0 → stock out
```

---

## 19. Audit Log

| Action | Entity | Dicatat? |
|--------|--------|----------|
| Stock Adjustment | `stock_movement` | YA — via `stock_movements` table (bukan `audit_logs`) |
| Sale Stock Deduct | `stock_movement` | YA — reason=`sale`, delta=-qty |
| Void Sale Stock Reversal | `stock_movement` | YA — reason=`void`, delta=+qty (stok dikembalikan) |
| PO Receive | `stock_movement` | YA — reason=`restock` |
| Transfer Out/In | `stock_movement` | YA — reason=`transfer_out`/`transfer_in` |

> `stock_movements` berfungsi sebagai audit trail stok, terpisah dari `audit_logs` table. Void sale juga mencatat `audit_logs` action=`SALE_VOIDED` sebagai audit tingkat aplikasi.

---

## 20. Reports

- Stock Report (`GET /api/reports/stock`): movements, total in/out, by reason/product, low stock.
- Dashboard: low stock count.
- P&L: COGS dari `products.cost` × qty sold.

---

## 21. Integration / Dependency

| Dependency | Keterangan |
|------------|------------|
| Products | Master data produk |
| Outlet Stocks | Stok per outlet |
| Stock Movements | History pergerakan |
| Sales | Stock deduct saat sale |
| Purchase Orders | Stock add saat receive |
| Transfers | Stock out (source) + stock in (destination) |
| Reports | Stock report, P&L |
| Dashboard | Low stock alert |

---

## 22. Error Handling

| Kondisi | HTTP | Behavior |
|---------|------|----------|
| Product not found | 404 | "Product not found" |
| Unauthorized | 401/403 | Redirect/blocked |
| Invalid delta | — | NOT CONFIRMED (kemungkinan 400) |

---

## 23. Edge Cases

- Stok negatif: dicegah oleh `max(0, stock + delta)`.
- `outlet_stocks` belum ada untuk produk/outlet: auto-create saat sale/transfer pertama.
- Adjustment dengan delta=0: NOT CONFIRMED (kemungkinan dicatat tapi tidak ada perubahan).
- Concurrent adjustment: race condition possible — `UPDATE products.stock` tidak menggunakan row lock eksplisit.
- Produk dihapus: `outlet_stocks` CASCADE delete, `stock_movements` tetap ada (no FK).

---

## 24. Security

| Aspek | Status |
|-------|--------|
| Authentication | YA |
| Authorization | YA — `require_permission` untuk adjust |
| Outlet Enforcement | YA — `filter_outlets_for_user` untuk list |
| SQL Injection | Aman — parameterized |
| Race Condition | POTENTIAL FINDING — stock update tidak menggunakan row lock |

---

## 25. QA / Test Cases

```
TC-INV-001: Restock adjustment
Given: Produk dengan stok 10
When: Adjust delta=+5, reason=restock
Then: Stok = 15, movement dicatat

TC-INV-002: Damage adjustment
Given: Produk dengan stok 10
When: Adjust delta=-3, reason=damage
Then: Stok = 7, movement dicatat

TC-INV-003: Negative stock prevention
Given: Produk dengan stok 5
When: Adjust delta=-10
Then: Stok = 0 (max(0, 5-10)), movement dicatat dengan delta=-10

TC-INV-004: View movements
Given: Outlet dengan beberapa transaksi
When: GET /inventory/movements
Then: Semua movements terurut DESC

TC-INV-005: Unauthorized adjust
Given: Supervisor (no update permission)
When: POST /inventory/adjust
Then: 403 Forbidden
```

---

## 26. Current Implementation Status

```
STATUS: IMPLEMENTED
```

Stock view, adjustment, dan movement history berfungsi.

---

## 27. Bugs / Findings

| ID | Severity | Finding |
|----|----------|---------|
| INV-F-01 | MEDIUM | Stock update (`UPDATE products.stock`) tidak menggunakan row lock — race condition pada concurrent adjustment |
| INV-F-02 | MEDIUM | `adjust_stock` hanya update `products.stock` (global), tidak update `outlet_stocks` — stok per outlet tidak ter-update saat manual adjustment |
| INV-F-03 | LOW | Audit logging ke `audit_logs` table tidak terlihat untuk adjustment (hanya `stock_movements`) |

---

## 28. Gaps

| Gap | Keterangan |
|-----|------------|
| Stock opname | Tidak ada fitur stock opname/stocktake |
| Stock valuation | Tidak ada perhitungan nilai stok |
| Min/max stock | Tidak ada auto-reorder berdasarkan min/max |
| Expiry tracking | Tidak ada tracking expired date |
| Batch tracking | Tidak ada batch/lot tracking |

---

## 29. Dependency Map

```
Inventory
 ├── Products (master data)
 ├── Outlet Stocks (stok per outlet)
 ├── Stock Movements (history)
 ├── Sales (stock out)
 ├── Purchase Orders (stock in)
 ├── Transfers (stock out + stock in)
 ├── Reports (stock report)
 └── Dashboard (low stock alert)
```

---

## 30. End-to-End Flow

```
[PURCHASE ORDER]
 ↓
RECEIVE PO
 ↓
STOCK IN (outlet_stocks + products.stock)
 ↓
MOVEMENT: reason=restock, delta=+

[SALE (POS/DINE-IN)]
 ↓
CHECKOUT
 ↓
STOCK OUT (outlet_stocks + products.stock)
 ↓
MOVEMENT: reason=sale, delta=-

[TRANSFER]
 ↓
CREATE TRANSFER
 ↓
STOCK OUT SOURCE (outlet_stocks)
 ↓
MOVEMENT: reason=transfer_out, delta=-
 ↓
[APPROVE AT DESTINATION]
 ↓
STOCK IN DESTINATION (outlet_stocks)
 ↓
MOVEMENT: reason=transfer_in, delta=+

[MANUAL ADJUSTMENT]
 ↓
ADJUST STOCK
 ↓
STOCK UPDATE (products.stock)
 ↓
MOVEMENT: reason=adjustment/return/damage

[VIEW]
 ↓
GET /inventory/stock → stok per outlet
 ↓
GET /inventory/movements → history pergerakan
 ↓
GET /reports/stock → stock report
```
