# FINANCIAL INTEGRITY IMPLEMENTATION — FINAL REPORT

## 1. Files Changed

### Backend (canonical calculation & transaction safety)

| File | Change |
|------|--------|
| `backend/services/money.py` | NEW — Decimal/ROUND_HALF_UP canonical money helper |
| `backend/services/sales_service.py` | Core sale calculation converted to Decimal; cost snapshot added to sale items; `cost` column selected from products; subtotal accumulator fixed |
| `backend/services/order_service.py` | `_calc_total` converted to Decimal |
| `backend/services/pricing_service.py` | Returns Decimal money values; preserves DB precision |
| `backend/services/online_pricing_service.py` | Settlement/profit calculations converted to Decimal/ROUND_HALF_UP |
| `backend/routes/sales.py` | Database-backed idempotency; QRIS order linkage; Decimal money values for DB insert |
| `backend/routes/orders.py` | Database-backed idempotency; QRIS validation; cost snapshot; Decimal total |
| `backend/routes/payments.py` | QRIS amount calculated server-side from product items; idempotency via PostgreSQL advisory lock; ignores frontend `amount` |
| `backend/routes/online_orders.py` | `online_price` and `cost` resolved from DB; frontend-supplied financial values ignored |
| `backend/routes/reports.py` | COGS calculations prefer `(elem->>'cost')::numeric` historical snapshot, fall back to current `products.cost` |
| `backend/models/sales.py` | Added `qris_order_id` field |
| `backend/models/orders.py` | Added `qris_order_id` field |
| `backend/models/payments.py` | `QRISCreate` now accepts item context (`items`, `outlet_id`, `price_type`, `discount`, `tax`); `amount` deprecated/optional |

### Frontend (QRIS context only)

| File | Change |
|------|--------|
| `frontend/src/components/QRISPayment.js` | Sends transaction context (`items`, `outlet_id`, `price_type`, `discount`, `tax`) to `/payments/qris`; displays backend-calculated amount |
| `frontend/src/pages/POS.js` | Passes transaction context to `QRISPayment`; carries `qrisOrderId` through to `/sales` |
| `frontend/src/pages/Tables.js` | Passes transaction context to `QRISPayment`; carries `qrisOrderId` through to `/orders/{id}/checkout`; sends `Idempotency-Key` header |

### Tests

| File | Change |
|------|--------|
| `backend/tests/test_financial_integrity.py` | NEW — idempotency, concurrency, QRIS amount authority, Decimal rounding, COGS snapshot, online price trust, stock safety |
| `backend/tests/test_golden_calculations.py` | Case 15 updated to document that QRIS sales now require a pre-created `qris_order_id` |

---

## 2. Database Migrations

| File | Purpose |
|------|---------|
| `backend/sql/add_idempotency_keys.sql` | Creates `idempotency_keys` table with unique `key`, indexes, and `sale_id` reference |
| `backend/sql/drop_idempotency_fk.sql` | Removes FK on `idempotency_keys.sale_id` so the claim can be inserted before the sale row inside the same transaction |
| `backend/sql/extend_qris_orders.sql` | Adds `sale_id`, `items`, `discount`, `tax`, `subtotal`, `outlet_id`, `price_type` to `qris_orders` |
| `backend/sql/add_qris_idempotency.sql` | Adds `idempotency_key` unique column to `qris_orders` for atomic QRIS duplicate prevention |
| `backend/sql/add_missing_money_constraints.sql` | Adds CHECK >= 0 constraints for `shifts`, `customers`, `customer_memberships`, `coupons`, `payroll_items`, `online_orders`, `online_order_items`, `orders`, `qris_orders` |

---

## 3. Financial Calculation Architecture

The canonical path is now:

```
Frontend items (product_id, qty, variant, discount, tax)
  ↓
Backend resolves price per unit from products table
  ↓
Decimal subtotal = Σ(rounded_unit_price × quantity)
  ↓
Decimal total = subtotal − discount + tax  (ROUND_HALF_UP)
  ↓
Payment validation (cash/card/qris/transfer)
  ↓
Atomic DB transaction: sale insert + idempotency claim + stock deduct
  ↓
Receipt uses persisted values
  ↓
Reports use persisted values
```

- `services/money.py` provides `money()` and `ZERO` using `Decimal` and `ROUND_HALF_UP`.
- `_validate_sale_total()` and `_calc_total()` use `money()` exclusively.
- `_validate_payment()` computes `change` with `money()`.
- `pricing_service.resolve_product_price()` returns `money()` Decimal.
- DB `NUMERIC` columns receive quantized Decimal values via SQLAlchemy/asyncpg.
- JSONB item prices/costs are quantized first, then converted to `float` for JSON serialization only.

---

## 4. QRIS Architecture

```
Frontend → POST /payments/qris
              (sends: items[], outlet_id, price_type, discount, tax)
         ↓
Backend resolves product prices from DB
         ↓
Backend calculates canonical subtotal/total with Decimal
         ↓
Backend generates Midtrans gross_amount from canonical total
         ↓
Midtrans returns QRIS string
         ↓
qris_orders row persisted with amount, item snapshot, idempotency_key
         ↓
Frontend polls /payments/{order_id}
         ↓
On success, frontend calls /sales (or /orders/{id}/checkout) with qris_order_id
         ↓
Backend verifies sale total == qris_orders.amount
         ↓
Backend creates sale and links qris_orders.sale_id
```

- Frontend `amount` is no longer sent to `/payments/qris` and is never used as Midtrans `gross_amount`.
- If product price changes between QRIS creation and sale finalization, the sale total will differ from `qris_orders.amount` and the request is rejected.
- Same-key concurrent QRIS requests are serialized with `pg_advisory_xact_lock`; only one Midtrans charge is created.

---

## 5. Idempotency Architecture

### `/sales` and `/orders/{id}/checkout`

- `Idempotency-Key` HTTP header is accepted.
- Inside the sale transaction:
  1. `INSERT INTO idempotency_keys (key, sale_id) ... ON CONFLICT (key) DO NOTHING`
  2. If `rowcount == 0`, the key already exists; `SELECT` the existing sale and return it.
  3. If `rowcount == 1`, proceed with sale insert + stock deduction.
- PostgreSQL unique index blocks concurrent duplicate keys.
- Because the idempotency row is in the same transaction as the sale, both commit or both rollback.

### `/payments/qris`

- Accepts `Idempotency-Key` header.
- Inside the QRIS transaction:
  1. `SELECT pg_advisory_xact_lock(hashtext(key), 0)` serializes same-key requests.
  2. Check existing `qris_orders` by `idempotency_key`; if found, return existing QRIS.
  3. Call Midtrans and `INSERT` new `qris_orders` row.
- This prevents duplicate Midtrans charges for the same logical QRIS request.

---

## 6. Online-Order Pricing Architecture

- `routes/online_orders.py` now ignores `item.online_price` and `item.cost` from the request.
- It queries `products.online_price`, `products.price`, and `products.cost` from the database.
- `resolve_product_price(..., sales_channel="online", price_type="online")` returns the authoritative online price.
- `cost` is taken from `products.cost` and rounded with `money()`.
- `calculate_settlement()` and `calculate_profit()` now use Decimal for all monetary values.

---

## 7. Historical COGS Architecture

- At sale creation time, each sale item JSONB now includes `cost` copied from `products.cost` at that moment.
- `routes/reports.py` was updated so all COGS expressions prefer:
  ```sql
  COALESCE((elem->>'cost')::numeric, p.cost, 0)
  ```
  and for `paket_items`:
  ```sql
  COALESCE((pi->>'cost')::numeric, pc.cost, 0)
  ```
- This means historical P&L uses the cost snapshot when available, and falls back to current `products.cost` only for legacy sales that predate this change.

---

## 8. Money Precision / Rounding Architecture

- All canonical monetary calculations use `services.money.money(value)` which is `Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)`.
- Verified edge cases:
  - `money("0.005")` → `0.01`
  - `money("0.015")` → `0.02`
  - `money("0.125")` → `0.13`
  - `money("2.675")` → `2.68`
  - `money("99.995")` → `100.00`
  - `money("999.995")` → `1000.00`
- PostgreSQL `NUMERIC` columns store these values exactly.
- `online_pricing_service.py` was also migrated to Decimal for settlement/profit.

---

## 9. Database Integrity Constraints

Verified CHECK >= 0 constraints are now present for:

- `coupons`: `discount_value`, `min_purchase`
- `customer_memberships`: `total_spent`
- `customers`: `total_spent`
- `expenses`: `amount`
- `online_order_items`: `online_price`, `cost`, `gross_sales`, `cogs`
- `online_orders`: `gross_sales`, `total_deduction`, `expected_settlement`, `total_cogs`
- `orders`: `total`
- `payroll_items`: `base_salary`, `overtime_pay`, `attendance_bonus`, `deductions`, `net_pay`
- `products`: `price`, `cost`
- `purchase_orders`: `total`
- `qris_orders`: `amount`
- `sales`: `subtotal`, `discount`, `tax`, `total`, `amount_paid`, `change_amount`
- `shifts`: `opening_cash`, `actual_cash`, `cash_sales`, `non_cash_sales`, `expected_cash`

Negative values that are semantically valid (e.g., `sales.gross_profit`, `shifts.difference`) were intentionally left unconstrained.

---

## 10. Concurrency Test Results

| Test | Result |
|------|--------|
| 10 concurrent `/sales` with same idempotency key | **PASS** — exactly 1 sale created |
| 2 concurrent `/sales` with different keys | **PASS** — 2 distinct sales created |
| 5 concurrent purchases against stock=1 | **PASS** — at most 1 succeeded, final stock >= 0 |
| Concurrent QRIS with same idempotency key | Design verified via `pg_advisory_xact_lock` + DB unique key; integration requires Midtrans sandbox credentials |

---

## 11. Security / Manipulation Test Results

| Test | Result |
|------|--------|
| Frontend `price=1` ignored; backend uses DB price | **PASS** |
| Cash `amount_paid` < total rejected | **PASS** |
| Discount > subtotal rejected | **PASS** |
| QRIS sale with `qris_order_id` mismatch rejected | **PASS** |
| Online order ignores frontend `online_price=1`, `cost=1` | Code path verified; API test blocked by kasir role permission (see risks) |

`test_security_audit.py` regression: **37 passed, 0 failed**.

---

## 12. Cross-Layer Test Results

For a normal cash sale:

| Layer | Verified |
|-------|----------|
| Frontend request payload | ✓ (price ignored) |
| Backend calculated total | ✓ Decimal `money()` |
| DB persisted `sales.total` | ✓ matches backend |
| DB persisted `sales.amount_paid` | ✓ matches payment |
| DB persisted `sales.change_amount` | ✓ matches calculation |
| DB persisted `sales.items[].cost` | ✓ historical cost snapshot |
| Receipt total | ✓ uses persisted values |
| Report total (`SUM(sales.total)`) | ✓ uses persisted values |

For QRIS (with fake `qris_orders` row):

| Layer | Verified |
|-------|----------|
| `qris_orders.amount` | ✓ canonical product price |
| Sale total | ✓ equals `qris_orders.amount` |
| Frontend `price=1` manipulation | ✓ rejected/does not affect total |

---

## 13. Existing Regression Test Results

| Suite | Result |
|-------|--------|
| `test_golden_calculations.py` | **38 passed, 0 failed, 4 skipped** |
| `test_security_audit.py` | **37 passed, 0 failed** |
| `test_financial_integrity.py` | **18 passed, 0 failed, 0 skipped** |

---

## 14. Remaining Risks

| # | Risk | Severity | Why / Mitigation |
|---|------|----------|------------------|
| 1 | QRIS full integration not tested with real Midtrans | **MEDIUM** | Sandbox `MIDTRANS_SERVER_KEY` not configured in test environment. Backend calculation path and idempotency design are unit-tested; fake `qris_orders` linkage test passes. |
| 2 | Online-order API price-trust test blocked by RBAC | **MEDIUM** | Kasir account lacks `online_platforms.create`. The code path was reviewed and directly resolves DB `online_price`/`cost`; no frontend values are trusted. |
| 3 | `reports.py` still uses `float()` for display | **LOW** | Values come from persisted `NUMERIC` and are already quantized. Converting to `float` for JSON serialization is safe for 2-decimal whole-Rupiah values but could be tightened to Decimal-aware JSON encoding. |
| 4 | `payments.py` webhook compares `float(local["amount"])` with `float(data.get("gross_amount"))` | **LOW** | Midtrans sends integer Rupiah amounts; the 0.01 tolerance is safe. Could be tightened to Decimal comparison. |
| 5 | Refund functionality remains unimplemented | **MEDIUM** | Out of scope for this implementation task; schema has fields but no route. Historical COGS snapshot is now in place so a future refund can use the same cost data. |
| 6 | Frontend still calculates preview totals with JavaScript Number | **LOW** | Preview is display-only; backend recalculates and authorizes all persisted totals. QRIS amount is now backend-generated. |

---

## 15. FINAL VERDICT

```
ZERO-DIVERGENCE NOT VERIFIED
```

### Why not verified?

The implementation has fixed the verified critical and high defects:

- QRIS amount is now generated from the backend canonical calculation.
- Idempotency is database-backed and atomic.
- Historical COGS snapshots are persisted at sale time.
- Online-order prices/costs are resolved from the database.
- Core calculations use Decimal/ROUND_HALF_UP.
- Database integrity constraints cover all major monetary columns.
- New adversarial tests pass for idempotency, concurrency, rounding, COGS, and price manipulation.

However, full `ZERO-DIVERGENCE VERIFIED` requires an end-to-end QRIS test with a real Midtrans sandbox charge and a completed cross-layer online-order test. Those two external-integration/RBAC dependencies were not available in this environment, so the strongest honest verdict remains `ZERO-DIVERGENCE NOT VERIFIED`.

The system is materially more correct and safer than before. The remaining blockers are environmental/permission, not design defects.
