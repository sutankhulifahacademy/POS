# TABLES (MEJA / DINE-IN) — BUSINESS & TECHNICAL DOCUMENTATION

> Dokumentasi AS-IS berdasarkan audit source code.
> Source: `frontend/src/pages/Tables.js`, `backend/routes/tables.py`, `backend/routes/orders.py`, `backend/sql/postgres_schema.sql`

---

## 1. Module Overview

Menu Tables (Meja) mengelola meja dine-in per outlet, termasuk pembuatan meja, pembukaan order, penambahan item ke order, checkout order menjadi sale, dan pembatalan order. Menu ini terintegrasi langsung dengan POS checkout flow dan KDS (Kitchen Display System).

---

## 2. Business Purpose

Mendukung operasional dine-in dengan memetakan meja fisik ke sistem digital, sehingga kasir dapat membuka order per meja, menambahkan produk, dan melakukan checkout seolah-olah transaksi POS biasa.

---

## 3. Business Objective

- Mengelola kapasitas meja per outlet.
- Mencegah double-order pada meja yang sama.
- Menghubungkan meja → order → checkout → sale.
- Menampilkan status meja real-time (available, occupied).

---

## 4. Actors / Roles

| Role | Akses | Keterangan |
|------|-------|------------|
| Owner | YA | Semua outlet |
| Admin | YA | Outlet yang di-assign |
| Manager | YA | Outlet yang di-assign |
| Supervisor | YA | Outlet yang di-assign |
| Kasir | YA | Outlet yang di-assign (dine-in = view/create) |

Berdasarkan `seed_roles.sql`: kasir memiliki permission `dinein: view, create` dan `tables: view`.

---

## 5. Outlet Scope

**Klasifikasi: OUTLET-SCOPED**

- Setiap meja dimiliki oleh satu outlet (`tables.outlet_id`).
- Frontend mengirim `outlet_id` via query param.
- Backend memfilter meja berdasarkan `outlet_id` atau `filter_outlets_for_user`.
- Owner dapat melihat semua outlet; non-owner terbatas pada outlet assignment.

Sumber: `backend/routes/tables.py` lines 8-52, `frontend/src/pages/Tables.js` line 11.

---

## 6. Role & Permission

| Aksi | Owner | Admin | Manager | Supervisor | Kasir |
|------|-------|-------|---------|------------|-------|
| View Tables | YA | YA | YA | YA | YA |
| Create Table | YA | YA | YA | TIDAK | TIDAK |
| Edit Table | YA | YA | YA | TIDAK | TIDAK |
| Delete Table | YA | YA | TIDAK | TIDAK | TIDAK |
| Open Order | YA | YA | YA | YA | YA |
| Checkout Order | YA | YA | YA | YA | YA |
| Cancel Order | YA | YA | YA | YA | YA |

Backend:
- `GET /api/tables` → `get_current_user`
- `POST /api/tables` → `require_permission("tables", "create")`
- `PUT /api/tables/{id}` → `require_permission("tables", "update")`
- `DELETE /api/tables/{id}` → `require_permission("tables", "delete")`
- Order endpoints → `get_current_user` (kasir bisa buka/checkout order)

---

## 7. Business Flow

```
KASIR BUKA MENU MEJA
 ↓
PILIH OUTLET (auto / selector)
 ↓
CEK SHIFT AKTIF (GET /shifts/active?outlet_id=...)
 ↓
LIHAT DAFTAR MEJA + STATUS
 ↓
KLIK MEJA KOSONG
 ↓
BUKA ORDER (pilih produk + variant, jumlah tamu, pelanggan)
  ├── Jika produk punya variant → buka variant picker modal
  └── Pilih variant → add to order items
 ↓
TAMBAH NOTE PER ITEM (opsional)
 ↓
SIMPAN ORDER (status: open)
 ↓
MEJA STATUS → OCCUPIED
 ↓
TAMBAH/UBAH ITEM (opsional)
  ├── Edit note per item
  └── Pindah meja (move table) jika perlu
 ↓
[CHECKOUT]
  ├── Pilih channel (offline/online)
  ├── Pilih price type (ecceran/reseller/partai) — disabled jika online
  ├── Pilih payment method (cash/card/QRIS/transfer)
  ├── QRIS → tampilkan QR modal → poll → on success: checkout
  └── Processing state (disabled button selama proses)
 ↓
SALE DIBUAT + KDS TICKET DIBUAT
 ↓
ORDER STATUS → CLOSED
 ↓
MEJA STATUS → AVAILABLE
 ↓
RECEIPT DITAMPILKAN → PRINT
```

---

## 8. Detailed Business Rules

1. Meja memiliki status: `available`, `occupied`.
2. Satu meja hanya boleh memiliki satu `open` order pada satu waktu — dicegah secara atomic dengan `UPDATE tables SET status='occupied' WHERE id=:id AND status='available'` (race condition protection).
3. Saat order dibuka, meja berubah menjadi `occupied`.
4. Saat order di-checkout atau dibatalkan, meja kembali `available`.
5. Meja tidak bisa dihapus jika masih ada `open` order.
6. Order menyimpan items sebagai JSONB.
7. Checkout order membuat record di `sales` table dengan `source = 'dinein'`.
8. Harga item di-resolve server-side via `pricing_service.resolve_product_price`.
9. Stock deduction terjadi saat checkout, bukan saat order dibuka.
10. **Variant picker**: Produk dengan variants membuka modal pemilihan variant sebelum ditambahkan ke order. Harga variant digunakan jika tersedia.
11. **Item note**: Setiap item dalam order dapat memiliki `note` (catatan item). Note disimpan di order items JSONB dan diteruskan ke `sales.items` saat checkout.
12. **QRIS payment**: Saat pembayaran QRIS dipilih, modal `QRISPayment` ditampilkan. Checkout baru dijalankan setelah QRIS berhasil (`onSuccess` callback).
13. **Processing state**: Checkout button di-disable selama proses checkout berlangsung (`processing` state) untuk mencegah double-submit.
14. **Receipt display**: Setelah checkout berhasil, modal receipt ditampilkan dengan tombol print.
15. **Move table**: Kasir dapat memindahkan order ke meja lain via `POST /orders/{id}/move-table`. Meja tujuan harus `available`. Order, table_name, dan table status diupdate secara atomic.
16. **Merge table**: Dua open order dapat digabung via `POST /orders/merge`. Items dari source order dipindahkan ke target order (merge by product_id + variant_name), source order di-cancel, meja source di-free.
17. **Split checkout**: Sebagian item dari order dapat di-checkout terpisah via `POST /orders/{id}/split-checkout` (basic implementation — memisahkan item untuk checkout terpisah).
18. **Shift check**: Frontend memuat shift aktif saat load Tables. Jika tidak ada shift aktif, warning ditampilkan di checkout modal (transaksi tetap bisa dilakukan).
19. **Channel + Price type**: Checkout modal memiliki selector channel (offline/online) dan price type (ecceran/reseller/partai). Jika channel=online, price type di-force ke `online`.
20. **KDS auto-creation**: Checkout dine-in membuat `kitchen_orders` record dengan `status='new'`, berisi snapshot items (name, quantity, note, variant_name), terhubung via `sale_id` dan `invoice_no`.
21. **Checkout race protection**: Order close di-guard dengan `WHERE status='open'` — jika order sudah di-checkout oleh concurrent request, transaksi di-rollback.
22. **Outlet authorization**: Semua order endpoints (list, open, update items, checkout, cancel, move, merge) memvalidasi akses outlet untuk non-owner.

---

## 9. State / Status

### Table Status
```
available  ←→  occupied
```

### Order Status
```
open  →  closed  (via checkout)
open  →  cancelled  (via cancel)
```

Sumber: `backend/sql/postgres_schema.sql` — `tables.status` default `available`, `orders.status` default `open`.

---

## 10. Technical Architecture

```
Browser
 ↓
React Component (Tables.js)
 ↓
API Client (lib/api.js)
 ↓
FastAPI Endpoint (routes/tables.py, routes/orders.py)
 ↓
Auth (get_current_user / require_permission)
 ↓
Business Logic
 ↓
SQL Query (raw SQL)
 ↓
PostgreSQL (tables, orders, sales)
 ↓
Response
 ↓
UI Update
```

---

## 11. Technical Flow

### Open Order
1. `Tables.js` → user klik meja → buka modal order.
2. User pilih produk, jumlah tamu, pelanggan.
3. `POST /api/orders` dengan `{ table_id, outlet_id, guest_count, items, customer_id }`.
4. Backend `open_order` (orders.py L31):
   - Validasi meja exists dan tidak ada open order.
   - Set `tables.status = 'occupied'`.
   - Insert `orders` dengan `status = 'open'`.
5. Response order detail → frontend update state.

### Update Order Items
1. `PUT /api/orders/{order_id}/items` dengan `{ items }`.
2. Backend `update_order_items` (orders.py L49):
   - Recalculate total via `_calc_total(items)`.
   - Update `orders.items` dan `orders.total`.

### Checkout Order
1. User klik checkout → pilih payment method.
2. `POST /api/orders/{order_id}/checkout` dengan payment fields.
3. Backend `checkout_order` (orders.py L58):
   - Resolve price per item via `pricing_service`.
   - Validate payment via `sales_service._validate_payment`.
   - Deduct stock via `sales_service._deduct_sale_stock`.
   - Insert `sales` record.
   - Set `orders.status = 'closed'`, `orders.sale_id = ...`.
   - Set `tables.status = 'available'`.

### Cancel Order
1. `DELETE /api/orders/{order_id}`.
2. Backend `cancel_order` (orders.py L620):
   - Set `orders.status = 'cancelled'`.
   - Set `tables.status = 'available'`.

---

## 12. Frontend

**File:** `frontend/src/pages/Tables.js`

| Elemen | Detail |
|--------|--------|
| Context | `useOutlet()` — `outletIdForApi` (line 11) |
| API Calls | `GET /tables`, `GET /products`, `GET /categories`, `GET /customers`, `GET /payment-accounts`, `GET /card-brands`, `GET /shifts/active`, `POST /tables`, `DELETE /tables/:id`, `GET /orders?status=open`, `GET /orders/{id}`, `POST /orders`, `PUT /orders/:id/items`, `POST /orders/:id/checkout`, `POST /orders/:id/move-table`, `POST /orders/merge`, `POST /orders/:id/split-checkout`, `POST /card-brands`, `DELETE /orders/:id` |
| State | `tables`, `products`, `categories`, `customers`, `openTable`, `activeOrder`, `orderItems`, `guests`, `search`, `checkout` modal state, `processing`, `receiptData`, `variantPick`, `noteEdit`, `moveTableModal`, `moveTargetTable`, `showQRIS`, `activeShift`, `salesChannel`, `priceType` |
| UI | Table grid grouped by zone, add-table modal, dine-in order modal with product picker + variant picker + note editor, guest count, customer selection, checkout form (cash/card/QRIS/transfer) with channel + price type selectors, shift warning, move-table modal, merge/split actions, receipt modal after checkout, QRIS payment modal |
| Components | `Receipt`, `QRISPayment` |

---

## 13. Backend

**File:** `backend/routes/tables.py`

| Endpoint | Method | Function | Line | Auth |
|----------|--------|----------|------|------|
| `/api/tables` | GET | `list_tables` | L8 | `get_current_user` |
| `/api/tables` | POST | `create_table` | L33 | `require_permission("tables", "create")` |
| `/api/tables/{table_id}` | PUT | `update_table` | L41 | `require_permission("tables", "update")` |
| `/api/tables/{table_id}` | DELETE | `delete_table` | L52 | `require_permission("tables", "delete")` |

**File:** `backend/routes/orders.py`

| Endpoint | Method | Function | Line | Auth |
|----------|--------|----------|------|------|
| `/api/orders` | GET | `list_orders` | L23 | `get_current_user` (outlet-scoped) |
| `/api/orders` | POST | `open_order` | L61 | `get_current_user` (atomic, outlet auth) |
| `/api/orders/{order_id}` | GET | `get_order_detail` | L122 | `get_current_user` (outlet auth) |
| `/api/orders/{order_id}/items` | PUT | `update_order_items` | L135 | `get_current_user` (outlet auth) |
| `/api/orders/{order_id}/checkout` | POST | `checkout_order` | L155 | `get_current_user` (atomic, race-protected) |
| `/api/orders/{order_id}` | DELETE | `cancel_order` | L565 | `get_current_user` (atomic, outlet auth, audited) |
| `/api/orders/{order_id}/move-table` | POST | `move_table` | L609 | `get_current_user` (atomic, outlet auth, audited) |
| `/api/orders/merge` | POST | `merge_tables` | L693 | `get_current_user` (atomic, outlet auth, audited) |
| `/api/orders/{order_id}/split-checkout` | POST | `split_checkout` | L792 | `get_current_user` (outlet auth) |

---

## 14. API

### Tables
```
GET /api/tables?outlet_id={uuid}
POST /api/tables { name, capacity, outlet_id, zone }
PUT /api/tables/{id} { name, capacity, outlet_id, zone }
DELETE /api/tables/{id}
```

### Orders
```
GET /api/orders?status=open&outlet_id={uuid}
GET /api/orders/{id}
POST /api/orders { table_id, outlet_id, guest_count, items, customer_id }
PUT /api/orders/{id}/items { items }
POST /api/orders/{id}/checkout { outlet_id, payment_method, amount_paid, sales_channel, price_type, ... }
POST /api/orders/{id}/move-table { new_table_id }
POST /api/orders/merge { source_order_id, target_order_id }
POST /api/orders/{id}/split-checkout { items, payment_method, amount_paid, ... }
DELETE /api/orders/{id}
```

---

## 15. Database

### Table: `tables`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `name` | varchar(100) | — | NOT NULL |
| `capacity` | integer | 2 | |
| `outlet_id` | uuid | — | Outlet owner |
| `zone` | varchar(100) | `'Utama'` | |
| `status` | varchar(20) | `'available'` | available / occupied |
| `created_at` | timestamptz | `now()` | |
| `updated_at` | timestamptz | — | |

**Index:** `idx_tables_outlet` (`outlet_id`, `status`)

### Table: `orders`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `order_no` | varchar(50) | — | NOT NULL |
| `table_id` | uuid FK | — | → `tables(id)` |
| `table_name` | varchar(100) | — | |
| `outlet_id` | uuid | — | |
| `guest_count` | integer | 1 | |
| `items` | jsonb | `'[]'` | Cart items |
| `total` | numeric(14,2) | 0 | |
| `status` | varchar(20) | `'open'` | open / closed / cancelled |
| `cashier_id` | uuid | — | |
| `cashier_name` | varchar(255) | — | |
| `sale_id` | uuid | — | Link to sales after checkout |
| `opened_at` | timestamptz | `now()` | |
| `closed_at` | timestamptz | — | |

**Indexes:** `idx_orders_table_status`, `idx_orders_outlet`

**Relationship:**
```
tables (1) ─── (many) orders
orders (1) ─── (0..1) sales  (via sale_id)
```

---

## 16. Data Flow

```
USER INPUT (pilih meja, produk, qty)
 ↓
FRONTEND STATE (orderItems, guests, customerId)
 ↓
API: POST /orders
 ↓
BACKEND: open_order()
 ↓
VALIDATE table not occupied
 ↓
INSERT orders (status=open)
 ↓
UPDATE tables SET status='occupied'
 ↓
RESPONSE order detail
 ↓
[USER TAMBAH/UBAH ITEM]
 ↓
API: PUT /orders/{id}/items
 ↓
[USER CHECKOUT]
 ↓
API: POST /orders/{id}/checkout
 ↓
PRICE RESOLUTION (pricing_service)
 ↓
PAYMENT VALIDATION
 ↓
STOCK DEDUCTION
 ↓
INSERT sales
 ↓
UPDATE orders SET status='closed', sale_id=...
 ↓
UPDATE tables SET status='available'
 ↓
RESPONSE sale + receipt
```

---

## 17. Validation

- Meja tidak boleh memiliki open order duplikat.
- Meja tidak bisa dihapus jika ada open order.
- Items harus valid (product exists, qty > 0).
- Payment method divalidasi via `sales_service._validate_payment`.
- Stock availability dicek saat checkout.

---

## 18. Calculation

### Order Total
```
total = Σ (item.price × item.quantity)
```
Sumber: `backend/services/order_service.py` `_calc_total(items)` line 4.

### Checkout Total
```
subtotal = Σ (resolved_price × qty)
discount = input discount
tax = (subtotal - discount) × tax_rate  (jika tax_enabled)
total = subtotal - discount + tax
```

Price resolution via `pricing_service.resolve_product_price(product, variant_name, sales_channel, price_type)`.

---

## 19. Audit Log

| Action | Entity | Dicatat? |
|--------|--------|----------|
| Create Table | `table` | NOT CONFIRMED FROM SOURCE |
| Update Table | `table` | NOT CONFIRMED FROM SOURCE |
| Delete Table | `table` | NOT CONFIRMED FROM SOURCE |
| Open Order | `order` | NOT CONFIRMED FROM SOURCE |
| Checkout Order | `sale` | YA — via sale creation + KDS ticket creation |
| Cancel Order | `order` | YA — `audit_logs` action=`ORDER_CANCELLED` |
| Move Table | `order` | YA — `audit_logs` action=`TABLE_MOVED` (from_table, to_table, moved_by) |
| Merge Table | `order` | YA — `audit_logs` action=`TABLE_MERGED` (source_order, target_order, merged_by) |
| KDS Status Update | `kitchen_order` | YA — `audit_logs` action=`KDS_STATUS_UPDATE` |

> Audit logging untuk cancel, move, dan merge sekarang aktif via `log_action()`. Sale creation (checkout) juga membuat KDS ticket.

---

## 20. Reports

- Order checkout menghasilkan `sales` record → masuk ke Sales Report, Profit/Loss, Dashboard.
- `sales.source = 'dinein'` → dapat difilter di Reports.
- `sales.table_id` dan `sales.table_name` tersimpan untuk laporan dine-in.

---

## 21. Integration / Dependency

| Dependency | Keterangan |
|------------|------------|
| Products | Item yang dipesan |
| Customers | Pelanggan opsional pada order |
| Payment Accounts | Untuk transfer payment |
| Card Brands | Untuk card payment |
| Sales | Hasil checkout order |
| Inventory/Stock | Stock deduction saat checkout |
| KDS | Order items dapat masuk ke Kitchen Display |
| POS | Shared checkout logic dengan POS |

---

## 22. Error Handling

| Kondisi | HTTP | Behavior |
|---------|------|----------|
| Meja sudah occupied | 400 | "Table already has an open order" |
| Meja tidak ditemukan | 404 | "Table not found" |
| Order tidak ditemukan | 404 | "Order not found" |
| Stock tidak cukup | 400 | "Stok tidak cukup" |
| Payment invalid | 400 | Validasi payment gagal |
| Unauthorized | 401/403 | Redirect/blocked |

---

## 23. Edge Cases

- Double open order pada meja sama → dicegah secara atomic via `WHERE status='available'` guard.
- Cancel order saat masih ada items → meja kembali available, tidak ada stock deduction, audit log dicatat.
- Checkout dengan cart kosong → divalidasi frontend.
- Meja dihapus saat ada open order → dicegah backend.
- Variant product dalam order → variant picker modal, price resolution per variant.
- Double checkout (race condition) → dicegah via `WHERE status='open'` guard pada order close.
- Move table ke meja yang occupied → 400 "Meja tujuan sudah ditempati".
- Move table order yang sudah closed → 400 "Order tidak aktif".
- Merge order dari outlet berbeda → 400 "Order harus dari outlet yang sama".
- Merge order dengan dirinya sendiri → 400 "Tidak bisa merge order dengan dirinya sendiri".
- QRIS payment gagal/timeout → modal QRIS ditutup, checkout tidak dijalankan.
- Shift tidak open → warning ditampilkan di checkout modal, transaksi tetap bisa dilakukan.
- Processing state → checkout button di-disable selama proses untuk mencegah double-submit.

---

## 24. Security

| Aspek | Status |
|-------|--------|
| Authentication | YA |
| Authorization | YA — `require_permission` untuk CUD table; `get_current_user` untuk order operations |
| Outlet Enforcement | YA — `filter_outlets_for_user` + per-order outlet_id check pada list/open/update/checkout/cancel/move/merge |
| SQL Injection | Aman — parameterized queries |
| IDOR | Order access sekarang di-check via `order.outlet_id` vs `user["outlet_ids"]` untuk semua order endpoints — RESOLVED |
| Race Condition (double open) | DICEGAH — atomic table claim via `WHERE status='available'` |
| Race Condition (double checkout) | DICEGAH — order close di-guard `WHERE status='open'` |
| Processing state | DICEGAH — frontend disable checkout button selama proses |

---

## 25. QA / Test Cases

```
TC-TBL-001: Buka order di meja kosong
Given: Meja A status=available
When: Kasir buka order dengan 2 item
Then: Order created, meja status=occupied

TC-TBL-002: Double open order
Given: Meja A status=occupied (open order exists)
When: Kasir buka order baru di Meja A
Then: Error 400 "Table already has an open order"

TC-TBL-003: Checkout order dine-in
Given: Open order dengan items
When: Kasir checkout dengan cash
Then: Sale created, order=closed, table=available

TC-TBL-004: Cancel order
Given: Open order
When: Kasir cancel order
Then: Order=cancelled, table=available, no stock change

TC-TBL-005: Hapus meja dengan open order
Given: Meja dengan open order
When: Manager delete table
Then: Error (table tidak bisa dihapus)

TC-TBL-006: Akses meja outlet lain
Given: Manager outlet A
When: Akses meja outlet B
Then: 403 Forbidden
```

---

## 26. Current Implementation Status

```
STATUS: IMPLEMENTED
```

Frontend dan backend lengkap. Tables, orders, checkout, cancel, move table, merge table, split checkout, variant picker, item notes, QRIS payment, receipt display, shift check, channel/price type selector, KDS auto-creation berfungsi.

---

## 27. Bugs / Findings

| ID | Severity | Finding |
|----|----------|---------|
| TBL-F-01 | RESOLVED | Order endpoints sekarang memerlukan outlet authorization — non-owner divalidasi via `user["outlet_ids"]` terhadap `order.outlet_id` |
| TBL-F-02 | RESOLVED | `GET /api/orders` sekarang memiliki outlet filter — non-owner hanya melihat orders dari outlet yang di-assign |
| TBL-F-03 | RESOLVED | Audit logging sekarang aktif untuk cancel (`ORDER_CANCELLED`), move (`TABLE_MOVED`), merge (`TABLE_MERGED`) |
| TBL-F-04 | LOW | Split checkout (`POST /orders/{id}/split-checkout`) masih basic — hanya memisahkan item, tidak membuat sale terpisah secara langsung |

---

## 28. Gaps

| Gap | Keterangan |
|-----|------------|
| Table reservation | Tidak ada fitur reservasi meja |
| Table merge/split | RESOLVED — merge table dan split checkout sekarang tersedia |
| QR code per meja | Tidak ada QR code untuk self-order |
| Order transfer antar meja | RESOLVED — move table sekarang tersedia |

---

## 29. Dependency Map

```
Tables
 ├── Orders (open/checkout/cancel/move/merge/split)
 ├── Products (item selection + variant picker)
 ├── Customers (optional)
 ├── Payment Accounts (transfer)
 ├── Card Brands (card payment)
 ├── Sales (checkout result)
 ├── Stock (deduct on checkout)
 ├── KDS (kitchen display — auto-created on checkout)
 ├── Shifts (shift check — warning if no active shift)
 └── POS (shared checkout logic)
```

---

## 30. End-to-End Flow

```
KASIR BUKA MENU MEJA
 ↓
CEK SHIFT AKTIF (GET /shifts/active)
 ↓
PILIH MEJA KOSONG
 ↓
BUKA ORDER (produk + variant + qty + note + tamu + pelanggan)
 ↓
POST /orders → order=open, table=occupied (atomic)
 ↓
[TAMBAH/UBAH ITEM + NOTE] → PUT /orders/{id}/items
 ↓
[OPSIONAL: PINDAH MEJA] → POST /orders/{id}/move-table
 ↓
[OPSIONAL: MERGE MEJA] → POST /orders/merge
 ↓
CHECKOUT (channel + price type + payment method)
  ├── QRIS → QR modal → poll → onSuccess
  └── Cash/Card/Transfer → langsung checkout
 ↓
POST /orders/{id}/checkout (processing state, race-protected)
 ↓
PRICE RESOLUTION + PAYMENT VALIDATION
 ↓
STOCK DEDUCTION (atomic transaction)
 ↓
INSERT SALES (source=dinein)
 ↓
CREATE KDS TICKET (kitchen_orders, status=new)
 ↓
ORDER=closed (WHERE status='open' guard), TABLE=available
 ↓
RECEIPT DISPLAY → PRINT
 ↓
DATA MASUK REPORTS + DASHBOARD + KDS
```
