# SECURITY RED TEAM REPORT — AUTHENTICATED CASHIER ATTACK

## EXECUTIVE SUMMARY

**Attacker:** Authenticated cashier (kasir@sutankhulifah.com, Outlet Utama)
**Method:** 191 backend endpoints inventoried from source; 81 runtime HTTP attacks executed across two passes; 6 parallel source-code audit subagents
**Overall verdict:** **FAIL**

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 7 |
| Medium | 6 |
| Low | 2 |

---

## ATTACK SURFACE

- **Total endpoints inspected:** 191 HTTP routes + 1 WebSocket
- **Sensitive endpoints:** /sales, /orders/checkout, /payments/qris, /midtrans/webhook, /users, /roles, /payment-accounts, /stock-transfers, /inventory/adjust, /reports/*, /audit-logs, /auth/*
- **Public endpoints (no auth):** /auth/login, /auth/register, /auth/logout, /auth/mfa/*, /business (GET), /midtrans/webhook
- **Cashier-accessible endpoints (get_current_user only):** /orders, /sales (GET/POST), /shifts, /attendance, /tables, /kds, /products (GET), /customers (GET), /suppliers (GET), /payment-accounts (GET), /outlets (GET), /coupons (GET), /stock-transfers (GET), /stock-requests (GET), /purchase-orders (GET), /schedules (GET), /leave-requests, /uploads, /receipt-config, /card-brands (GET), /categories (GET), /delivery-notes, /payroll/periods (GET), /payroll/periods/{id}/items (GET)

---

## FINDINGS

### F1
- **Severity:** HIGH
- **Title:** Cashier can use unauthorized price tiers (reseller/wholesale) to lower sale totals
- **Endpoint:** POST /api/sales
- **File:** backend/services/sales_service.py, backend/services/pricing_service.py
- **Function:** _validate_sale_items, resolve_product_price
- **Evidence:** Runtime test: product retail=25000, reseller=23000, wholesale=21000. Cashier sent `price_type=reseller` and sale was created with subtotal=23000 instead of 25000.
- **Attack steps:**
  1. Login as cashier
  2. GET /products to find a product with reseller_price < price
  3. POST /sales with `price_type: "reseller"` in body
  4. Backend resolves reseller price without checking authorization
- **Expected behavior:** Cashier should only be allowed to use `ecceran` (retail) price type; reseller/wholesale/online tiers require manager/owner authorization
- **Actual behavior:** Any authenticated user can select any price_type
- **Security impact:** Financial loss — cashier can sell at lower prices
- **Financial impact:** Direct — 2000 IDR per unit in test case
- **Cross-outlet impact:** No
- **Root cause:** No authorization check on `price_type` parameter
- **Exploitability:** Trivial — single API call
- **Recommended remediation:** Restrict `price_type` to `ecceran` for kasir role; require `products.update` or manager approval for other tiers
- **Regression test required:** Yes — submit sale with `price_type=reseller` as cashier, expect 403 or retail price

### F2
- **Severity:** HIGH
- **Title:** Cashier can set discount=subtotal to make total=0 (100% discount without authorization)
- **Endpoint:** POST /api/sales
- **File:** backend/services/sales_service.py
- **Function:** _validate_sale_total (lines 33-45)
- **Evidence:** Runtime test: sent discount=25000 (==subtotal), sale created with total=0, amount_paid=0.
- **Attack steps:**
  1. Login as cashier
  2. POST /sales with `discount: <subtotal>` and `amount_paid: 0`
  3. Backend validates discount <= subtotal (passes) but does not check discount authorization
  4. Sale created with total=0
- **Expected behavior:** Large discounts (e.g., >10% or >X IDR) require manager/owner approval or a coupon code
- **Actual behavior:** Any cashier can apply 100% discount
- **Security impact:** Free goods — cashier can give away inventory
- **Financial impact:** Direct — entire sale value
- **Cross-outlet impact:** No
- **Root cause:** No business-rule limit on discount magnitude; only non-negative and <= subtotal checks
- **Exploitability:** Trivial — single API call
- **Recommended remediation:** Add max discount percentage/rate per role; require manager PIN for discounts above threshold; validate against authorized coupon codes
- **Regression test required:** Yes — submit sale with discount=subtotal as cashier, expect 403 or manager approval required

### F3
- **Severity:** HIGH
- **Title:** Cashier can read payment account bank details (account numbers)
- **Endpoint:** GET /api/payment-accounts
- **File:** backend/routes/payment_accounts.py
- **Function:** list_payment_accounts (line 7, Depends(get_current_user))
- **Evidence:** Runtime test: cashier GET /payment-accounts returned 200 with `[{id, bank_name, account_name, account_no, outlet_id, is_active, ...}]`
- **Attack steps:**
  1. Login as cashier
  2. GET /api/payment-accounts
  3. Response includes bank_name, account_name, account_no for all accounts
- **Expected behavior:** Payment account details (especially account_no) should require `payment_accounts.view` or be restricted to owner/admin/manager
- **Actual behavior:** Any authenticated user can read bank account numbers
- **Security impact:** Sensitive financial data exposure — bank account numbers are PII
- **Financial impact:** Indirect — enables fraud/social engineering
- **Cross-outlet impact:** Yes — all outlets' payment accounts visible
- **Root cause:** Endpoint uses `get_current_user` instead of `require_permission("payment_accounts", "view")`
- **Exploitability:** Trivial — single GET request
- **Recommended remediation:** Change dependency to `require_permission("payment_accounts", "view")` or mask account_no for non-owner roles
- **Regression test required:** Yes — GET /payment-accounts as cashier, expect 403 or masked account_no

### F4
- **Severity:** HIGH
- **Title:** Cashier can read stock transfer data across outlets
- **Endpoint:** GET /api/stock-transfers
- **File:** backend/routes/stock_transfers.py
- **Function:** list_transfers (line 10, Depends(get_current_user))
- **Evidence:** Runtime test: cashier GET /stock-transfers returned 200 with `[{id, transfer_no, from_outlet_id, to_outlet_id, from_outlet_name, to_outlet_name, items, total_quantity, status, ...}]`
- **Attack steps:**
  1. Login as cashier
  2. GET /api/stock-transfers
  3. Response includes from_outlet_id, to_outlet_id, items, quantities for all transfers
- **Expected behavior:** Stock transfers should require `transfers.view` permission or be restricted to owner/admin/manager
- **Actual behavior:** Any authenticated user can read all transfer data
- **Security impact:** Cross-outlet data exposure — reveals inventory levels and movement patterns
- **Financial impact:** Indirect — competitive intelligence
- **Cross-outlet impact:** Yes — all outlets' transfers visible
- **Root cause:** Endpoint uses `get_current_user` instead of `require_permission("transfers", "view")`
- **Exploitability:** Trivial
- **Recommended remediation:** Change dependency to `require_permission("transfers", "view")` or `require_role("owner", "admin", "manager", "supervisor")`
- **Regression test required:** Yes

### F5
- **Severity:** HIGH
- **Title:** Cashier can read purchase orders with supplier and total data
- **Endpoint:** GET /api/purchase-orders
- **File:** backend/routes/purchase_orders.py
- **Function:** list_purchase_orders (line 5, Depends(get_current_user))
- **Evidence:** Runtime test: cashier GET /purchase-orders returned 200 with `[{id, po_no, supplier_id, supplier_name, items, total, status, ...}]`
- **Attack steps:**
  1. Login as cashier
  2. GET /api/purchase-orders
  3. Response includes supplier names, PO totals, line items
- **Expected behavior:** Purchase orders should require `purchase_orders.view` or be restricted to owner/admin/manager
- **Actual behavior:** Any authenticated user can read all PO data
- **Security impact:** Sensitive procurement data exposure — supplier relationships, pricing, volumes
- **Financial impact:** Indirect — reveals cost structure
- **Cross-outlet impact:** Yes — all outlets' POs visible
- **Root cause:** Endpoint uses `get_current_user` instead of `require_permission`
- **Exploitability:** Trivial
- **Recommended remediation:** Change dependency to `require_permission("purchase_orders", "view")` or `require_role("owner", "admin", "manager")`
- **Regression test required:** Yes

### F6
- **Severity:** HIGH
- **Title:** Cashier can read suppliers list (global master data)
- **Endpoint:** GET /api/suppliers
- **File:** backend/routes/suppliers.py
- **Function:** list_suppliers (line 5, Depends(get_current_user))
- **Evidence:** Runtime test: cashier GET /suppliers returned 200 with supplier contact details
- **Attack steps:**
  1. Login as cashier
  2. GET /api/suppliers
  3. Response includes supplier names, contact persons, phone numbers
- **Expected behavior:** Supplier data should be restricted to roles with `suppliers.view` or owner/admin/manager
- **Actual behavior:** Any authenticated user can read all supplier contact information
- **Security impact:** Business contact data exposure — enables supplier-side social engineering
- **Financial impact:** Indirect
- **Cross-outlet impact:** Yes — suppliers are global
- **Root cause:** Endpoint uses `get_current_user`; suppliers table has no outlet scoping by design
- **Exploitability:** Trivial
- **Recommended remediation:** Change dependency to `require_permission("suppliers", "view")` or restrict to owner/admin/manager
- **Regression test required:** Yes

### F7
- **Severity:** HIGH
- **Title:** Cashier can list all outlets (name, address, contact info)
- **Endpoint:** GET /api/outlets
- **File:** backend/routes/outlets.py
- **Function:** list_outlets (line 5, Depends(get_current_user))
- **Evidence:** Runtime test: cashier GET /outlets returned 200 with `[{id, name, address, ...}]`
- **Attack steps:**
  1. Login as cashier
  2. GET /api/outlets
  3. Response includes all outlet names and addresses
- **Expected behavior:** Cashier should only see their assigned outlets via GET /outlets/my
- **Actual behavior:** All outlets visible to any authenticated user
- **Security impact:** Business structure exposure
- **Financial impact:** Indirect
- **Cross-outlet impact:** Yes — all outlet locations revealed
- **Root cause:** Endpoint uses `get_current_user` instead of filtering by user's outlet_ids
- **Exploitability:** Trivial
- **Recommended remediation:** Filter response by user["outlet_ids"] for non-owners, or change to `require_role("owner", "admin")`
- **Regression test required:** Yes

### F8
- **Severity:** MEDIUM
- **Title:** Cashier can read coupons with outlet_id mapping
- **Endpoint:** GET /api/coupons
- **File:** backend/routes/coupons.py
- **Function:** list_coupons (line 5, Depends(get_current_user))
- **Evidence:** Runtime test: cashier GET /coupons returned 200 with `[{id, outlet_id, code, discount_type, discount_value, ...}]`
- **Attack steps:**
  1. Login as cashier
  2. GET /api/coupons
  3. Response includes coupon codes, discount values, and outlet mappings
- **Expected behavior:** Coupon management should require `coupons.view` or be restricted to owner/admin/manager
- **Actual behavior:** Any authenticated user can read all coupon data
- **Security impact:** Coupon abuse — cashier can learn and share discount codes
- **Financial impact:** Indirect — enables unauthorized discounts
- **Cross-outlet impact:** Yes — all outlets' coupons visible
- **Root cause:** Endpoint uses `get_current_user` instead of `require_permission`
- **Exploitability:** Trivial
- **Recommended remediation:** Change dependency to `require_permission("coupons", "view")` or restrict to owner/admin/manager
- **Regression test required:** Yes

### F9
- **Severity:** MEDIUM
- **Title:** String discount value silently coerced to numeric (type confusion)
- **Endpoint:** POST /api/sales
- **File:** backend/services/sales_service.py, backend/models/sales.py
- **Function:** _validate_sale_total
- **Evidence:** Runtime test: sent `discount: "100"` (string), sale created successfully with discount=100.0
- **Attack steps:**
  1. Login as cashier
  2. POST /sales with `discount: "100"` instead of `discount: 100`
  3. Backend coerces string to numeric and processes sale
- **Expected behavior:** Pydantic should reject non-numeric types for monetary fields
- **Actual behavior:** String "100" is coerced to float 100.0
- **Security impact:** Low — type confusion could bypass validation in edge cases
- **Financial impact:** Low
- **Cross-outlet impact:** No
- **Root cause:** Pydantic float field accepts string-numeric values by default
- **Exploitability:** Low — doesn't bypass business logic
- **Recommended remediation:** Add `strict=True` to monetary Pydantic fields or validate type explicitly
- **Regression test required:** Yes

### F10
- **Severity:** MEDIUM
- **Title:** Cashier can read all customers (global master data, no outlet scoping)
- **Endpoint:** GET /api/customers
- **File:** backend/routes/customers.py
- **Function:** list_customers (line 5, Depends(get_current_user))
- **Evidence:** Runtime test: cashier GET /customers returned 200 with all customer records
- **Attack steps:**
  1. Login as cashier
  2. GET /api/customers
  3. Response includes all customers across all outlets
- **Expected behavior:** Customers should be outlet-scoped or restricted to roles with `customers.view`
- **Actual behavior:** All customer data is global and accessible to any authenticated user
- **Security impact:** PII exposure — customer names, phones, emails
- **Financial impact:** Indirect
- **Cross-outlet impact:** Yes — all outlets' customers
- **Root cause:** Customers table has no outlet_id column; endpoint uses get_current_user
- **Exploitability:** Trivial
- **Recommended remediation:** Add outlet_id to customers table or restrict to `require_permission("customers", "view")`
- **Regression test required:** Yes
- **Note:** Source audit confirms this is "by design" — but design should be reviewed

### F11
- **Severity:** MEDIUM
- **Title:** Cashier can read schedules (empty in test, but endpoint accessible)
- **Endpoint:** GET /api/schedules
- **File:** backend/routes/schedules.py
- **Function:** list_schedules (line 5, Depends(get_current_user))
- **Evidence:** Runtime test: cashier GET /schedules returned 200 with empty list
- **Attack steps:**
  1. Login as cashier
  2. GET /api/schedules
  3. Endpoint accessible (returned 200, empty list in test env)
- **Expected behavior:** Schedules should require `schedules.view` or be restricted to owner/admin/manager
- **Actual behavior:** Any authenticated user can access the endpoint
- **Security impact:** Employee schedule data exposure when populated
- **Financial impact:** Indirect
- **Cross-outlet impact:** Potentially yes
- **Root cause:** Endpoint uses `get_current_user` instead of `require_permission`
- **Exploitability:** Trivial
- **Recommended remediation:** Change dependency to `require_permission("schedules", "view")` or `require_role("owner", "admin", "manager")`
- **Regression test required:** Yes

### F12
- **Severity:** MEDIUM
- **Title:** Cashier can read stock requests
- **Endpoint:** GET /api/stock-requests
- **File:** backend/routes/stock_requests.py
- **Function:** list_stock_requests (line 5, Depends(get_current_user))
- **Evidence:** Runtime test: cashier GET /stock-requests returned 200 with empty list
- **Attack steps:**
  1. Login as cashier
  2. GET /api/stock-requests
  3. Endpoint accessible
- **Expected behavior:** Stock requests should require `stock_requests.view` or be restricted to owner/admin/manager
- **Actual behavior:** Any authenticated user can access
- **Security impact:** Inventory request data exposure when populated
- **Financial impact:** Indirect
- **Cross-outlet impact:** Potentially yes
- **Root cause:** Endpoint uses `get_current_user` instead of `require_permission`
- **Exploitability:** Trivial
- **Recommended remediation:** Change dependency to `require_permission("stock_requests", "view")` or `require_role("owner", "admin", "manager")`
- **Regression test required:** Yes

### F13
- **Severity:** LOW
- **Title:** CSRF middleware allows requests with missing Origin/Referer headers
- **Endpoint:** All POST/PUT/PATCH/DELETE
- **File:** backend/server.py
- **Function:** CSRFMiddleware.dispatch (lines 86-126)
- **Evidence:** Source audit confirms: if neither Origin nor Referer is present, request is allowed. This is intentional for curl/Postman compatibility but weakens CSRF defense.
- **Attack steps:**
  1. Attacker creates a page that submits a form to the POS API
  2. If the browser strips Origin/Referer (e.g., via `<meta name="referrer" content="no-referrer">`), the CSRF check is bypassed
- **Expected behavior:** Missing Origin/Referer on mutation requests should be rejected
- **Actual behavior:** Allowed through
- **Security impact:** Potential CSRF on cookie-authenticated endpoints
- **Financial impact:** Potential
- **Cross-outlet impact:** No
- **Root cause:** Intentional design choice for API testing compatibility
- **Exploitability:** Medium — requires victim to visit attacker page with same-site cookie
- **Recommended remediation:** In production, reject mutation requests with no Origin/Referer; use a custom X-Requested-With header check instead
- **Regression test required:** Yes

### F14
- **Severity:** LOW
- **Title:** Audit log writes silently fail due to missing `import json`
- **Endpoint:** All endpoints that call log_action()
- **File:** backend/routes/audit_logs.py
- **Function:** log_action (lines 124-152)
- **Evidence:** Source audit: `log_action` calls `json.dumps()` but `json` is not imported in the file. The `except Exception` at line 150 swallows the NameError silently.
- **Attack steps:**
  1. Perform any action that triggers log_action with old_value or new_value
  2. Audit row silently fails to write
- **Expected behavior:** Audit logs should be written for all state-changing actions
- **Actual behavior:** Audit writes fail silently when old_value/new_value is provided
- **Security impact:** Audit trail integrity — evidence of actions may be missing
- **Financial impact:** Indirect
- **Cross-outlet impact:** No
- **Root cause:** Missing `import json` at top of audit_logs.py
- **Exploitability:** Not directly exploitable, but removes forensic evidence
- **Recommended remediation:** Add `import json` at the top of backend/routes/audit_logs.py
- **Regression test required:** Yes — perform a sale and verify audit_log row is created

---

## OUTLET ISOLATION

**PASS** — Cashier A cannot access Outlet B's sales, shifts, reports, or create sales in Outlet B. The `validate_outlet_access` function correctly blocks cross-outlet access for explicit outlet_id parameters.

**Note:** `validate_outlet_access` silently returns when outlet_id is None/empty, which could allow creating records with NULL outlet_id. This is a design concern but not directly exploitable for cross-outlet access.

---

## IDOR

**PASS** — UUID-based resource access is properly scoped. Random sale UUIDs return 404. Own-outlet resources are accessible. The source audit identified a potential gap in idempotency key resolution (no outlet filter on key lookup), but this requires guessing a valid idempotency key, which is impractical.

---

## ROLE ESCALATION

**PASS** — Cashier cannot access /users, /roles, /audit-logs, /payroll (create), or any owner/admin-only endpoint. JWT role claim is re-verified from database on every request. Modified JWT tokens are rejected.

---

## MENU RESTRICTION

**FAIL** — Multiple endpoints accessible to cashier that should be restricted:
- GET /payment-accounts (F3)
- GET /stock-transfers (F4)
- GET /purchase-orders (F5)
- GET /suppliers (F6)
- GET /outlets (F7)
- GET /coupons (F8)
- GET /schedules (F11)
- GET /stock-requests (F12)

These endpoints use `Depends(get_current_user)` instead of `require_permission(...)` or `require_role(...)`.

---

## PRICE/DISCOUNT/TAX MANIPULATION

**FAIL** —
- Cashier can use unauthorized price tiers (F1)
- Cashier can apply 100% discount (F2)
- Frontend-supplied price is correctly ignored (PASS)
- Negative price/discount rejected (PASS)
- Discount > subtotal rejected (PASS)
- String discount coerced (F9)

---

## STOCK MANIPULATION

**PASS** — Cashier cannot adjust stock, create transfers, update products, or create products. All stock-related write endpoints require permissions not granted to the kasir role.

---

## PAYMENT MANIPULATION

**PASS** — amount_paid < total rejected. amount_paid=0 rejected. Frontend price ignored. QRIS amount is backend-calculated.

---

## QRIS

**PASS** — QRIS amount is calculated from DB product prices. Frontend amount is ignored. Cross-outlet QRIS creation is blocked. (Midtrans sandbox not configured, so full integration test was not possible.)

---

## PAYMENT REPLAY

**PASS** — Same idempotency key returns same sale. 5 concurrent requests with same key produce exactly 1 sale. Database-backed idempotency is working.

---

## WEBHOOK REPLAY

**UNCONFIRMED** — Webhook endpoint returns 503 (Midtrans not configured) before reaching signature validation. Source code review confirms signature validation uses `hmac.compare_digest` with SHA512 and conditional UPDATE for replay protection. Cannot be runtime-verified without Midtrans credentials.

---

## JWT/SESSION

**PASS** — JWT role claim is not trusted; backend re-loads role from database on every request. Modified JWT tokens are rejected (invalid signature). Cookie is HttpOnly with SameSite=lax.

---

## CSRF

**FAIL (LOW)** — CSRF middleware allows requests with missing Origin/Referer headers (F13). Cookie-based auth with SameSite=lax provides some protection, but the middleware gap weakens defense.

---

## AUDIT LOG INTEGRITY

**PASS (with caveat)** — Cashier cannot create, modify, or delete audit logs (no endpoints exist for write operations). However, audit log writes silently fail due to missing `import json` (F14), meaning audit evidence may be incomplete.

---

## HIDDEN ENDPOINTS

**PASS** — No undocumented debug/admin/test endpoints found. FastAPI docs at /docs and /openapi.json are standard. Health endpoint at /api/health is public by design.

---

## MASS ASSIGNMENT

**PASS** — Register endpoint rejects role=admin. Pydantic models prevent arbitrary field injection. Source audit found potential mass assignment in /users/{id}/outlets (raw dict body), but this endpoint requires `users.update` permission not held by cashier.

---

## CHECKOUT CONCURRENCY

**PASS** — Database-backed idempotency prevents duplicate sales. Concurrent same-key requests produce exactly 1 sale. Stock deduction is atomic with sale creation.

---

## ATTACK CHAINS

### CHAIN A: Cashier → unauthorized price tier → financial loss
1. Cashier logs in normally
2. Cashier identifies product with reseller_price < retail price
3. Cashier creates sale with `price_type: "reseller"`
4. Sale recorded at lower price — customer pays less, inventory depleted at lower revenue
5. **Status: CONFIRMED (F1)**

### CHAIN B: Cashier → 100% discount → free goods
1. Cashier logs in normally
2. Cashier creates sale with `discount: <subtotal>` and `amount_paid: 0`
3. Sale recorded with total=0 — inventory depleted with zero revenue
4. **Status: CONFIRMED (F2)**

### CHAIN C: Cashier → payment-accounts → bank account numbers → social engineering
1. Cashier logs in
2. GET /payment-accounts — reads bank account numbers
3. Uses account numbers for social engineering or fraud
4. **Status: CONFIRMED (F3)**

### CHAIN D: Cashier → stock-transfers → competitive intelligence
1. Cashier logs in
2. GET /stock-transfers — reads all transfer data across outlets
3. Learns inventory levels, movement patterns, and outlet relationships
4. **Status: CONFIRMED (F4)**

---

## FALSE POSITIVES

| Suspected Issue | Disposition |
|---|---|
| Webhook no-signature accepted | UNCONFIRMED — 503 returned before signature check due to Midtrans not configured. Source code shows signature validation is correct. |
| GET /inventory?outlet_id=B | Not a vulnerability — endpoint path is /inventory/stock and /inventory/movements, not /inventory. 404 is correct. |
| GET /settings as cashier | Not a vulnerability — endpoint doesn't exist at /settings (404). Settings are at /business and /receipt-config. |
| GET /payroll as cashier | Not a vulnerability — endpoint is /payroll/periods, not /payroll. 404 is correct. |
| GET /loyalty as cashier | Not a vulnerability — endpoint is /loyalty/memberships, not /loyalty. 404 is correct. |
| GET /online-profit as cashier | Not a vulnerability — endpoint is /online-profit/report, not /online-profit. 404 is correct. |
| Orders cross-outlet table_id | Not confirmed — GET /tables?outlet_id=B returns 403, so cashier cannot discover Outlet B table IDs. Source audit shows the table lookup in POST /orders doesn't filter by outlet, but without knowing the table UUID, this is not practically exploitable. |

---

## REQUIRED FIXES

### P0 — Critical
(none)

### P1 — High
1. **F1:** Add authorization check on `price_type` parameter — restrict kasir to `ecceran` only
2. **F2:** Add business-rule limit on discount magnitude — require manager approval for discounts above threshold
3. **F3:** Change GET /payment-accounts to `require_permission("payment_accounts", "view")` or mask account_no
4. **F4:** Change GET /stock-transfers to `require_permission("transfers", "view")` or `require_role("owner", "admin", "manager", "supervisor")`
5. **F5:** Change GET /purchase-orders to `require_permission("purchase_orders", "view")` or `require_role("owner", "admin", "manager")`
6. **F6:** Change GET /suppliers to `require_permission("suppliers", "view")` or `require_role("owner", "admin", "manager")`
7. **F7:** Filter GET /outlets by user["outlet_ids"] for non-owners, or restrict to owner/admin

### P2 — Medium
8. **F8:** Change GET /coupons to `require_permission("coupons", "view")`
9. **F10:** Add outlet_id to customers table or restrict GET /customers
10. **F11:** Change GET /schedules to `require_permission("schedules", "view")`
11. **F12:** Change GET /stock-requests to `require_permission("stock_requests", "view")`

### P3 — Low
12. **F9:** Add strict type validation on monetary Pydantic fields
13. **F13:** Reject mutation requests with missing Origin/Referer in production
14. **F14:** Add `import json` to backend/routes/audit_logs.py

---

## FINAL VERDICT

```
SECURITY RED TEAM — HIGH-RISK VULNERABILITIES FOUND
```

The system does NOT have any CRITICAL vulnerabilities that allow direct cross-outlet write access, role escalation, or payment forgery. However, 7 HIGH findings exist that allow:

1. **Financial manipulation** — unauthorized price tiers (F1) and 100% discounts (F2) enable direct revenue loss
2. **Sensitive data exposure** — bank account numbers (F3), stock transfers (F4), purchase orders (F5), suppliers (F6), and all outlets (F7) are readable by any cashier

The system FAILS the security assessment because findings F1 and F2 permit financial manipulation, and F3-F7 permit cross-outlet data exposure — all by an authenticated cashier with no elevated privileges.
