# TRANSFERS (TRANSFER STOK) — BUSINESS & TECHNICAL DOCUMENTATION

> Dokumentasi AS-IS berdasarkan audit source code.
> Source: `frontend/src/pages/Transfers.js`, `frontend/src/pages/StockRequests.js`, `backend/routes/stock_transfers.py`, `backend/routes/stock_requests.py`, `backend/routes/delivery_notes.py`, `frontend/src/components/SuratJalan.js`, `backend/sql/postgres_schema.sql`

---

## 1. Module Overview

Menu Transfers mengelola transfer stok antar outlet dengan flow lengkap: Stock Request → Approval → Convert to Transfer → Surat Jalan (Delivery Note) → Print → Ship → Receive → Item-level Check → Approve/Reject per item. Sistem mendukung item-level approval, delivery note printing, dan audit trail lengkap.

---

## 2. Business Purpose

Memindahkan stok antar outlet secara terkontrol dan terlacak, memastikan pengiriman sesuai dengan permintaan, dan menyediakan dokumentasi pengiriman (Surat Jalan).

---

## 3. Business Objective

- Memfasilitasi permintaan stok dari outlet ke pusat.
- Mengontrol transfer stok antar outlet.
- Melacak pengiriman via Surat Jalan/Delivery Note.
- Memastikan penerimaan sesuai dengan item yang dikirim.
- Mencatat audit trail untuk semua pergerakan stok.

---

## 4. Actors / Roles

| Role | Akses | Keterangan |
|------|-------|------------|
| Owner | YA | Semua outlet, semua aksi |
| Admin | YA | Outlet yang di-assign |
| Manager | YA | Create transfer, check, approve/reject items, ship |
| Supervisor | YA | Ship (NOT CONFIRMED untuk check/approve) |
| Kasir | TIDAK | Tidak ada menu Transfers |

Berdasarkan `seed_roles.sql`: manager memiliki `transfers: view, create` dan `stock_requests: view, create, approve`.

---

## 5. Outlet Scope

**Klasifikasi: OUTLET-SCOPED (from_outlet_id & to_outlet_id)**

- `stock_transfers` memiliki `from_outlet_id` dan `to_outlet_id`.
- `stock_requests` memiliki `requesting_outlet_id`.
- List difilter berdasarkan outlet membership (from atau to).
- Pending tasks: hanya untuk destination outlet.
- Item check/approve: hanya untuk user di destination outlet.
- Ship: hanya untuk user di source outlet.

Sumber: `backend/routes/stock_transfers.py` lines 11-425.

---

## 6. Role & Permission

| Aksi | Owner | Admin | Manager | Supervisor | Kasir |
|------|-------|-------|---------|------------|-------|
| View Transfers | YA | YA | YA | YA | TIDAK |
| Create Transfer | YA | YA | YA | TIDAK | TIDAK |
| Check Item | YA | YA | YA | TIDAK | TIDAK |
| Approve Item | YA | YA | YA | TIDAK | TIDAK |
| Reject Item | YA | YA | YA | TIDAK | TIDAK |
| Ship Transfer | YA | YA | YA | YA | TIDAK |
| View Stock Requests | YA | YA | YA | TIDAK | TIDAK |
| Create Stock Request | YA | YA | YA | TIDAK | TIDAK |
| Approve Stock Request | YA | YA | YA | TIDAK | TIDAK |
| Convert to Transfer | YA | YA | YA | TIDAK | TIDAK |
| Print Delivery Note | YA | YA | YA | YA | TIDAK |

Backend:
- Create transfer: `require_permission("transfers", "create")`
- Check item: `require_role("owner", "manager")`
- Approve/reject item: `require_role("owner", "manager")`
- Ship: `require_role("owner", "manager", "admin", "supervisor")`
- Stock request create: `require_permission("stock_requests", "create")`
- Stock request approve: `require_permission("stock_requests", "approve")`
- Convert to transfer: `require_permission("stock_transfers", "create")`

---

## 7. Business Flow

### Stock Request Flow
```
OUTLET REQUESTING
 ↓
CREATE STOCK REQUEST (produk + qty)
 ↓
SUBMIT (status: submitted)
 ↓
ALERT KE PUSAT
 ↓
PUSAT REVIEW
 ↓
APPROVE/REJECT PER ITEM (qty_approved)
 ↓
[APPROVED]
 ↓
CONVERT TO TRANSFER
 ↓
TRANSFER DIBUAT + DELIVERY NOTE
 ↓
STOCK DEDUCTED FROM PUSAT
```

### Transfer Flow
```
SOURCE OUTLET
 ↓
CREATE TRANSFER (items + qty)
 ↓
STOCK DEDUCTED FROM SOURCE
 ↓
TRANSFER_ITEMS: status=pending
 ↓
DELIVERY NOTE AUTO-GENERATED
 ↓
ALERT KE DESTINATION
 ↓
[PRINT SURAT JALAN]
 ↓
[SHIP]
 ↓
STATUS: shipped
 ↓
DESTINATION OUTLET
 ↓
PENDING TASKS
 ↓
CHECK EACH ITEM (qty_received)
 ↓
MATCH / DIFFERENT
 ↓
[APPROVE ITEM]
 ↓
STOCK ADDED TO DESTINATION
 ↓
MOVEMENT: transfer_in
 ↓
[REJECT ITEM]
 ↓
NO STOCK CHANGE
 ↓
ALL ITEMS PROCESSED
 ↓
TRANSFER STATUS: completed/partially_completed
```

---

## 8. Detailed Business Rules

1. Stock request dibuat oleh outlet requesting, status `draft` atau `submitted`.
2. Submit request: status → `submitted`, alert ke pusat.
3. Approval per item: set `qty_approved`, item status → `approved`/`rejected`.
4. Request status: `draft` → `submitted` → `approved`/`partially_approved`/`rejected`.
5. Convert to transfer: source = main/pusat, destination = requesting outlet.
6. Transfer create: deduct source stock, create `transfer_items` (status=pending), auto-generate delivery note.
7. Delivery note: `delivery_no` unik, status `generated`.
8. Print delivery note: increment `print_count`, status → `printed`.
9. Ship: update transfer + delivery note status → `shipped`, log `TRANSFER_SENT`.
10. Check item (destination): set `qty_received`, check match.
11. Approve item: add stock to destination, log `transfer_in`, update transfer status.
12. Reject item: no stock change, update transfer status.
13. Transfer status: `completed` (all approved) / `partially_completed` (some rejected) / `pending` (still processing).

---

## 9. State / Status

### Stock Request
```
draft  →  submitted  →  approved
                    →  partially_approved
                    →  rejected
```

### Transfer
```
pending  →  partially_processed  →  completed
                              →  partially_completed
shipped  (intermediate status)
```

### Transfer Item
```
pending  →  approved  (stock added to destination)
        →  rejected  (no stock change)
```

### Delivery Note
```
generated  →  printed  →  shipped  →  received
```

---

## 10. Technical Architecture

```
Browser
 ↓
React (Transfers.js, StockRequests.js, SuratJalan.js)
 ↓
API Client (lib/api.js)
 ↓
FastAPI (stock_transfers.py, stock_requests.py, delivery_notes.py)
 ↓
Auth (get_current_user / require_permission / require_role)
 ↓
Business Logic
 ↓
SQL Transaction
 ↓
PostgreSQL (stock_transfers, transfer_items, stock_requests, stock_request_items, delivery_notes, outlet_stocks, stock_movements)
 ↓
Response
 ↓
UI Update
```

---

## 11. Technical Flow

### Create Transfer
1. `Transfers.js` → user pilih source/destination outlet, tambah items.
2. `POST /api/stock-transfers` dengan `{ from_outlet_id, to_outlet_id, items, note }`.
3. Backend `create_transfer` (stock_transfers.py L125):
   - Deduct source `outlet_stocks`.
   - Insert `stock_transfers` dengan status `completed` (default) atau `pending`.
   - Insert `transfer_items` dengan status `pending`.
   - Auto-generate `delivery_notes`.
   - Alert ke destination outlet.

### Check Item
1. `PUT /api/stock-transfers/items/{item_id}/check` dengan `{ qty_received }`.
2. Backend `check_transfer_item` (L204):
   - Set `qty_received`, `checked_by`, `checked_at`.
   - Compare `qty_received` vs `qty_sent` → match/different.

### Approve Item
1. `POST /api/stock-transfers/items/{item_id}/approve`.
2. Backend `approve_transfer_item` (L240):
   - Add stock to destination `outlet_stocks`.
   - Insert `stock_movements` (reason=`transfer_in`, delta=+qty_received).
   - Set item status `approved`, `approved_by`, `approved_at`.
   - Update parent transfer status.

### Reject Item
1. `POST /api/stock-transfers/items/{item_id}/reject`.
2. Backend `reject_transfer_item` (L298):
   - No stock change.
   - Set item status `rejected`.
   - Update parent transfer status.

### Ship Transfer
1. `POST /api/stock-transfers/{transfer_id}/ship`.
2. Backend `ship_transfer` (L425):
   - Update transfer + delivery note status → `shipped`.
   - Log `TRANSFER_SENT` audit.

### Stock Request Flow
1. `StockRequests.js` → user create request dengan items.
2. `POST /api/stock-requests` → status `draft` atau `submitted`.
3. Submit: `PUT /api/stock-requests/{id}/submit` → status `submitted`.
4. Approve: `POST /api/stock-requests/{id}/approve` → per-item `qty_approved`.
5. Convert: `POST /api/stock-requests/{id}/convert-to-transfer` → creates transfer + delivery note.

### Delivery Note
1. `SuratJalan.js` → `GET /api/delivery-notes/{id}` atau `GET /api/delivery-notes/by-transfer/{transfer_id}`.
2. Print: `POST /api/delivery-notes/{id}/print` → increment `print_count`.
3. Ship: `POST /api/delivery-notes/{id}/ship` → update status.

---

## 12. Frontend

**File:** `frontend/src/pages/Transfers.js`

| Elemen | Detail |
|--------|--------|
| Context | `useOutlet()` (`outlets`, `outletIdForApi`), `useAuth()` (`user`) — lines 29-30 |
| API Calls | `GET /stock-transfers`, `GET /products`, `GET /stock-transfers/pending`, `POST /stock-transfers`, `GET /stock-transfers/:id`, `PUT /stock-transfers/items/:id/check`, `POST /stock-transfers/items/:id/approve`, `POST /stock-transfers/items/:id/reject`, `POST /stock-transfers/:id/ship` |
| State | `transfers`, `pending`, `products`, `form`, `detail`, `qtyReceived`, `note` |
| UI | Transfer list + pending tab, create modal (source/dest outlet, item lines), detail modal with per-item check/approve/reject/ship, SuratJalan modal |

**File:** `frontend/src/pages/StockRequests.js`

| Elemen | Detail |
|--------|--------|
| Context | `useOutlet()`, `useAuth()` — lines 28-29 |
| API Calls | `GET /stock-requests`, `GET /products`, `POST /stock-requests`, `GET /stock-requests/:id`, `POST /stock-requests/:id/approve`, `POST /stock-requests/:id/reject`, `POST /stock-requests/:id/convert-to-transfer` |
| State | `requests`, `products`, `showForm`, `detail`, `itemLines`, `priority`, `note` |
| UI | Request list with status badges, creation form, detail/approval modal, convert-to-transfer (renders SuratJalan) |

**File:** `frontend/src/components/SuratJalan.js`

| Elemen | Detail |
|--------|--------|
| API | `GET /delivery-notes/:id` or `GET /delivery-notes/by-transfer/:transferId`, `POST .../print`, `POST .../ship` |
| UI | Delivery note display + browser print |

---

## 13. Backend

**File:** `backend/routes/stock_transfers.py`

| Endpoint | Method | Function | Line | Auth |
|----------|--------|----------|------|------|
| `/api/stock-transfers` | GET | `list_transfers` | L11 | `get_current_user` |
| `/api/stock-transfers/pending` | GET | `list_pending_transfers` | L57 | `get_current_user` |
| `/api/stock-transfers/{id}` | GET | `get_transfer_detail` | L99 | `get_current_user` |
| `/api/stock-transfers` | POST | `create_transfer` | L125 | `require_permission("transfers", "create")` |
| `/api/stock-transfers/items/{item_id}/check` | PUT | `check_transfer_item` | L204 | `require_role("owner","manager")` |
| `/api/stock-transfers/items/{item_id}/approve` | POST | `approve_transfer_item` | L240 | `require_role("owner","manager")` |
| `/api/stock-transfers/items/{item_id}/reject` | POST | `reject_transfer_item` | L298 | `require_role("owner","manager")` |
| `/api/reports/transfers` | GET | `transfer_report` | L363 | `require_role("owner","admin","manager","supervisor")` |
| `/api/stock-transfers/{id}/ship` | POST | `ship_transfer` | L425 | `require_role("owner","manager","admin","supervisor")` |

**File:** `backend/routes/stock_requests.py`

| Endpoint | Method | Function | Line | Auth |
|----------|--------|----------|------|------|
| `/api/stock-requests` | GET | `list_stock_requests` | L12 | `get_current_user` |
| `/api/stock-requests/{id}` | GET | `get_stock_request` | L53 | `get_current_user` |
| `/api/stock-requests` | POST | `create_stock_request` | L80 | `require_permission("stock_requests", "create")` |
| `/api/stock-requests/{id}/submit` | PUT | `submit_stock_request` | L140 | `require_permission("stock_requests", "create")` |
| `/api/stock-requests/{id}/approve` | POST | `approve_stock_request` | L164 | `require_permission("stock_requests", "approve")` |
| `/api/stock-requests/{id}/reject` | POST | `reject_stock_request` | L235 | `require_permission("stock_requests", "approve")` |
| `/api/stock-requests/{id}/convert-to-transfer` | POST | `convert_request_to_transfer` | L263 | `require_permission("stock_transfers", "create")` |

**File:** `backend/routes/delivery_notes.py`

| Endpoint | Method | Function | Line | Auth |
|----------|--------|----------|------|------|
| `/api/delivery-notes` | GET | `list_delivery_notes` | L10 | `get_current_user` |
| `/api/delivery-notes/{id}` | GET | `get_delivery_note` | L53 | `get_current_user` |
| `/api/delivery-notes/by-transfer/{transfer_id}` | GET | `get_delivery_note_by_transfer` | L94 | `get_current_user` |
| `/api/delivery-notes/{id}/print` | POST | `print_delivery_note` | L103 | `get_current_user` |
| `/api/delivery-notes/{id}/ship` | POST | `ship_delivery_note` | L138 | `require_role("owner","manager","admin","supervisor")` |

---

## 14. API

```
GET /api/stock-transfers?outlet_id={uuid}
GET /api/stock-transfers/pending?outlet_id={uuid}
GET /api/stock-transfers/{id}
POST /api/stock-transfers { from_outlet_id, to_outlet_id, items, note }
PUT /api/stock-transfers/items/{item_id}/check { qty_received }
POST /api/stock-transfers/items/{item_id}/approve
POST /api/stock-transfers/items/{item_id}/reject
POST /api/stock-transfers/{id}/ship
GET /api/reports/transfers?outlet_id={uuid}

GET /api/stock-requests?outlet_id={uuid}
POST /api/stock-requests { requesting_outlet_id, items, priority, note }
PUT /api/stock-requests/{id}/submit
POST /api/stock-requests/{id}/approve { items: [{item_id, qty_approved}] }
POST /api/stock-requests/{id}/reject
POST /api/stock-requests/{id}/convert-to-transfer

GET /api/delivery-notes?outlet_id={uuid}
GET /api/delivery-notes/{id}
GET /api/delivery-notes/by-transfer/{transfer_id}
POST /api/delivery-notes/{id}/print
POST /api/delivery-notes/{id}/ship
```

---

## 15. Database

### Table: `stock_transfers`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `transfer_no` | varchar(50) | — | UNIQUE, NOT NULL |
| `from_outlet_id` | uuid | — | Source outlet |
| `to_outlet_id` | uuid | — | Destination outlet |
| `from_outlet_name` | varchar(255) | — | |
| `to_outlet_name` | varchar(255) | — | |
| `items` | jsonb | — | NOT NULL — snapshot |
| `total_quantity` | integer | — | |
| `note` | text | — | |
| `status` | varchar(20) | `'completed'` | completed/pending/partially_completed/shipped |
| `created_by` | uuid | — | |
| `created_by_name` | varchar(255) | — | |
| `created_at` | timestamptz | `now()` | |
| `updated_at` | timestamptz | `now()` | |
| `completed_at` | timestamptz | — | |
| `request_id` | uuid | — | Link to stock_request |
| `delivery_note_id` | uuid | — | Link to delivery_note |
| `shipped_by` | uuid | — | |
| `shipped_by_name` | varchar(255) | — | |
| `shipped_at` | timestamptz | — | |

### Table: `transfer_items`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `transfer_id` | uuid FK | — | → `stock_transfers(id)` CASCADE |
| `product_id` | uuid | — | NOT NULL |
| `product_name` | varchar(255) | — | NOT NULL |
| `qty_sent` | int | 0 | NOT NULL |
| `qty_received` | int | — | Set saat check |
| `status` | varchar(20) | `'pending'` | pending/approved/rejected |
| `note` | text | `''` | |
| `checked_by` | uuid | — | |
| `checked_by_name` | varchar(255) | — | |
| `checked_at` | timestamptz | — | |
| `approved_by` | uuid | — | |
| `approved_by_name` | varchar(255) | — | |
| `approved_at` | timestamptz | — | |

**Indexes:** `idx_transfer_items_transfer_id`, `idx_transfer_items_status`

### Table: `stock_requests`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `request_no` | varchar(50) | — | UNIQUE, NOT NULL |
| `requesting_outlet_id` | uuid | — | NOT NULL |
| `requesting_outlet_name` | varchar(255) | — | |
| `status` | varchar(30) | `'draft'` | draft/submitted/approved/partially_approved/rejected/converted |
| `priority` | varchar(20) | `'normal'` | normal/urgent |
| `note` | text | `''` | |
| `created_by` | uuid | — | |
| `created_by_name` | varchar(255) | — | |
| `submitted_at` | timestamptz | — | |
| `reviewed_by` | uuid | — | |
| `reviewed_by_name` | varchar(255) | — | |
| `reviewed_at` | timestamptz | — | |
| `review_note` | text | `''` | |
| `converted_transfer_id` | uuid | — | Link to transfer |
| `converted_at` | timestamptz | — | |

**Indexes:** `idx_stock_requests_outlet`, `idx_stock_requests_status`

### Table: `stock_request_items`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `request_id` | uuid FK | — | → `stock_requests(id)` CASCADE |
| `product_id` | uuid | — | NOT NULL |
| `product_name` | varchar(255) | — | NOT NULL |
| `sku` | varchar(100) | — | |
| `qty_requested` | int | 0 | NOT NULL |
| `qty_approved` | int | — | Set saat approve |
| `stock_at_center` | int | — | Info stok pusat |
| `status` | varchar(20) | `'pending'` | pending/approved/rejected |
| `note` | text | `''` | |

**Index:** `idx_stock_request_items_request`

### Table: `delivery_notes`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `delivery_no` | varchar(50) | — | UNIQUE, NOT NULL |
| `transfer_id` | uuid FK | — | → `stock_transfers(id)` CASCADE |
| `request_id` | uuid | — | Link to request |
| `status` | varchar(20) | `'generated'` | generated/printed/shipped/received |
| `generated_by` | uuid | — | |
| `generated_by_name` | varchar(255) | — | |
| `generated_at` | timestamptz | `now()` | |
| `printed_by` | uuid | — | |
| `printed_by_name` | varchar(255) | — | |
| `printed_at` | timestamptz | — | |
| `print_count` | int | 0 | NOT NULL |
| `shipped_by` | uuid | — | |
| `shipped_by_name` | varchar(255) | — | |
| `shipped_at` | timestamptz | — | |
| `received_at` | timestamptz | — | |
| `note` | text | `''` | |

**Indexes:** `idx_delivery_notes_transfer`, `idx_delivery_notes_request`, `idx_delivery_notes_no`

**Relationship:**
```
stock_requests (1) ─── (0..1) stock_transfers (via converted_transfer_id)
stock_transfers (1) ─── (many) transfer_items
stock_transfers (1) ─── (0..1) delivery_notes
stock_requests (1) ─── (many) stock_request_items
outlets (1) ─── (many) stock_transfers (from/to)
```

---

## 16. Data Flow

```
[STOCK REQUEST]
 ↓
CREATE REQUEST (outlet requesting → pusat)
 ↓
SUBMIT → alert ke pusat
 ↓
PUSAT APPROVE/REJECT PER ITEM
 ↓
CONVERT TO TRANSFER
 ↓
[TRANSFER]
 ↓
CREATE TRANSFER (source → destination)
 ↓
DEDUCT source outlet_stocks
 ↓
CREATE transfer_items (pending)
 ↓
AUTO-GENERATE delivery_note
 ↓
[PRINT SURAT JALAN]
 ↓
print_count++
 ↓
[SHIP]
 ↓
transfer + delivery_note → shipped
 ↓
[DESTINATION: PENDING TASKS]
 ↓
CHECK ITEM (qty_received)
 ↓
match/different?
 ↓
[APPROVE] → add destination stock + movement (transfer_in)
[REJECT] → no stock change
 ↓
ALL ITEMS PROCESSED
 ↓
TRANSFER STATUS: completed/partially_completed
 ↓
DATA MASUK: Transfer Report, Stock Movements
```

---

## 17. Validation

- Source ≠ destination outlet.
- Stock source cukup untuk transfer.
- `qty_sent` > 0.
- Check: `qty_received` >= 0.
- Approve: item must be checked first.
- Outlet access: user must be in destination outlet for check/approve, source outlet for ship.

---

## 18. Calculation

### Transfer Quantity
```
total_quantity = Σ (item.qty_sent)
```

### Stock Impact
```
Source: outlet_stocks.quantity -= qty_sent (saat create)
Destination: outlet_stocks.quantity += qty_received (saat approve item)
```

### Stock Movements
```
Create: reason=transfer_out, delta=-qty_sent (source outlet)
Approve: reason=transfer_in, delta=+qty_received (destination outlet)
```

---

## 19. Audit Log

| Action | Entity | Dicatat? |
|--------|--------|----------|
| Create Transfer | `stock_transfer` | NOT CONFIRMED — `stock_movements` dicatat |
| Check Item | `transfer_item` | NOT CONFIRMED |
| Approve Item | `transfer_item` | NOT CONFIRMED — `stock_movements` dicatat |
| Reject Item | `transfer_item` | NOT CONFIRMED |
| Ship Transfer | `stock_transfer` | YA — `TRANSFER_SENT` log |
| Print Delivery Note | `delivery_note` | YA — audit log |
| Create Stock Request | `stock_request` | NOT CONFIRMED — alert dibuat |
| Submit Request | `stock_request` | NOT CONFIRMED — alert dibuat |
| Approve Request | `stock_request` | NOT CONFIRMED |
| Convert to Transfer | `stock_request` | NOT CONFIRMED |

---

## 20. Reports

- Transfer Report (`GET /api/reports/transfers`): item-level report with delivery note and request refs.
- Stock Movements: `transfer_in` dan `transfer_out` di `stock_movements`.
- Stock Report: movements dengan reason transfer.

---

## 21. Integration / Dependency

| Dependency | Keterangan |
|------------|------------|
| Outlets | from_outlet_id, to_outlet_id |
| Products | Item produk yang ditransfer |
| Outlet Stocks | Stock source & destination |
| Stock Movements | Audit trail |
| Delivery Notes | Surat Jalan |
| Alerts | Notifikasi ke destination |
| Reports | Transfer report, stock report |
| Inventory | Stock view |

---

## 22. Error Handling

| Kondisi | HTTP | Behavior |
|---------|------|----------|
| Source = destination | 400 | Error |
| Stock insufficient | 400 | "Stok tidak cukup" |
| Item not found | 404 | "Transfer item not found" |
| Wrong outlet (check/approve) | 403 | "Forbidden" |
| Wrong outlet (ship) | 403 | "Forbidden" |

---

## 23. Edge Cases

- Partial approval: beberapa item approved, beberapa rejected → transfer status `partially_completed`.
- Qty received < qty sent → item approved dengan qty received (bukan qty sent).
- Qty received > qty sent → NOT CONFIRMED (kemungkinan diperbolehkan).
- Double approve → NOT CONFIRMED (kemungkinan dicegah oleh status check).
- Transfer tanpa delivery note → auto-generated saat create.
- Stock request tanpa convert → tetap di status `approved`.
- Concurrent check pada item sama → NOT CONFIRMED (race condition possible).

---

## 24. Security

| Aspek | Status |
|-------|--------|
| Authentication | YA |
| Authorization | YA — `require_permission` + `require_role` |
| Outlet Enforcement | YA — source/destination membership check |
| SQL Injection | Aman — parameterized |
| Item-level Access | YA — destination outlet untuk check/approve, source untuk ship |

---

## 25. QA / Test Cases

```
TC-TRF-001: Create transfer
Given: Manager outlet A (source), outlet B (destination)
When: Create transfer 3 items
Then: Transfer created, source stock deducted, delivery note generated

TC-TRF-002: Check item
Given: Transfer dengan 3 pending items, user di destination outlet
When: Check item 1, qty_received=10
Then: qty_received set, match/different checked

TC-TRF-003: Approve item
Given: Checked item
When: Approve item
Then: Destination stock += qty_received, movement dicatat

TC-TRF-004: Reject item
Given: Checked item
When: Reject item
Then: No stock change, item status=rejected

TC-TRF-005: Ship transfer
Given: Transfer created, user di source outlet
When: Ship transfer
Then: Transfer + delivery note status=shipped

TC-TRF-006: Print surat jalan
Given: Delivery note exists
When: Print
Then: print_count++, status=printed

TC-TRF-007: Stock request flow
Given: Outlet B create request 5 items
When: Submit → pusat approve 4 items → convert to transfer
Then: Transfer created with 4 approved items

TC-TRF-008: Wrong outlet check
Given: User di outlet A, transfer to outlet B
When: User outlet A check item
Then: 403 Forbidden
```

---

## 26. Current Implementation Status

```
STATUS: IMPLEMENTED
```

Stock request, transfer, item-level check/approve/reject, delivery note, surat jalan print, ship — semua berfungsi.

---

## 27. Bugs / Findings

| ID | Severity | Finding |
|----|----------|---------|
| TRF-F-01 | MEDIUM | Stock deduction saat create transfer tidak menggunakan row lock — race condition possible |
| TRF-F-02 | LOW | Audit logging ke `audit_logs` untuk check/approve/reject tidak terlihat eksplisit (hanya stock_movements) |
| TRF-F-03 | LOW | Transfer default status `completed` di schema, tapi logic menggunakan `pending` — inconsistency |

---

## 28. Gaps

| Gap | Keterangan |
|-----|------------|
| Return transfer | Tidak ada fitur return transfer (barang dikembalikan) |
| Transfer cancellation | Tidak ada cancel transfer setelah create |
| Partial ship | Tidak ada partial shipment |
| Transfer schedule | Tidak ada scheduling transfer |

---

## 29. Dependency Map

```
Transfers
 ├── Stock Requests (request → approval → convert)
 ├── Outlets (from/to)
 ├── Products (items)
 ├── Outlet Stocks (source deduct, destination add)
 ├── Stock Movements (transfer_in/out)
 ├── Delivery Notes (Surat Jalan)
 ├── Alerts (notification)
 ├── Reports (transfer report, stock report)
 └── Inventory (stock view)
```

---

## 30. End-to-End Flow

```
[STOCK REQUEST FLOW]
 ↓
OUTLET B CREATE REQUEST (5 items)
 ↓
SUBMIT → ALERT KE PUSAT
 ↓
PUSAT REVIEW + APPROVE/REJECT PER ITEM
 ↓
CONVERT TO TRANSFER
 ↓
[TRANSFER FLOW]
 ↓
CREATE TRANSFER (pusat → outlet B)
 ↓
DEDUCT pusat outlet_stocks
 ↓
CREATE transfer_items (pending)
 ↓
AUTO-GENERATE delivery_note
 ↓
PRINT SURAT JALAN
 ↓
SHIP (transfer + delivery_note → shipped)
 ↓
[OUTLET B: PENDING TASKS]
 ↓
CHECK EACH ITEM (qty_received)
 ↓
APPROVE → stock in + movement (transfer_in)
REJECT → no stock change
 ↓
ALL ITEMS PROCESSED
 ↓
TRANSFER: completed/partially_completed
 ↓
DATA MASUK: Transfer Report, Stock Movements, Stock Report
```
