# POS (KASIR) — BUSINESS & TECHNICAL DOCUMENTATION

> Dokumentasi AS-IS berdasarkan audit source code.
> Source: `frontend/src/pages/POS.js`, `backend/routes/sales.py`, `backend/services/sales_service.py`, `backend/services/pricing_service.py`, `backend/sql/postgres_schema.sql`

---

## 1. Module Overview

POS adalah core transaction module yang menangani penjualan produk (takeaway dan dine-in), pembayaran multi-method (cash, card, QRIS, transfer), price resolution per channel, stock deduction, receipt printing, dan shift management. POS adalah landing page default untuk role kasir.

---

## 2. Business Purpose

Memfasilitasi transaksi penjualan cepat dan akurat dengan dukungan multi-pricing, multi-payment, multi-outlet, dan multi-channel (offline/online).

---

## 3. Business Objective

- Memproses transaksi penjualan (takeaway & dine-in).
- Mendukung multi-pricing (retail, reseller, wholesale, online).
- Mendukung multi-payment (cash, card, QRIS, transfer).
- Mengurangi stok secara real-time.
- Mencatat transaksi untuk reporting dan audit.
- Menghasilkan receipt yang dapat dicetak.
- Mengelola shift kasir (open/close).

---

## 4. Actors / Roles

| Role | Akses | Keterangan |
|------|-------|------------|
| Owner | YA | Semua outlet |
| Admin | YA | Outlet yang di-assign |
| Manager | YA | Outlet yang di-assign |
| Supervisor | YA | Outlet yang di-assign |
| Kasir | YA | Outlet yang di-assign — landing page default |

Berdasarkan `seed_roles.sql`: kasir memiliki `pos: view, create` dan `dinein: view, create`.

---

## 5. Outlet Scope

**Klasifikasi: OUTLET-SCOPED**

- `sales.outlet_id` menentukan outlet transaksi.
- Frontend mengirim `outlet_id` via body param.
- Backend: create_sale menggunakan `body.outlet_id` atau main outlet fallback.
- Non-owner: outlet_id divalidasi terhadap `user["outlet_ids"]`.
- POS berada di luar `Layout` (route `/pos` tidak di-guard `canAccess`) — selalu accessible untuk logged-in user.

Sumber: `frontend/src/App.js` line 19, `backend/routes/sales.py` line 17.

---

## 6. Role & Permission

| Aksi | Owner | Admin | Manager | Supervisor | Kasir |
|------|-------|-------|---------|------------|-------|
| View POS | YA | YA | YA | YA | YA |
| Create Sale | YA | YA | YA | YA | YA |
| Open/Close Shift | YA | YA | YA | YA | YA |
| Barcode Scan | YA | YA | YA | YA | YA |
| QRIS Payment | YA | YA | YA | YA | YA |
| Print Receipt | YA | YA | YA | YA | YA |

Backend: `POST /api/sales` → `get_current_user` (semua authenticated user bisa create sale).

---

## 7. Business Flow

```
KASIR BUKA POS
 ↓
CEK SHIFT AKTIF
 ↓
[Belum ada shift]
 ↓
BUKA SHIFT (opening cash + note)
 ↓
PILIH OUTLET (auto / selector)
 ↓
PILIH TAB: POS (takeaway) / DINE-IN
 ↓
[POS TAB]
 ↓
CARI PRODUK (search / barcode scan / category)
 ↓
PILIH PRODUK + VARIANT
 ↓
TAMBAH KE CART
 ↓
PILIH CUSTOMER (opsional)
 ↓
SET DISCOUNT (opsional)
 ↓
PILIH SALES CHANNEL (offline/online)
 ↓
PILIH PRICE TYPE (ecceran/reseller/partai)
 ↓
CEK STOK OUTLET
 ↓
[PILIH PAYMENT]
 ↓
CASH → input amount_paid
CARD → pilih card brand, input details
QRIS → generate QR, poll status
TRANSFER → pilih rekening, input details
 ↓
VALIDATE PAYMENT
 ↓
CREATE SALE
 ↓
STOCK DEDUCTION
 ↓
STOCK MOVEMENT DICATAT
 ↓
RECEIPT DITAMPILKAN
 ↓
PRINT RECEIPT
 ↓
EMIT NEW_SALE (realtime)
 ↓
LOW STOCK ALERT (jika perlu)
```

---

## 8. Detailed Business Rules

1. Shift harus open sebelum transaksi (jika kasir belum buka shift, modal shift muncul).
2. Setiap sale memiliki `invoice_no` unik (auto-generated).
3. Items disimpan sebagai JSONB di `sales.items` — snapshot harga dan produk.
4. Price resolution server-side via `pricing_service.resolve_product_price`.
5. `subtotal = Σ (resolved_price × qty)` per item.
6. `discount` = input dari kasir (default 0).
7. `tax = (subtotal - discount) × tax_rate` (jika `outlets.tax_enabled`).
8. `total = subtotal - discount + tax`.
9. Payment validation:
   - Cash: `amount_paid >= total`, `change = amount_paid - total`.
   - Card: pilih card brand, input reference/approval code.
   - QRIS: generate QR via Midtrans, poll status.
   - Transfer: pilih rekening, input sender + reference.
10. Stock deduction: `products.stock` dan `outlet_stocks.quantity` dikurangi.
11. `stock_movements` dicatat dengan reason=`sale`, delta=-qty.
12. Low stock alert dibuat jika stok <= `low_stock_threshold`.
13. `sales.source` = `pos` (takeaway) atau `dinein` (dine-in checkout).
14. `sales.sales_channel` = `offline` atau `online`.
15. `sales.price_type` = `ecceran`, `reseller`, `partai`.
16. **Idempotency**: `POST /api/sales` menerima header `Idempotency-Key`. Jika key yang sama pernah digunakan dalam 24 jam, backend mengembalikan sale yang sama (tidak membuat duplikat). Frontend `POS.js` auto-generate key per checkout.
17. **Item note**: Setiap item di cart dapat memiliki `note` (catatan item, mis. "tidak pedas"). Field `note` disimpan di `sales.items` JSONB per item.
18. **Hold/Park**: Kasir dapat menahan order saat ini (`Tahan Order`) dan melanjutkannya nanti. Held order disimpan di frontend state, bukan backend.
19. **Void sale**: `POST /api/sales/{id}/void` membatalkan sale — stok dikembalikan (`products.stock` + `outlet_stocks.quantity`), `stock_movements` dengan `reason=void` dicatat, `sales.status='voided'`, audit log `SALE_VOIDED` dibuat.
20. **Reprint receipt**: `GET /api/sales/{id}/reprint` mengembalikan data sale untuk cetak ulang struk. Tidak membuat transaksi baru, tidak mengurangi stok. Audit log `RECEIPT_REPRINTED` dicatat.
21. **KDS auto-creation**: Setiap sale yang berhasil membuat `kitchen_orders` record dengan `status='new'`, berisi snapshot items (name, quantity, note, variant_name). KDS terhubung via `sale_id` dan `invoice_no`.

---

## 9. State / Status

### Sale
```
completed  →  voided  (via POST /sales/{id}/void)
```
- `status` default: `completed` (kolom `sales.status` ditambahkan).
- `voided`: sale dibatalkan, stok dikembalikan, `voided_by`/`voided_at`/`void_reason` tercatat.
- Refund: belum ada endpoint refund terpisah; void adalah mekanisme pembatalan utama.

### Shift
```
open  →  closed  (via close_shift)
```

### QRIS Payment
```
pending  →  paid  (via Midtrans webhook/poll)
```

### Held/Parked Order (POS takeaway)
```
active cart  →  held  →  resumed (kembali ke active cart)
```
- Held order disimpan di frontend state (`heldOrders`), bukan di backend.
- Held order berisi snapshot cart + customer + discount pada saat di-hold.
- Resume mengembalikan snapshot ke cart aktif dan menghapus held order.
- Discard membuang held order tanpa resume.

---

## 10. Technical Architecture

```
Browser
 ↓
React Component (POS.js)
 ↓
API Client (lib/api.js — axios)
 ↓
FastAPI Endpoint (routes/sales.py)
 ↓
Auth (get_current_user)
 ↓
Business Logic (sales_service.py, pricing_service.py)
 ↓
SQL Transaction (atomic)
 ↓
PostgreSQL (sales, outlet_stocks, products, stock_movements, shifts, alerts)
 ↓
Realtime emit (NEW_SALE)
 ↓
Response
 ↓
Receipt Display + Print
```

---

## 11. Technical Flow

### Create Sale (Core Transaction)
1. `POS.js` → user checkout → `POST /api/sales` dengan `{ items, outlet_id, customer_id, payment_method, amount_paid, discount, sales_channel, price_type, ... }`.
2. Backend `create_sale` (sales.py L17):
   a. Resolve `outlet_id` (body or main outlet).
   b. Validate outlet access for non-owner.
   c. `_validate_and_get_sale_items(items, sales_channel, price_type)`:
      - Loop items: fetch product, resolve price via `pricing_service.resolve_product_price`.
      - Check stock availability.
      - Build validated items with snapshot.
   d. Calculate `subtotal = Σ (price × qty)`.
   e. `_validate_sale_total(subtotal, discount, tax)`.
   f. `_validate_payment(payment_method, total, amount_paid, body)`.
   g. Generate `invoice_no`.
   h. Begin DB transaction:
      - `_insert_sale(session, ...)` → insert ke `sales`.
      - `_deduct_sale_stock(session, items, invoice_no, outlet_id, user_id)`:
        - Update `products.stock` (deduct).
        - Update/insert `outlet_stocks.quantity` (deduct).
        - Insert `stock_movements` (reason=`sale`, delta=-qty).
      - Commit transaction.
   i. Emit `NEW_SALE` via realtime.
   j. Create low-stock alerts if needed.
3. Response → frontend display receipt.

### Price Resolution
```
pricing_service.resolve_product_price(product, variant_name, sales_channel, price_type):
  1. Check variant match (if variant_name provided)
  2. If variant has pricing field → use variant price
  3. Else use product-level pricing:
     - online → online_price (fallback: price)
     - offline + ecceran → retail_price (fallback: price)
     - offline + reseller → reseller_price (fallback: price)
     - offline + partai → wholesale_price (fallback: price)
  4. If all additional prices NULL → fallback to products.price
```

Sumber: `backend/services/pricing_service.py` lines 19-66.

### QRIS Payment
1. `POST /api/payments/qris` → Midtrans API → `qris_orders` record → QR image.
2. Poll `GET /api/payments/{order_id}` every 4s.
3. Midtrans webhook `POST /api/midtrans/webhook` updates status.
4. On `paid` → proceed with sale creation.

### Shift Open
1. `POST /api/shifts/open` dengan `{ outlet_id, opening_cash, note }`.
2. Backend: prevent duplicate open shift, insert `shifts` dengan `status=open`.

### Shift Close
1. `POST /api/shifts/close` dengan `{ actual_cash, note }`.
2. Backend: calculate `cash_sales`, `non_cash_sales`, `expected_cash = opening_cash + cash_sales`, `difference = actual_cash - expected`.

---

## 12. Frontend

**File:** `frontend/src/pages/POS.js`

| Elemen | Detail |
|--------|--------|
| Context | `useAuth()` (`user`, `logout`), `useOutlet()` (`outlets`, `outletIdForApi`, `setSelectedOutlet`) — lines 14-15 |
| API Calls | `GET /products?outlet_id=...`, `GET /categories`, `GET /customers`, `GET /shifts/active?outlet_id=...`, `GET /outlets`, `GET /payment-accounts?outlet_id=...`, `GET /card-brands`, `GET /outlet-stocks/:outletId`, `POST /shifts/open`, `GET /products/by-barcode/:code`, `POST /card-brands`, `POST /sales` (with `Idempotency-Key` header), `POST /sales/{id}/void`, `GET /sales/{id}/reprint` |
| State | `cart`, `search`, `activeTab` (pos/dinein), `activeShift`, `showShiftModal`, `shiftCash/shiftNote`, `showScanner`, `customerId`, `paymentMethod`, `amountPaid`, `discount`, `salesChannel`, `priceType`, card/transfer fields, `showQRIS`, `receipt`, `products`, `categories`, `customers`, `heldOrders`, `showHeldOrders`, `processing` |
| UI | Two tabs (POS/Dine-In), product grid/search, cart drawer with per-item note input, checkout form (cash/card/transfer/QRIS), barcode scanner, shift open/close modal, receipt display, hold/park button, held orders modal |
| Components | `BarcodeScanner`, `QRISPayment`, `Receipt` |

---

## 13. Backend

**File:** `backend/routes/sales.py`

| Endpoint | Method | Function | Line | Auth |
|----------|--------|----------|------|------|
| `/api/sales` | POST | `create_sale` | L52 | `get_current_user` + `Idempotency-Key` header |
| `/api/sales` | GET | `list_sales` | L367 | `get_current_user` |
| `/api/sales/{sale_id}` | GET | `get_sale` | L339 | `get_current_user` |
| `/api/sales/{sale_id}/void` | POST | `void_sale` | L419 | `get_current_user` |
| `/api/sales/{sale_id}/reprint` | GET | `reprint_receipt` | L510 | `get_current_user` |

**File:** `backend/services/sales_service.py`

| Function | Line | Purpose |
|----------|------|---------|
| `_validate_sale_total` | L20 | Validate subtotal/discount/tax |
| `_validate_payment` | L29 | Validate payment method & amount |
| `_build_payment_values` | L165 | Map payment fields to SQL params |
| `_validate_and_get_sale_items` | L255 | Validate cart, check stock, resolve price |
| `_deduct_sale_stock` | L386 | Deduct products.stock + outlet_stocks + stock_movements |
| `_insert_sale` | L592 | Insert sale record within transaction |

**File:** `backend/services/pricing_service.py`

| Function | Line | Purpose |
|----------|------|---------|
| `_resolve_price_from_obj` | L19 | Resolve price by channel/price_type |
| `resolve_product_price` | L66 | Full price resolution with variant support |

---

## 14. API

```
POST /api/sales
Headers: Idempotency-Key: {string} (optional, prevents duplicate sale)
Body: {
  items: [{ product_id, variant_name, quantity, note, ... }],
  outlet_id, customer_id, payment_method,
  amount_paid, discount, sales_channel, price_type,
  card_type, card_brand, card_last4, ...,
  transfer_bank, transfer_account_name, transfer_account_no, ...
}

GET /api/sales?outlet_id={uuid}
GET /api/sales/{sale_id}

POST /api/sales/{sale_id}/void
Body: { reason: string }

GET /api/sales/{sale_id}/reprint
Response: sale data (same as GET /sales/{id}) — no new transaction created

POST /api/shifts/open { outlet_id, opening_cash, note }
POST /api/shifts/close { actual_cash, note }
GET /api/shifts/active?outlet_id={uuid}

POST /api/payments/qris { amount, description }
GET /api/payments/{order_id}
POST /api/midtrans/webhook (Midtrans callback)

GET /api/products?outlet_id={uuid}
GET /api/products/by-barcode/{code}
GET /api/payment-accounts?outlet_id={uuid}
GET /api/card-brands
```

---

## 15. Database

### Table: `sales`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `invoice_no` | varchar(50) | — | UNIQUE, NOT NULL |
| `shift_id` | uuid | — | Link to open shift |
| `outlet_id` | uuid | — | Outlet transaksi |
| `customer_id` | uuid | — | Optional |
| `cashier_id` | uuid | — | User yang membuat |
| `cashier_name` | varchar(255) | — | |
| `items` | jsonb | — | NOT NULL — snapshot cart |
| `subtotal` | numeric(14,2) | — | NOT NULL |
| `discount` | numeric(14,2) | 0 | |
| `tax` | numeric(14,2) | 0 | |
| `total` | numeric(14,2) | — | NOT NULL |
| `payment_method` | varchar(20) | — | cash/card/qris/transfer |
| `amount_paid` | numeric(14,2) | — | |
| `change_amount` | numeric(14,2) | — | |
| `source` | varchar(20) | `'pos'` | pos / dinein |
| `table_id` | uuid | — | For dine-in |
| `table_name` | varchar(100) | — | |
| `note` | text | — | |
| `created_at` | timestamptz | `now()` | |
| `card_type` | varchar(20) | — | |
| `card_brand` | varchar(50) | — | |
| `card_last4` | varchar(4) | — | |
| `card_reference_no` | varchar(100) | — | |
| `card_approval_code` | varchar(100) | — | |
| `card_terminal_id` | varchar(100) | — | |
| `transfer_bank` | varchar(100) | — | |
| `transfer_account_name` | varchar(150) | — | |
| `transfer_account_no` | varchar(100) | — | |
| `transfer_reference_no` | varchar(150) | — | |
| `transfer_sender_name` | varchar(150) | — | |
| `transfer_verified` | boolean | false | NOT NULL |
| `payment_reference` | varchar(150) | — | |
| `sales_channel` | varchar(10) | `'offline'` | offline / online |
| `price_type` | varchar(10) | `'ecceran'` | ecceran / reseller / partai |
| `status` | varchar(20) | `'completed'` | completed / voided |
| `voided_by` | uuid | — | User yang melakukan void |
| `voided_at` | timestamptz | — | Waktu void |
| `void_reason` | text | — | Alasan void |
| `original_sale_id` | uuid | — | Untuk refund reference (belum digunakan) |

**Indexes:** `idx_sales_created`, `idx_sales_outlet_created`, `idx_sales_shift`, `idx_sales_status`

### Table: `shifts`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `cashier_id` | uuid | — | NOT NULL |
| `cashier_name` | varchar(255) | — | |
| `outlet_id` | uuid | — | |
| `opening_cash` | numeric(14,2) | 0 | |
| `status` | varchar(20) | `'open'` | open / closed |
| `opened_at` | timestamptz | `now()` | |
| `closed_at` | timestamptz | — | |
| `actual_cash` | numeric(14,2) | — | Input saat close |
| `expected_cash` | numeric(14,2) | — | Calculated |
| `difference` | numeric(14,2) | — | actual - expected |
| `cash_sales` | numeric(14,2) | 0 | |
| `non_cash_sales` | numeric(14,2) | 0 | |
| `transaction_count` | integer | 0 | |
| `note` | text | — | |
| `close_note` | text | — | |

**Index:** `idx_shifts_cashier_status`

### Table: `qris_orders`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | integer PK | `nextval` | Serial |
| `order_id` | varchar(100) | — | UNIQUE, NOT NULL |
| `amount` | integer | — | NOT NULL |
| `description` | text | — | |
| `transaction_id` | varchar(100) | — | |
| `status` | varchar(30) | `'pending'` | pending / paid |
| `fraud_status` | varchar(20) | — | |
| `qr_string` | text | — | |
| `created_at` | timestamptz | `now()` | |
| `updated_at` | timestamptz | — | |

**Relationship:**
```
shifts (1) ─── (many) sales  (via shift_id)
outlets (1) ─── (many) sales  (via outlet_id)
customers (1) ─── (many) sales  (via customer_id)
users (1) ─── (many) sales  (via cashier_id)
sales (1) ─── (many) stock_movements  (via reference_no = invoice_no)
```

---

## 16. Data Flow

```
USER PILIH PRODUK + VARIANT
 ↓
PRICE RESOLUTION (pricing_service)
 ↓
ADD TO CART (frontend state)
 ↓
PILIH CUSTOMER + DISCOUNT + CHANNEL + PRICE TYPE
 ↓
CEK STOK OUTLET (GET /outlet-stocks/:outletId)
 ↓
[CHECKOUT]
 ↓
POST /sales
 ↓
BACKEND: _validate_and_get_sale_items
 ↓
LOOP ITEMS:
 ├── FETCH product
 ├── RESOLVE price (pricing_service)
 ├── CHECK stock
 └── BUILD snapshot item
 ↓
CALCULATE subtotal, tax, total
 ↓
VALIDATE payment (cash/card/qris/transfer)
 ↓
GENERATE invoice_no
 ↓
BEGIN TRANSACTION
 ↓
INSERT sales
 ↓
DEDUCT products.stock
 ↓
DEDUCT outlet_stocks.quantity
 ↓
INSERT stock_movements (reason=sale)
 ↓
COMMIT
 ↓
EMIT NEW_SALE (realtime)
 ↓
CREATE low-stock alert (if needed)
 ↓
RESPONSE: sale + receipt data
 ↓
FRONTEND: display receipt
 ↓
PRINT RECEIPT
```

---

## 17. Validation

- Items tidak boleh kosong.
- Setiap item: product exists, qty > 0, stock available.
- `subtotal` must match Σ (price × qty).
- `total = subtotal - discount + tax` must be positive.
- Payment validation:
  - Cash: `amount_paid >= total`.
  - Card: card_brand required.
  - Transfer: bank + account + reference required.
  - QRIS: must be `paid` before sale creation.
- Outlet access: non-owner must have access to `outlet_id`.
- Shift: harus ada open shift (NOT CONFIRMED — kemungkinan tidak enforced di backend).

---

## 18. Calculation

### Subtotal
```
subtotal = Σ (resolved_price × quantity)  for each item
```

### Tax
```
tax = (subtotal - discount) × outlets.tax_rate  (if tax_enabled)
```

### Total
```
total = subtotal - discount + tax
```

### Change (Cash)
```
change_amount = amount_paid - total
```

### Price Resolution
```
Channel: online → online_price (fallback: price)
Channel: offline, price_type: ecceran → retail_price (fallback: price)
Channel: offline, price_type: reseller → reseller_price (fallback: price)
Channel: offline, price_type: partai → wholesale_price (fallback: price)
```

### Shift Reconciliation
```
expected_cash = opening_cash + cash_sales
difference = actual_cash - expected_cash
```

### COGS (for P&L)
```
total_cogs = Σ (product.cost × quantity)
gross_profit = total - total_cogs
```

---

## 19. Audit Log

| Action | Entity | Dicatat? |
|--------|--------|----------|
| Create Sale | `sale` | `stock_movements` (reason=sale) dicatat; `audit_logs` untuk sale creation tidak terlihat eksplisit |
| Void Sale | `sale` | YA — `audit_logs` action=`SALE_VOIDED`, `stock_movements` reason=`void` |
| Reprint Receipt | `sale` | YA — `audit_logs` action=`RECEIPT_REPRINTED` |
| KDS Creation | `kitchen_order` | Tidak ada audit log eksplisit, tapi `kitchen_orders` row dibuat |
| Shift Open | `shift` | NOT CONFIRMED |
| Shift Close | `shift` | NOT CONFIRMED |
| QRIS Payment | `qris_order` | NOT CONFIRMED |

> `stock_movements` berfungsi sebagai audit trail untuk stock changes. Void sale mencatat `stock_movements` dengan `reason=void` (delta=+qty) untuk mengembalikan stok. Audit logging ke `audit_logs` sekarang aktif untuk void dan reprint.

---

## 20. Reports

Sale data masuk ke:
- **Sales Report** (`GET /api/reports/sales`): revenue, transactions, breakdown by payment/source/channel/price_type/category/product/outlet/cashier.
- **P&L Report** (`GET /api/reports/profit-loss`): revenue, COGS, gross/net profit.
- **Dashboard** (`GET /api/reports/dashboard`): revenue, transactions, items sold.
- **Shift Report** (`GET /api/reports/shifts`): shift reconciliation.
- **Payment Reconciliation** (`GET /api/reports/payment-reconciliation`): by method, cash/card/transfer/qris.
- **Sales Monitor** (`GET /api/reports/sales-monitor`): recent sales feed.
- **Branch Comparison** (`GET /api/reports/branch-comparison`): cross-outlet.
- **AI Assistant**: query penjualan, top products, anomalies.

---

## 21. Integration / Dependency

| Dependency | Keterangan |
|------------|------------|
| Products | Item selection & price resolution |
| Categories | Product filtering |
| Customers | Optional customer on sale |
| Outlet Stocks | Stock check & deduction |
| Stock Movements | Audit trail stock-out |
| Shifts | Shift context for sale |
| Payment Accounts | Transfer payment rekening |
| Card Brands | Card payment brand |
| QRIS/Midtrans | QRIS payment gateway |
| Receipt Config | Receipt formatting per outlet |
| Realtime | NEW_SALE broadcast |
| Alerts | Low stock alerts |
| Reports | All sales-related reports |
| Dashboard | KPI from sales |
| AI Assistant | Sales analysis |
| KDS | Kitchen order for dine-in |
| Dine-In/Tables | Shared checkout logic |
| Online Orders | Online channel sales (separate module) |

---

## 22. Error Handling

| Kondisi | HTTP | Behavior |
|---------|------|----------|
| Stock insufficient | 400 | "Stok tidak cukup" |
| Payment invalid | 400 | Payment validation error |
| Outlet not accessible | 403 | "Forbidden: no access to this outlet" |
| Product not found | 404 | "Product not found" |
| QRIS not paid | 400 | Cannot proceed with sale |
| Unauthorized | 401 | Redirect ke login |
| Server error | 500 | Generic error |

---

## 23. Edge Cases

- Cart kosong saat checkout → divalidasi frontend (`cart.length === 0` disabled checkout button).
- Variant product tanpa variant pricing → fallback ke product-level price.
- Product non-aktif → POS fetch `is_active=TRUE`.
- Stok outlet belum ada → auto-create dengan quantity=0, sale akan fail (stock insufficient).
- Double submit → DICEGAH via `Idempotency-Key` header + in-memory cache (TTL 24h). Frontend auto-generate key per checkout.
- QRIS timeout → poll berhenti, user harus retry.
- Discount > subtotal → NOT CONFIRMED (kemungkinan divalidasi).
- Concurrent sale same product → race condition pada stock deduction (POTENTIAL FINDING — stock deduction tidak menggunakan row lock).
- Shift tidak open → TIDAK di-enforce di backend; hanya di frontend (modal shift muncul jika belum ada shift aktif).
- Void sale yang sudah void → 400 "Transaksi sudah dibatalkan".
- Reprint sale yang sudah void → tetap mengembalikan data sale (status=voided).
- Held order dengan cart kosong → tidak bisa di-hold (button hanya muncul jika `cart.length > 0`).

---

## 24. Security

| Aspek | Status |
|-------|--------|
| Authentication | YA — `get_current_user` |
| Authorization | `get_current_user` saja — semua authenticated user bisa create sale |
| Outlet Enforcement | YA — non-owner divalidasi via `user["outlet_ids"]` (create, void, reprint) |
| SQL Injection | Aman — parameterized queries |
| Payment Data | Card/transfer details disimpan di `sales` — sensitive |
| Stock Race Condition | POTENTIAL FINDING — stock deduction tidak menggunakan row lock |
| Idempotency | YA — `Idempotency-Key` header + in-memory cache (TTL 24h). Repeat request dengan key yang sama mengembalikan sale yang sama. |
| Void Authorization | YA — non-owner divalidasi via `user["outlet_ids"]` terhadap `sales.outlet_id` |
| Reprint Authorization | YA — non-owner divalidasi via `user["outlet_ids"]` terhadap `sales.outlet_id` |

---

## 25. QA / Test Cases

```
TC-POS-001: Sale cash normal
Given: Kasir dengan open shift, produk stok cukup
When: Checkout 2 items, payment=cash, amount_paid=50000, total=45000
Then: Sale created, change=5000, stock deducted

TC-POS-002: Sale card
Given: Produk stok cukup
When: Checkout 1 item, payment=card, card_brand=Visa
Then: Sale created with card details

TC-POS-003: Sale QRIS
Given: Produk stok cukup
When: Checkout, payment=QRIS, QR paid
Then: Sale created after QRIS paid

TC-POS-004: Sale transfer
Given: Produk stok cukup, rekening outlet ada
When: Checkout, payment=transfer, pilih rekening
Then: Sale created with transfer details

TC-POS-005: Stock insufficient
Given: Produk stok=2
When: Checkout qty=5
Then: Error 400 "Stok tidak cukup"

TC-POS-006: Multi-pricing eceran
Given: Produk retail_price=15000, price=10000
When: Sale offline, price_type=ecceran
Then: Harga=15000

TC-POS-007: Multi-pricing fallback
Given: Produk retail_price=NULL, price=10000
When: Sale offline, price_type=ecceran
Then: Harga=10000 (fallback)

TC-POS-008: Online channel
Given: Produk online_price=20000, price=15000
When: Sale online
Then: Harga=20000

TC-POS-009: Barcode scan
Given: Produk dengan barcode "8990001234567"
When: Scan barcode
Then: Produk ditemukan, add to cart

TC-POS-010: Shift open/close
Given: Kasir belum punya shift
When: Open shift (cash=100000), create 3 sales, close shift (actual=150000)
Then: expected=100000+cash_sales, difference calculated

TC-POS-011: Wrong outlet
Given: Kasir outlet A
When: Create sale outlet B
Then: 403 Forbidden

TC-POS-012: Receipt print
Given: Sale completed
When: Click print
Then: Receipt displayed with outlet config (header, footer, tax)

TC-POS-013: Idempotency (double submit)
Given: Produk stok cukup
When: Checkout dengan Idempotency-Key="abc-123", lalu submit lagi dengan key yang sama
Then: Sale yang sama dikembalikan (tidak ada duplikat)

TC-POS-014: Void sale
Given: Sale completed
When: POST /sales/{id}/void dengan reason="rusak"
Then: sales.status=voided, stok dikembalikan, stock_movements reason=void dicatat

TC-POS-015: Reprint receipt
Given: Sale completed
When: GET /sales/{id}/reprint
Then: Sale data dikembalikan untuk cetak ulang, tidak ada transaksi baru

TC-POS-016: Hold/Park order
Given: Cart dengan 3 items
When: Click "Tahan Order"
Then: Cart disimpan ke heldOrders, cart dikosongkan, held order muncul di modal "Order Ditahan"

TC-POS-017: Resume held order
Given: 1 held order
When: Click "Lanjut" pada held order
Then: Cart diisi kembali dengan item held order, held order dihapus dari list

TC-POS-018: Item note
Given: Cart dengan 1 item
When: Input note "tidak pedas" pada item
Then: Note tersimpan di item, dikirim ke backend saat checkout, masuk ke sales.items JSONB
```

---

## 26. Current Implementation Status

```
STATUS: IMPLEMENTED
```

POS, dine-in tab, multi-pricing, multi-payment, shift management, barcode, QRIS, receipt printing, idempotency, hold/park, item notes, void sale, reprint receipt, KDS auto-creation berfungsi.

---

## 27. Bugs / Findings

| ID | Severity | Finding |
|----|----------|---------|
| POS-F-01 | HIGH | Stock deduction (`_deduct_sale_stock`) tidak menggunakan row lock — race condition pada concurrent sale dapat menyebabkan negative stock |
| POS-F-02 | RESOLVED | Idempotency key sekarang diimplementasikan via `Idempotency-Key` header + in-memory cache (TTL 24h) |
| POS-F-03 | MEDIUM | `POST /api/sales` hanya memerlukan `get_current_user` — tidak ada `require_permission("pos", "create")` check, semua authenticated user bisa create sale di any accessible outlet |
| POS-F-04 | MEDIUM | Shift open tidak enforced di backend — sale bisa dibuat tanpa open shift (hanya di-enforce di frontend) |
| POS-F-05 | RESOLVED | Audit logging ke `audit_logs` sekarang aktif untuk void (`SALE_VOIDED`) dan reprint (`RECEIPT_REPRINTED`) |
| POS-F-06 | LOW | Card/transfer details disimpan plaintext di `sales` table — sensitive data |
| POS-F-07 | LOW | Idempotency cache bersifat in-memory (per-process) — tidak shared antar worker; restart backend menghapus cache |

---

## 28. Gaps

| Gap | Keterangan |
|-----|------------|
| Refund | Void sale tersedia; refund uang ke customer belum ada endpoint terpisah |
| Sale edit | Tidak ada edit sale setelah create |
| Split payment | Tidak ada split payment (multiple method per sale) |
| Hold/suspend sale | RESOLVED — hold/park order sekarang tersedia di POS takeaway |
| Discount approval | Tidak ada approval untuk discount besar |
| Tax inclusive/exclusive | `outlets.tax_inclusive` ada di schema tapi NOT CONFIRMED implementasinya di POS |
| Service charge | `outlets.service_charge_*` ada di schema tapi NOT CONFIRMED implementasinya di POS checkout |

---

## 29. Dependency Map

```
POS
 ├── Products (item selection, price)
 ├── Categories (filtering)
 ├── Customers (optional)
 ├── Outlet Stocks (stock check, deduct)
 ├── Stock Movements (audit trail)
 ├── Shifts (shift context)
 ├── Payment Accounts (transfer)
 ├── Card Brands (card payment)
 ├── QRIS/Midtrans (QRIS payment)
 ├── Receipt Config (receipt format)
 ├── Realtime (NEW_SALE broadcast)
 ├── Alerts (low stock)
 ├── Reports (all sales reports)
 ├── Dashboard (KPI)
 ├── AI Assistant (sales analysis)
 ├── KDS (kitchen order for dine-in)
 └── Dine-In/Tables (shared checkout)
```

---

## 30. End-to-End Flow

```
KASIR LOGIN
 ↓
REDIRECT KE /POS
 ↓
CEK SHIFT AKTIF (GET /shifts/active)
 ↓
[BUKA SHIFT] → POST /shifts/open
 ↓
PILIH OUTLET (outlet context)
 ↓
LOAD PRODUCTS (GET /products?outlet_id=...)
 ↓
LOAD CATEGORIES, CUSTOMERS, PAYMENT ACCOUNTS, CARD BRANDS
 ↓
LOAD OUTLET STOCKS (GET /outlet-stocks/:outletId)
 ↓
[CARI PRODUK] (search / barcode / category)
 ↓
PILIH PRODUK + VARIANT → ADD TO CART
 ↓
PILIH CUSTOMER (opsional)
 ↓
SET DISCOUNT (opsional)
 ↓
PILIH SALES CHANNEL + PRICE TYPE
 ↓
[CHECKOUT]
 ↓
PRICE RESOLUTION (server-side)
 ↓
STOCK VALIDATION
 ↓
PAYMENT VALIDATION
 ↓
GENERATE INVOICE NO
 ↓
BEGIN TRANSACTION
 ↓
INSERT SALES (items JSONB snapshot)
 ↓
DEDUCT products.stock + outlet_stocks.quantity
 ↓
INSERT stock_movements (reason=sale)
 ↓
COMMIT
 ↓
EMIT NEW_SALE (realtime)
 ↓
LOW STOCK ALERT (if needed)
 ↓
RECEIPT DISPLAY
 ↓
PRINT RECEIPT
 ↓
DATA MASUK:
 ├── SALES REPORT
 ├── P&L REPORT
 ├── DASHBOARD
 ├── SHIFT REPORT
 ├── PAYMENT RECONCILIATION
 ├── AI ASSISTANT
 └── KDS (dine-in)
```
