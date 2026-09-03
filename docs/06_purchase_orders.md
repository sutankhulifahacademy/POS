# PURCHASE ORDERS (PO) — BUSINESS & TECHNICAL DOCUMENTATION

> Dokumentasi AS-IS berdasarkan audit source code.
> Source: `frontend/src/pages/PurchaseOrders.js`, `backend/routes/purchase_orders.py`, `backend/sql/postgres_schema.sql`

---

## 1. Module Overview

Menu Purchase Orders mengelola pembelian barang dari supplier ke outlet. PO dibuat dengan status `draft`, kemudian dapat diterima (`received`) yang menambah stok produk, atau ditolak (`cancelled`). PO adalah salah satu sumber utama stock-in selain transfer.

---

## 2. Business Purpose

Mencatat pembelian barang dari supplier, mengontrol penerimaan barang ke stok outlet, dan menyediakan data untuk pelacakan pengeluaran pembelian.

---

## 3. Business Objective

- Mencatat order pembelian dari supplier.
- Mengelola status PO (draft → received / cancelled).
- Menambah stok produk saat PO diterima.
- Menghubungkan supplier → produk → stok.

---

## 4. Actors / Roles

| Role | Akses | Keterangan |
|------|-------|------------|
| Owner | YA | Semua outlet |
| Admin | YA | Outlet yang di-assign |
| Manager | YA | Create + Approve (receive/reject) |
| Supervisor | TIDAK | NOT CONFIRMED |
| Kasir | TIDAK | Tidak ada menu PO |

Berdasarkan `seed_roles.sql`: manager memiliki `purchase_orders: view, create, approve`.

---

## 5. Outlet Scope

**Klasifikasi: OUTLET-SCOPED**

- `purchase_orders.outlet_id` menentukan outlet tujuan penerimaan.
- Frontend mengirim `outlet_id` via query/body.
- Backend memfilter berdasarkan `outlet_id` atau `filter_outlets_for_user`.
- Receive menggunakan PO's `outlet_id` atau main outlet.

Sumber: `backend/routes/purchase_orders.py` lines 10-91.

---

## 6. Role & Permission

| Aksi | Owner | Admin | Manager | Supervisor | Kasir |
|------|-------|-------|---------|------------|-------|
| View PO | YA | YA | YA | TIDAK | TIDAK |
| Create PO | YA | YA | YA | TIDAK | TIDAK |
| Receive PO | YA | YA | YA | TIDAK | TIDAK |
| Reject PO | YA | YA | YA | TIDAK | TIDAK |
| Delete PO | YA | YA | TIDAK | TIDAK | TIDAK |

Backend:
- `GET /api/purchase-orders` → `get_current_user`
- `POST /api/purchase-orders` → `require_permission("purchase_orders", "create")`
- `POST /api/purchase-orders/{id}/receive` → `require_permission("purchase_orders", "approve")`
- `DELETE /api/purchase-orders/{id}` → `require_permission("purchase_orders", "delete")`
- `POST /api/purchase-orders/{id}/reject` → `require_permission("purchase_orders", "approve")`

---

## 7. Business Flow

```
MANAGER BUKA MENU PURCHASE ORDER
 ↓
PILIH OUTLET
 ↓
LIHAT DAFTAR PO
 ↓
[CREATE PO]
 ↓
PILIH SUPPLIER
 ↓
TAMBAH ITEMS (produk, qty, cost)
 ↓
SIMPAN (status: draft)
 ↓
[RECEIVE PO]
 ↓
STOK PRODUK NAIK
 ↓
STOCK MOVEMENT DICATAT
 ↓
STATUS: received
 ↓
[ATAU REJECT PO]
 ↓
STATUS: cancelled
```

---

## 8. Detailed Business Rules

1. PO dibuat dengan status `draft`.
2. PO memiliki `po_no` unik (auto-generated).
3. `total = Σ (item.qty × item.cost)` dihitung saat create.
4. Items disimpan sebagai JSONB di `purchase_orders.items`.
5. Receive PO:
   - Menambah stok produk (`products.stock` dan `outlet_stocks`).
   - Mencatat `stock_movements` dengan reason `restock`.
   - Mengubah status menjadi `received`.
   - Set `received_at = now()`.
6. Reject PO: mengubah status menjadi `cancelled`.
7. Delete PO: hanya untuk PO dengan status `draft`.
8. Receive menggunakan PO's `outlet_id` atau main outlet.

---

## 9. State / Status

```
draft  →  received  (via receive)
draft  →  cancelled  (via reject)
draft  →  [deleted]  (via delete, only draft)
```

Sumber: `purchase_orders.status` default `'draft'`.

---

## 10. Technical Architecture

```
Browser
 ↓
React Component (PurchaseOrders.js)
 ↓
API Client (lib/api.js)
 ↓
FastAPI Endpoint (routes/purchase_orders.py)
 ↓
Auth (get_current_user / require_permission)
 ↓
Business Logic
 ↓
SQL Query (raw SQL)
 ↓
PostgreSQL (purchase_orders, products, outlet_stocks, stock_movements)
 ↓
Response
 ↓
UI Update
```

---

## 11. Technical Flow

### Create PO
1. `PurchaseOrders.js` → user pilih supplier, tambah items (produk, qty, cost).
2. `POST /api/purchase-orders` dengan `{ supplier_id, items, outlet_id, note }`.
3. Backend `create_po` (purchase_orders.py L45):
   - Generate `po_no`.
   - Calculate `total = Σ (qty × cost)`.
   - Insert `purchase_orders` dengan status `draft`.
4. Response → frontend reload.

### Receive PO
1. User klik "Receive" pada PO draft.
2. `POST /api/purchase-orders/{po_id}/receive?outlet_id={uuid}`.
3. Backend `receive_po` (purchase_orders.py L62):
   - Loop items: add stock to `products` + `outlet_stocks`.
   - Insert `stock_movements` (reason=`restock`, delta=+qty).
   - Update PO: `status='received'`, `received_at=now()`.
4. Response → frontend reload.

### Reject PO
1. User klik "Reject" pada PO draft.
2. `POST /api/purchase-orders/{po_id}/reject?outlet_id={uuid}`.
3. Backend `reject_po` (purchase_orders.py L91):
   - Update PO: `status='cancelled'`.

### Delete PO
1. User klik "Delete" pada PO draft.
2. `DELETE /api/purchase-orders/{po_id}?outlet_id={uuid}`.
3. Backend `delete_po` (purchase_orders.py L84):
   - Hanya jika status=`draft`.
   - Delete record.

---

## 12. Frontend

**File:** `frontend/src/pages/PurchaseOrders.js`

| Elemen | Detail |
|--------|--------|
| Context | `useOutlet()` — `outletIdForApi` (line 9) |
| API Calls | `GET /purchase-orders`, `GET /suppliers`, `GET /products`, `POST /purchase-orders`, `POST /purchase-orders/:id/receive`, `POST /purchase-orders/:id/reject`, `DELETE /purchase-orders/:id` |
| State | `orders`, `suppliers`, `products`, `showForm`, `supplierId`, `items`, `note`, `detail` |
| UI | PO table, create modal with dynamic item lines (product, qty, cost), detail modal, receive/reject/delete actions |

---

## 13. Backend

**File:** `backend/routes/purchase_orders.py`

| Endpoint | Method | Function | Line | Auth |
|----------|--------|----------|------|------|
| `/api/purchase-orders` | GET | `list_pos` | L10 | `get_current_user` |
| `/api/purchase-orders` | POST | `create_po` | L45 | `require_permission("purchase_orders", "create")` |
| `/api/purchase-orders/{po_id}/receive` | POST | `receive_po` | L62 | `require_permission("purchase_orders", "approve")` |
| `/api/purchase-orders/{po_id}` | DELETE | `delete_po` | L84 | `require_permission("purchase_orders", "delete")` |
| `/api/purchase-orders/{po_id}/reject` | POST | `reject_po` | L91 | `require_permission("purchase_orders", "approve")` |

---

## 14. API

```
GET /api/purchase-orders?outlet_id={uuid}
POST /api/purchase-orders { supplier_id, items, outlet_id, note }
POST /api/purchase-orders/{id}/receive?outlet_id={uuid}
POST /api/purchase-orders/{id}/reject?outlet_id={uuid}
DELETE /api/purchase-orders/{id}?outlet_id={uuid}
```

---

## 15. Database

### Table: `purchase_orders`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `po_no` | varchar(50) | — | UNIQUE, NOT NULL |
| `supplier_id` | uuid | — | |
| `supplier_name` | varchar(255) | — | |
| `items` | jsonb | — | NOT NULL — array of {product_id, product_name, qty, cost} |
| `total` | numeric(14,2) | — | Σ (qty × cost) |
| `status` | varchar(20) | `'draft'` | draft / received / cancelled |
| `note` | text | — | |
| `created_by` | uuid | — | |
| `outlet_id` | uuid | — | |
| `created_at` | timestamptz | `now()` | |
| `received_at` | timestamptz | — | |

**Index:** `idx_purchase_orders_outlet` (`outlet_id`, `created_at` DESC)

**Relationship:**
```
suppliers (1) ─── (many) purchase_orders  (via supplier_id, no FK constraint)
outlets (1) ─── (many) purchase_orders  (via outlet_id, no FK constraint)
```

---

## 16. Data Flow

```
USER INPUT (supplier, items, outlet)
 ↓
FRONTEND STATE
 ↓
API: POST /purchase-orders
 ↓
BACKEND: create_po()
 ↓
CALCULATE total = Σ(qty × cost)
 ↓
GENERATE po_no
 ↓
INSERT purchase_orders (status=draft)
 ↓
[USER RECEIVE]
 ↓
API: POST /purchase-orders/{id}/receive
 ↓
LOOP ITEMS:
 ↓
UPDATE products.stock (+qty)
 ↓
UPDATE/INSERT outlet_stocks (+qty)
 ↓
INSERT stock_movements (reason=restock)
 ↓
UPDATE purchase_orders SET status=received, received_at=now()
 ↓
RESPONSE
```

---

## 17. Validation

- `po_no` unik (DB constraint).
- `items` NOT NULL (JSONB array).
- Receive: hanya PO dengan status `draft` yang bisa diterima (NOT CONFIRMED — kemungkinan tidak ada explicit check).
- Delete: hanya PO dengan status `draft` yang bisa dihapus.

---

## 18. Calculation

### PO Total
```
total = Σ (item.qty × item.cost)
```

### Stock Impact (Receive)
```
products.stock += item.qty
outlet_stocks.quantity += item.qty
stock_movements.delta = +item.qty
```

---

## 19. Audit Log

| Action | Entity | Dicatat? |
|--------|--------|----------|
| Create PO | `purchase_order` | NOT CONFIRMED FROM SOURCE |
| Receive PO | `purchase_order` | NOT CONFIRMED (stock_movement dicatat) |
| Reject PO | `purchase_order` | NOT CONFIRMED FROM SOURCE |
| Delete PO | `purchase_order` | NOT CONFIRMED FROM SOURCE |

> `stock_movements` berfungsi sebagai audit trail untuk stock changes. Audit logging ke `audit_logs` table tidak terlihat eksplisit.

---

## 20. Reports

- PO data masuk ke: Stock Report (movements dengan reason=restock), P&L (pembelian sebagai expense/COGS component).
- Tidak ada report PO tersendiri di menu Reports.

---

## 21. Integration / Dependency

| Dependency | Keterangan |
|------------|------------|
| Suppliers | Supplier sumber barang |
| Products | Produk yang dibeli |
| Outlet Stocks | Stok per outlet (updated saat receive) |
| Stock Movements | Audit trail stock-in |
| Inventory | Stok view |
| Reports | Stock report, P&L |

---

## 22. Error Handling

| Kondisi | HTTP | Behavior |
|---------|------|----------|
| PO not found | 404 | "PO not found" |
| Delete non-draft PO | 400 | "Only draft PO can be deleted" |
| Unauthorized | 401/403 | Redirect/blocked |

---

## 23. Edge Cases

- Receive PO dengan items yang produknya sudah dihapus → NOT CONFIRMED (kemungkinan error).
- Double receive → NOT CONFIRMED (kemungkinan tidak ada check status).
- PO tanpa supplier → `supplier_id` nullable, kemungkinan diperbolehkan.
- Items kosong → `items` NOT NULL, kemungkinan error jika empty array.

---

## 24. Security

| Aspek | Status |
|-------|--------|
| Authentication | YA |
| Authorization | YA — `require_permission` |
| Outlet Enforcement | YA — `filter_outlets_for_user` |
| SQL Injection | Aman — parameterized |
| Double Receive | POTENTIAL FINDING — tidak ada explicit check |

---

## 25. QA / Test Cases

```
TC-PO-001: Create PO draft
Given: Manager dengan permission create
When: Create PO dengan supplier + 3 items
Then: PO created, status=draft, total calculated

TC-PO-002: Receive PO
Given: PO dengan status draft
When: Receive PO
Then: Stock naik, movements dicatat, status=received

TC-PO-003: Reject PO
Given: PO dengan status draft
When: Reject PO
Then: Status=cancelled, no stock change

TC-PO-004: Delete non-draft PO
Given: PO dengan status received
When: Delete PO
Then: Error 400

TC-PO-005: PO outlet scope
Given: Manager outlet A
When: View PO outlet B
Then: 403 Forbidden
```

---

## 26. Current Implementation Status

```
STATUS: IMPLEMENTED
```

CRUD PO, receive, reject, dan stock impact berfungsi.

---

## 27. Bugs / Findings

| ID | Severity | Finding |
|----|----------|---------|
| PO-F-01 | MEDIUM | Tidak ada explicit check untuk mencegah double receive (receive PO yang sudah `received`) |
| PO-F-02 | LOW | Audit logging ke `audit_logs` tidak terlihat eksplisit |
| PO-F-03 | LOW | Tidak ada approval flow — langsung draft → received tanpa intermediate approval |

---

## 28. Gaps

| Gap | Keterangan |
|-----|------------|
| PO approval | Tidak ada flow approval sebelum receive |
| Partial receive | Tidak ada penerimaan parsial |
| Invoice matching | Tidak ada matching dengan invoice supplier |
| Payment tracking | Tidak ada tracking pembayaran ke supplier |

---

## 29. Dependency Map

```
Purchase Orders
 ├── Suppliers (sumber barang)
 ├── Products (produk dibeli)
 ├── Outlet Stocks (stok update saat receive)
 ├── Stock Movements (audit trail)
 ├── Inventory (stok view)
 └── Reports (stock report, P&L)
```

---

## 30. End-to-End Flow

```
MANAGER BUKA MENU PURCHASE ORDER
 ↓
PILIH OUTLET
 ↓
CREATE PO (supplier + items + qty + cost)
 ↓
POST /purchase-orders → status=draft
 ↓
[REVIEW PO]
 ↓
[RECEIVE]
 ↓
POST /purchase-orders/{id}/receive
 ↓
STOCK IN: products.stock + outlet_stocks
 ↓
MOVEMENT: reason=restock, delta=+
 ↓
STATUS: received, received_at=now()
 ↓
DATA MASUK: Stock Report, P&L, Inventory
 ↓
[ATAU REJECT]
 ↓
STATUS: cancelled
```
