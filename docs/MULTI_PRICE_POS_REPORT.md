# MULTI-PRICE RETAIL / RESELLER / WHOLESALE POS — DEVELOPMENT REPORT

## 1. EXECUTIVE SUMMARY

Implemented multi-price display and selection on POS using the existing `products` columns:

```text
RETAIL    → products.price
RESELLER  → products.reseller_price
WHOLESALE → products.wholesale_price
ONLINE    → products.online_price (existing online flow)
```

No new database tables or pricing architecture were created. All changes are confined to:

- Backend canonical price resolver (`backend/services/pricing_service.py`)
- POS frontend (`frontend/src/pages/POS.js`)
- Authorization helpers (`backend/routes/auth.py`)
- New regression tests (`backend/tests/test_multi_price_pos.py`)

**Test results:**

| Suite | Result |
|-------|--------|
| `test_multi_price_pos.py` | **14 passed, 0 failed** |
| `test_security_remediation_f1_f7.py` | **23 passed, 0 failed** |
| `test_financial_integrity.py` | **18 passed, 0 failed, 0 skipped** |
| `test_golden_calculations.py` | **38 passed, 0 failed, 4 skipped** |
| Frontend Docker build | **Built successfully** (warnings are pre-existing source-map/eslint issues, none from changed files) |

---

## 2. EXISTING BEHAVIOR & AUDIT FINDINGS

### Database

The `products` table already contains:

```sql
price numeric(12,2) NOT NULL,
retail_price numeric(12,2) NULL,
reseller_price numeric(12,2) NULL,
wholesale_price numeric(12,2) NULL,
online_price numeric(12,2) NULL
```

- `products.price` is the canonical **Retail** price for POS/Dine-In.
- `products.retail_price` is an additional, separate field and **must not** replace `products.price` as the standard retail source.

### Existing price resolution flow

- `backend/services/pricing_service.py` contained `resolve_product_price(...)` and `_resolve_price_from_obj(...)`.
- Originally, the resolver **silently fell back** to `products.price` whenever `reseller_price` or `wholesale_price` was `NULL`.
- This allowed a cashier to request `price_type=reseller` and get the retail price instead of an error — a data-integrity gap.
- `backend/services/sales_service.py` already resolved every item at sale time, persisted `price` and `price_type` per item, and ignored the frontend `price` value.
- `frontend/src/pages/POS.js` already held a `priceType` state (`"ecceran"`, `"reseller"`, `"partai"`) but did **not** show a selector to the user.
- The product card displayed only one price — the currently selected price type — without showing which other prices were configured.

### Role/permission audit

- The repository does not have a dedicated `pricing` permission module.
- Cashiers have only `pos.create`/`pos.view` and default to Retail.
- `owner`, `admin`, `manager`, and `supervisor` are privileged roles in the codebase; `assert_price_type_authorized` already blocked privileged tiers for `kasir`.

---

## 3. IMPLEMENTATION

### 3.1 Backend price resolver

**File:** `backend/services/pricing_service.py`

Changed `_resolve_price_from_obj` so that non-retail offline price types are rejected when the matching field is `NULL`:

- `price_type=reseller` and `reseller_price IS NULL` → `422 PRICE_NOT_CONFIGURED`
- `price_type=partai` and `wholesale_price IS NULL` → `422 PRICE_NOT_CONFIGURED`
- `price_type=reseller` / `price_type=partai` with a negative value → `422 PRICE_NOT_CONFIGURED`
- `price_type=ecceran` → `products.price` (canonical retail)
- `sales_channel=online` → `products.online_price` with fallback to `products.price` (preserved existing online flow)

The existing `products.retail_price` field remains unused for POS/Dine-In, per the requirement.

### 3.2 Authorization

**File:** `backend/routes/auth.py`

Updated `assert_price_type_authorized` and `assert_discount_authorized` to include `supervisor` as a privileged role alongside `owner`, `admin`, and `manager`.

Rules:
- `ecceran` always allowed.
- `online` allowed only when `sales_channel=online`.
- `reseller` / `partai` allowed only for `owner`, `admin`, `manager`, `supervisor`.

### 3.3 POS UI

**File:** `frontend/src/pages/POS.js`

Changes:
- Added `availablePrices(product, variant)` helper that returns a list of configured prices with labels: `Retail` (from `price`), `Reseller` (if `reseller_price` not null), `Wholesale` (if `wholesale_price` not null).
- Renamed `resolveDisplayPrice` → `resolveCartPrice`; it now returns `null` instead of falling back to `price` when a non-retail price type is requested but not configured.
- Updated product cards to display all available prices side-by-side in a compact layout.
- Updated variant picker to display all available prices side-by-side.
- Added a global **Tipe Harga** dropdown in the cart panel:
  - Options: `Retail`, `Reseller`, `Wholesale`.
  - Disabled for `kasir` (Retail only).
  - `Reseller`/`Wholesale` options are hidden if no product in the catalog has the matching price.
  - Visible only when `sales_channel=offline`.
- Cart items now show the active price-type label and unit price.
- `addToCart` rejects adding a product whose selected price type is not configured and shows a clear toast.
- Held orders preserve `priceType` and the cart re-resolves when `priceType` or `salesChannel` changes.

### 3.4 Payment/QRIS integration

`backend/routes/payments.py` already uses `resolve_product_price` for QRIS canonical calculation, so the new rejection logic applies automatically. The existing F1/F2 security tests continue to pass.

### 3.5 Sales snapshot

`backend/services/sales_service.py` already persists per item:

```json
{
  "product_id": "...",
  "quantity": 10,
  "price": 21000,
  "price_type": "partai",
  "sales_channel": "offline",
  "cost": ...
}
```

This was verified with `test_multi_price_pos.py`.

---

## 4. TEST RESULTS

### 4.1 New multi-price regression tests

`backend/tests/test_multi_price_pos.py` — **14 passed, 0 failed**

Covered:
- `price_type=ecceran` → `products.price`
- `price_type=reseller` → `products.reseller_price`
- `price_type=partai` → `products.wholesale_price`
- `price_type=reseller` when `reseller_price IS NULL` → `422`
- `price_type=partai` when `wholesale_price IS NULL` → `422`
- Cashier `price_type=reseller` → `403`
- Cashier `price_type=ecceran` → `200`
- Frontend `unit_price` manipulation ignored by backend
- `price` and `price_type` persisted in `sales.items` snapshot

### 4.2 Existing security/financial tests

| Suite | Result |
|-------|--------|
| `test_security_remediation_f1_f7.py` | 23 passed, 0 failed |
| `test_financial_integrity.py` | 18 passed, 0 failed, 0 skipped |
| `test_golden_calculations.py` | 38 passed, 0 failed, 4 skipped |

No regressions were introduced.

### 4.3 Frontend build

`docker compose build frontend` completed successfully. Warnings are pre-existing source-map and `react-hooks/exhaustive-deps` warnings from unchanged files. No new build errors from `POS.js` edits.

---

## 5. FILES CHANGED

| File | Change |
|------|--------|
| `backend/services/pricing_service.py` | Reject missing/invalid reseller/wholesale prices for offline non-retail price types; preserve online fallback |
| `backend/routes/auth.py` | Include `supervisor` in privileged roles for price type and full-discount authorization |
| `frontend/src/pages/POS.js` | Multi-price display on product cards and variant picker; price-type selector in cart; no fallback when price not configured |
| `backend/tests/test_multi_price_pos.py` | New regression test file |

---

## 6. REMAINING CONSIDERATIONS / LIMITATIONS

1. **One price type per transaction** — The existing `/sales` and `/orders` endpoints accept a single `price_type` for the entire transaction. A cart cannot mix `Retail` and `Reseller` items in one sale. This is the existing architecture; changing it would require per-item `price_type` and is out of scope.

2. **No `pricing` permission module** — The repository has no dedicated `pricing` permission. Authorization currently uses role hierarchy (`owner/admin/manager/supervisor` allowed; `kasir` not). If the business later wants cashier-grade price-type permissions, a new `pricing` permission module would be needed.

3. **Products UI still shows `Harga Eceran` for `retail_price`** — This is an existing field label. `products.price` is correctly labeled `Harga Jual` (canonical retail). `retail_price` is a separate, additional field and was not removed or relabeled to avoid unintended business-rule changes.

4. **Variant pricing** — Variant `reseller_price`/`wholesale_price` are also respected by the resolver if configured; otherwise the request is rejected.

---

## 7. VERIFICATION CHECKLIST

| Acceptance Criteria | Status |
|---------------------|--------|
| `products.price` used as Retail | PASS |
| `products.reseller_price` used as Reseller | PASS |
| `products.wholesale_price` used as Wholesale | PASS |
| No new pricing tables/fields | PASS |
| NULL price types not displayed in POS | PASS |
| Side-by-side price labels in POS | PASS |
| Backend rejects missing reseller/wholesale | PASS |
| Cashier cannot use reseller/wholesale | PASS |
| Frontend is not financial authority | PASS |
| Sales snapshot stores `price_type` + actual `unit_price` | PASS |
| QRIS/orders use canonical backend resolution | PASS |
| Regression tests pass | PASS |
| Frontend build passes | PASS |
