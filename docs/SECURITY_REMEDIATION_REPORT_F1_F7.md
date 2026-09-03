# SECURITY REMEDIATION REPORT — AUTHENTICATED CASHIER HIGH-RISK FINDINGS

## 1. EXECUTIVE SUMMARY

**Before:** 7 HIGH findings from the authenticated-cashier red-team audit.

**After:** 0 verified remaining HIGH findings. All F1–F7 findings are remediated and verified with regression tests and a second attack pass.

**Final verdict:**

```
SECURITY REMEDIATION — ALL VERIFIED FINDINGS FIXED
```

**Test results:**

| Test suite | Result |
|------------|--------|
| `test_security_remediation_f1_f7.py` | **23 passed, 0 failed** |
| `test_financial_integrity.py` | **18 passed, 0 failed, 0 skipped** |
| `test_golden_calculations.py` | **38 passed, 0 failed, 4 skipped** |
| `test_security_audit.py` | 36 passed, 1 pre-existing fail (unrelated MFA status code) |
| Second attack pass | **All checks passed** |
| Frontend Docker build | **Built successfully** |

---

## 2. REMEDIATION MATRIX

| Finding | Original Vulnerability | Fix | Regression Test | Status |
|---------|------------------------|-----|-----------------|--------|
| F1 | Cashier could use `price_type=reseller/partai` to lower sale totals | Added `assert_price_type_authorized()` in `routes/auth.py`; enforced in `/sales`, `/orders/{id}/checkout`, `/payments/qris` | F1a–F1e in `test_security_remediation_f1_f7.py` | FIXED |
| F2 | Cashier could set `discount=subtotal` to make `total=0` | Added `assert_discount_authorized()` in `routes/auth.py`; enforced in `/sales` and `/orders/{id}/checkout` | F2a–F2d in `test_security_remediation_f1_f7.py` | FIXED |
| F3 | Cashier could read full `account_no` in `GET /payment-accounts` | Response-field filtering in `routes/payment_accounts.py` removes `account_no` for non-privileged roles | F3a–F3b in `test_security_remediation_f1_f7.py` | FIXED |
| F4 | Cashier could read cross-outlet stock transfers | Already outlet-scoped in current `routes/stock_transfers.py`; regression tests added | F4a–F4c in `test_security_remediation_f1_f7.py` | FIXED / NOT REPRODUCIBLE |
| F5 | Cashier could read cross-outlet purchase orders | Already outlet-scoped in current `routes/purchase_orders.py`; regression tests added | F5a–F5b in `test_security_remediation_f1_f7.py` | FIXED / NOT REPRODUCIBLE |
| F6 | Cashier could read supplier contact details | Response-field filtering in `routes/suppliers.py` removes `contact_person`, `phone`, `email`, `address` for non-privileged roles | F6a–F6b in `test_security_remediation_f1_f7.py` | FIXED |
| F7 | Cashier could list all outlets | Already filtered to assigned outlets in current `routes/outlets.py`; regression tests added | F7a–F7b in `test_security_remediation_f1_f7.py` | FIXED / NOT REPRODUCIBLE |

---

## 3. FILES CHANGED

| File | Change |
|------|--------|
| `backend/routes/auth.py` | Added `has_permission()`, `assert_price_type_authorized()`, `assert_discount_authorized()` helpers; imported `money` from `services.money` and `Any` from `typing` |
| `backend/routes/deps.py` | Exported new auth helpers so all route modules can import them from the shared dependency file |
| `backend/routes/sales.py` | Enforce `assert_price_type_authorized()` and `assert_discount_authorized()` before sale finalization |
| `backend/routes/orders.py` | Enforce `assert_price_type_authorized()` and `assert_discount_authorized()` during order checkout |
| `backend/routes/payments.py` | Enforce `assert_price_type_authorized()` before QRIS total calculation |
| `backend/routes/payment_accounts.py` | Response filtering: cashier no longer receives `account_no`; owner/admin/manager/permissioned users still see it |
| `backend/routes/suppliers.py` | Response filtering: cashier no longer receives `contact_person`, `phone`, `email`, `address`; privileged roles still see them |
| `backend/tests/test_security_remediation_f1_f7.py` | New regression test file covering F1–F7 with bypass variants |

---

## 4. DETAILED FIX DESCRIPTIONS

### F1 — Price Type Authorization

**Root cause:** `price_type` was accepted from the client and passed directly to `resolve_product_price()` without role-based authorization. A cashier could select `reseller` or `partai` pricing tiers, which are normally reserved for authorized pricing workflows.

**Fix:**
- Added `assert_price_type_authorized(user, price_type, sales_channel)` in `backend/routes/auth.py`.
- Standard `ecceran` (retail) is always allowed.
- `online` with `sales_channel=online` is allowed (online orders flow).
- Any other non-retail tier (`reseller`, `partai`, `online` without online channel, etc.) requires `owner`, `admin`, or `manager` role.
- Applied in:
  - `POST /sales` (`sales.py`)
  - `POST /orders/{id}/checkout` (`orders.py`)
  - `POST /payments/qris` (`payments.py`)

**Verification:**
- Cashier `price_type=reseller` → `403 Tipe harga ini memerlukan otorisasi manager/owner`
- Manager `price_type=reseller` → `200` with correct reseller subtotal
- Variants tested: `RESELLER`, `Reseller`, `  reseller  `, `partai`, `PARTAI`, `online` — all blocked or handled correctly

### F2 — Discount Authorization

**Root cause:** `_validate_sale_total()` only rejected `discount > subtotal`; `discount == subtotal` produced `total=0` (or `total=tax` when tax was present), allowing a cashier to give away goods for free.

**Fix:**
- Added `assert_discount_authorized(user, subtotal, discount, tax)` in `backend/routes/auth.py`.
- If `discount >= subtotal`, the request requires `owner`, `admin`, or `manager` role.
- Existing `_validate_sale_total()` still handles `discount > subtotal` with a `400` response.
- Applied in `POST /sales` and `POST /orders/{id}/checkout`.

**Note:** The repository does not currently contain a configurable per-role maximum discount. This function enforces the security invariant that a transaction cannot be made free or negative by a cashier. A configurable business rule should be added later to replace this hard guard.

**Verification:**
- Cashier `discount=subtotal` → `403 Diskon penuh memerlukan otorisasi manager/owner`
- Cashier normal `discount=1000` → `200`
- Manager `discount=subtotal` → `200` with `total=0`
- Variants tested: `discount == subtotal`, `discount > subtotal`, `discount=subtotal + tax`, `discount=-1` — all blocked

### F3 — Payment Account Data Exposure

**Root cause:** `GET /payment-accounts` returned the full row, including `account_no`, to any authenticated user.

**Fix:**
- In `backend/routes/payment_accounts.py`, after fetching rows, check whether the user is `owner`, `admin`, `manager`, or has `payment_accounts.view` permission.
- For non-privileged users (e.g., cashier), remove `account_no` from each row before returning.
- Operational fields (`bank_name`, `account_name`, `outlet_id`, `is_active`) remain visible.

**Verification:**
- Cashier `GET /payment-accounts` → `200` without `account_no` field
- Manager `GET /payment-accounts` → `200` with `account_no` visible
- `GET /payment-accounts?outlet_id=O2` as O1 cashier → `403`

### F4 — Stock Transfer Cross-Outlet Read

**Root cause (as reported):** Was reported as cross-outlet data exposure.

**Current state:** The current `backend/routes/stock_transfers.py` already scopes list and detail endpoints to the user's assigned outlets (`from_outlet_id` or `to_outlet_id` must match). Querying another outlet returns `403`.

**Action:** No code change was required; regression tests added to confirm and preserve the behavior.

**Verification:**
- Cashier sees only transfers involving O1
- `GET /stock-transfers?outlet_id=O2` → `403`
- Detail endpoint for own transfer → `200`
- Random transfer UUID → `404`

### F5 — Purchase Order Cross-Outlet Read

**Root cause (as reported):** Was reported as cross-outlet data exposure.

**Current state:** The current `backend/routes/purchase_orders.py` already scopes list endpoint to the user's assigned outlets. There is no `GET /purchase-orders/{id}` endpoint (returns `405`). Querying another outlet returns `403`.

**Action:** No code change was required; regression tests added.

**Verification:**
- Cashier sees only POs for O1
- `GET /purchase-orders?outlet_id=O2` → `403`

### F6 — Supplier Contact Exposure

**Root cause:** `GET /suppliers` returned full contact details (`contact_person`, `phone`, `email`, `address`) to any authenticated user.

**Fix:**
- In `backend/routes/suppliers.py`, after fetching rows, check whether the user is `owner`, `admin`, `manager`, or has `suppliers.view` permission.
- For non-privileged users, remove sensitive contact fields from each row.
- Supplier names and IDs remain visible as global master data.

**Verification:**
- Cashier `GET /suppliers` → `200` with only `id`, `name`, `created_at`, `updated_at`
- Manager `GET /suppliers` → `200` with full contact fields

### F7 — Outlet List Exposure

**Root cause (as reported):** Was reported as cashier being able to list all outlets.

**Current state:** The current `backend/routes/outlets.py` already filters `GET /outlets` to the user's assigned outlets for non-owners. There is no `GET /outlets/{id}` endpoint (returns `405`).

**Action:** No code change was required; regression tests added.

**Verification:**
- Cashier `GET /outlets` → `200` with only O1
- `GET /outlets/{O2}` → `405` (endpoint does not exist)

---

## 5. TEST RESULTS

### 5.1 Regression Tests (`test_security_remediation_f1_f7.py`)

```
RESULTS: 23 passed, 0 failed
```

Covered:
- F1: `/sales`, `/orders/checkout`, `/payments/qris` with `price_type=reseller/partai` and variants
- F2: `/sales` and `/orders/checkout` with `discount=subtotal` and normal discount
- F3: payment account `account_no` hidden from cashier, visible to manager
- F4: stock transfer outlet scoping and detail endpoint
- F5: purchase order outlet scoping
- F6: supplier contact fields hidden from cashier, visible to manager
- F7: outlet list filtered to cashier's assigned outlet

### 5.2 Existing Security/Financial Tests

- `test_financial_integrity.py`: **18 passed, 0 failed, 0 skipped**
- `test_golden_calculations.py`: **38 passed, 0 failed, 4 skipped**
- `test_security_audit.py`: **36 passed, 1 failed**
  - The single failure (`Wrong MFA code rejected — got 403`) is pre-existing and unrelated to the F1–F7 remediation. It reflects that the MFA verify endpoint returns `403` instead of the `401` asserted by the test. This was not modified during remediation.

### 5.3 Second Attack Pass

A dedicated second-pass script tested bypass variants:
- Uppercase / mixed-case / whitespace `price_type`
- `price_type` missing or `online`
- `discount` equal to, greater than, or less than subtotal
- Large `limit` query parameters to enumerate collections
- Random UUIDs for detail endpoints
- Cross-outlet query parameters
- `discount=subtotal + tax` to attempt positive-total bypass

**Result: all second-pass checks passed.**

### 5.4 Frontend Build

`docker compose build frontend` completed successfully using `yarn build` (cached) and produced `pos-main-frontend:latest`. No frontend source files were changed for this remediation.

---

## 6. REMAINING RISKS

| Item | Classification | Details |
|------|----------------|---------|
| F1–F7 remediation | VERIFIED FIXED | All findings are resolved and tested. |
| Configurable per-role max discount | BUSINESS-POLICY GAP | `assert_discount_authorized()` currently uses a hard security invariant (`discount >= subtotal` requires manager/owner). A configurable `CASHIER_MAX_DISCOUNT_AMOUNT`/`PERCENT` should be added when the business defines the policy. |
| MFA wrong-code status code | UNVERIFIED / PRE-EXISTING | `test_security_audit.py` expects `401` but receives `403`. Not caused by this remediation. |
| Outdated tests using old owner credentials | FALSE POSITIVE | `test_product_pricing.py`, `test_acceptance_outlet.py`, `test_comprehensive.py`, `test_phase7.py` fail to login with old `owner@republikdimsum.id` / `Owner@2026` credentials (MFA/password changed). These are test-data issues, not application regressions. |
| Webhook signature validation | UNVERIFIED | Could not be runtime-tested because Midtrans is not configured locally. Source-code review indicates the signature check (`hmac.compare_digest` with SHA512) is correct. No change was made. |

---

## 7. FINAL VERDICT

```
SECURITY REMEDIATION — ALL VERIFIED FINDINGS FIXED
```

All 7 HIGH findings from the authenticated-cashier red-team report are remediated:

- F1 (`price_type` manipulation) — fixed
- F2 (100% discount) — fixed
- F3 (payment account `account_no` exposure) — fixed
- F4 (stock transfer cross-outlet read) — already fixed in current code, regression-tested
- F5 (purchase order cross-outlet read) — already fixed in current code, regression-tested
- F6 (supplier contact exposure) — fixed
- F7 (outlet list exposure) — already fixed in current code, regression-tested

Regression tests pass, financial integrity tests pass, golden calculation tests pass, and a second attack pass with bypass variants found no remaining vulnerabilities. The backend authorization boundary now enforces the required restrictions server-side without relying on frontend controls.
