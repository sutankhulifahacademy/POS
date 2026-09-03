# Security Changelog — Republik Dimsum Imperium POS

## Calculation Engine Audit (2026-02-09)

| Date | Severity | Finding | Root Cause | Fix | Test | Status |
|------|----------|---------|------------|-----|------|--------|
| 2026-02-09 | CRITICAL | Float arithmetic with no rounding in sale total | Python float can produce 999.99999999 instead of 1000.00 | Added `round(..., 2)` to all money calculations | Golden test #20 | FIXED |
| 2026-02-09 | CRITICAL | Duplicate total calculation in orders.py and sales_service.py | Two separate implementations of the same formula | Centralized: orders.py now uses `_validate_sale_total` from sales_service | Golden test #4 | FIXED |
| 2026-02-09 | CRITICAL | Duplicate payment validation in orders.py and sales_service.py | Two separate implementations of payment logic | Centralized: orders.py now uses `_validate_payment` from sales_service | Golden test #14, #15 | FIXED |
| 2026-02-09 | HIGH | `_calc_total` had no rounding | `sum(float(price) * int(qty))` could drift | Added `round(..., 2)` to `_calc_total` | Golden test #20 | FIXED |
| 2026-02-09 | HIGH | No CHECK constraints on money columns | Schema had no data integrity constraints | Added 12 CHECK constraints (price>=0, total>=0, etc.) | DB migration applied | FIXED |
| 2026-02-09 | HIGH | Discount/tax stored as raw frontend values without rounding | `body.discount` and `body.tax` used directly in INSERT | Added `round(float(...), 2)` before persistence | Golden test #3, #4 | FIXED |
| 2026-02-09 | MEDIUM | QRIS amount divergence risk | Frontend total sent to Midtrans before sale creation | Documented as remaining risk | — | DOCUMENTED |
| 2026-02-09 | MEDIUM | COGS not versioned | Reports use current `products.cost` not historical | Documented as remaining risk | — | DOCUMENTED |
| 2026-02-09 | MEDIUM | Report revenue mismatch with item-level recalculation | `SUM(sales.total)` vs `SUM(item.price*qty)` differ with discount/tax | Documented as expected behavior | — | DOCUMENTED |

## Second-Pass Audit (2026-02-09)

| Date | Severity | Finding | Root Cause | Fix | Test | Status |
|------|----------|---------|------------|-----|------|--------|
| 2026-02-09 | CRITICAL | void_sale missing permission check | `sales.py` void used `get_current_user` only | Changed to `require_role("owner","admin","manager","supervisor")` | test #13 | FIXED |
| 2026-02-09 | CRITICAL | Orders checkout IDOR — order outlet not validated | `orders.py` checkout only validated `body.outlet_id`, not `order.outlet_id` | Added outlet authorization check on order's own `outlet_id` | Code review | FIXED |
| 2026-02-09 | CRITICAL | Negative quantity accepted in orders/transfers/POs | Pydantic models had no `Field(ge=1)` constraints | Added `Field(..., ge=1)` to all quantity fields; `Field(..., ge=0)` to price/cost/discount/tax | test #11 | FIXED |
| 2026-02-09 | HIGH | /loyalty/tiers endpoint had no authentication | `loyalty.py` get_tier_info had no `Depends` | Added `user=Depends(get_current_user)` | test #14 | FIXED |
| 2026-02-09 | HIGH | create_payment_account missing outlet validation | `payment_accounts.py` create didn't check `body.outlet_id` | Added outlet access validation for create and update | test #15 | FIXED |
| 2026-02-09 | HIGH | create_table/update_table missing outlet validation | `tables.py` create/update didn't check `body.outlet_id` | Added outlet access validation for create and update | test #16 | FIXED |
| 2026-02-09 | HIGH | merge_tables missing rowcount checks | `orders.py` merge didn't check if UPDATE affected 0 rows | Added rowcount checks on both source and target UPDATEs | Code review | FIXED |
| 2026-02-09 | HIGH | move-table missing status='open' guard in UPDATE | `orders.py` move-table UPDATE had no `AND status='open'` | Added status guard and rowcount check | Code review | FIXED |
| 2026-02-09 | HIGH | split-checkout non-atomic | `orders.py` split-checkout used auto-commit `q_exec` | Wrapped in `transaction()` with rowcount check | Code review | FIXED |
| 2026-02-09 | HIGH | online_orders list IDOR — outlet_id not validated | `_outlet_filter` returned filter without access check | Added `validate_outlet_access` when `outlet_id` is provided | test #17 | FIXED |
| 2026-02-09 | HIGH | User privilege escalation — self-role-change | `users.py` update didn't prevent changing own role | Added self-role-change guard + owner protection + outlet validation | test #18 | FIXED |
| 2026-02-09 | HIGH | User privilege escalation — non-owner can reset owner password | `users.py` reset_pw had no target role check | Added target role check — only owner can reset owner password | Code review | FIXED |
| 2026-02-09 | HIGH | business.py action mismatch | Used `settings.manage` which doesn't exist in seeds | Changed to `settings.update` | Code review | FIXED |
| 2026-02-09 | HIGH | POS double-submit guard incomplete | `checkout()` had no `if (processing) return` guard | Added guard at top of `checkout` and `finalizeSale` | Code review | FIXED |
| 2026-02-09 | HIGH | Tables double-submit guard incomplete | `onQRISSuccess` had no guard; "Bayar Sekarang" ignored `processing` | Added guard to `onQRISSuccess`; added `processing` to button disabled | Code review | FIXED |
| 2026-02-09 | MEDIUM | payments.py leaked raw Midtrans gateway response | `r.text` passed directly to `HTTPException` | Replaced with generic error message | test #19 | FIXED |
| 2026-02-09 | MEDIUM | Console.error leaking order/payment data | `Tables.js` logged `err.response?.data` and `orderItems` | Removed console.error calls | Code review | FIXED |
| 2026-02-09 | MEDIUM | Missing permission seeds for expenses, payroll, schedules, loyalty, receipt, kds, online_platforms | `seed_roles.sql` didn't include these modules | Added all missing modules to admin, manager, and kasir seeds | DB seed applied | FIXED |
| 2026-02-09 | MEDIUM | TransferIn missing from_outlet_id != to_outlet_id validation | `inventory.py` TransferIn had no model validator | Added `@model_validator` to reject same-outlet transfers and empty items | Code review | FIXED |
| 2026-02-09 | LOW | Sales idempotency cache is in-process (not shared across workers) | `sales.py` uses module-level dict | Documented as remaining risk — single-worker deployment is sufficient | — | DOCUMENTED |
| 2026-02-09 | LOW | QRIS creation has no idempotency key | `payments.py` generates new order_id per request | Documented as remaining risk — requires Midtrans integration change | — | DOCUMENTED |
| 2026-02-09 | LOW | Stock transfer item check is non-atomic | `stock_transfers.py` check uses auto-commit | Documented as remaining risk — not a duplicate-stock bug | — | DOCUMENTED |

## First-Pass Audit (2026-02-08)

| Date | Severity | Finding | Root Cause | Fix | Test | Status |
|------|----------|---------|------------|-----|------|--------|
| 2026-02-08 | CRITICAL | JWT token returned in login response body | `auth.py` login/register returned `token` field | Removed `token` from response; HttpOnly cookie only | test_security_audit.py #3 | FIXED |
| 2026-02-08 | CRITICAL | JWT stored in localStorage (XSS-vulnerable) | `AuthContext.js` stored token in `localStorage.sk_token` | Removed localStorage; cookie-only auth | Bundle scan — no setItem token | FIXED |
| 2026-02-08 | CRITICAL | Bearer header accepted (bypasses cookie security) | `get_current_user` accepted `Authorization: Bearer` | Removed Bearer header support; cookie-only | test_security_audit.py #3 | FIXED |
| 2026-02-08 | CRITICAL | No MFA for privileged roles | Login granted immediate access to owner/admin | Added TOTP-based MFA for owner/admin; 5-min challenge token | test_security_audit.py #5 | FIXED |
| 2026-02-08 | CRITICAL | No brute force protection | Login had no rate limiting | Added 5-attempt lockout with 15-min cooldown | test_security_audit.py #4 | FIXED |
| 2026-02-08 | CRITICAL | SameSite=None on auth cookie | Cookie set with `samesite="none"` | Changed to `samesite="lax"` for CSRF protection | Manual verification | FIXED |
| 2026-02-08 | HIGH | No CSRF protection | No Origin/Referer validation | Added CSRF middleware for POST/PUT/PATCH/DELETE | test_security_audit.py #6 | FIXED |
| 2026-02-08 | HIGH | Discount/tax trusted from frontend | `sales_service.py` accepted any discount/tax | Added server-side validation: no negative, no > subtotal | test_security_audit.py #11 | FIXED |
| 2026-02-08 | HIGH | Discount/tax trusted in checkout | `orders.py` checkout accepted body.discount/tax | Added same validation as sales service | Code review | FIXED |
| 2026-02-08 | HIGH | SVG upload allowed (stored XSS) | `uploads.py` allowed `image/svg+xml` | Removed SVG from allowed types | test_security_audit.py #12 | FIXED |
| 2026-02-08 | HIGH | Upload content-type spoofing | Only `file.content_type` checked | Added magic-byte validation | test_security_audit.py #12 | FIXED |
| 2026-02-08 | HIGH | API docs exposed in production | FastAPI default docs enabled | Disabled docs/redoc/openapi when DEBUG=false | test_security_audit.py #9 | FIXED |
| 2026-02-08 | HIGH | No global exception handler | Unhandled exceptions could leak info | Added global handler returning safe error message | Manual test | FIXED |
| 2026-02-08 | HIGH | PostgreSQL exposed to host | `docker-compose.yml` mapped port 5433 | Removed port mapping; internal network only | docker-compose review | FIXED |
| 2026-02-08 | HIGH | Backend exposed directly to host | `docker-compose.yml` mapped port 8001 | Bound to 127.0.0.1 only; traffic via Nginx | docker-compose review | FIXED |
| 2026-02-08 | HIGH | Container runs as root | No USER directive in Dockerfile | Multi-stage build with non-root `appuser` | Dockerfile review | FIXED |
| 2026-02-08 | HIGH | Build tools in runtime image | `build-essential` and `curl` in final image | Multi-stage build; runtime has only `libpq5` | Dockerfile review | FIXED |
| 2026-02-08 | MEDIUM | No security headers in Nginx | `nginx.conf` had no security headers | Added CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy | nginx.conf review | FIXED |
| 2026-02-08 | MEDIUM | Nginx version leaked | No `server_tokens off` | Added `server_tokens off` | nginx.conf review | FIXED |
| 2026-02-08 | MEDIUM | QRIS webhook replay possible | No replay protection beyond status check | Added conditional UPDATE + amount validation | Code review | FIXED |
| 2026-02-08 | MEDIUM | QRIS amount fully client-controlled | `payments.py` trusted `body.amount` | Documented as remaining risk (requires Midtrans integration change) | — | DOCUMENTED |
| 2026-02-08 | MEDIUM | Uptime Kuma exposed to all interfaces | `docker-compose.yml` mapped 3001 to 0.0.0.0 | Bound to 127.0.0.1 only | docker-compose review | FIXED |
| 2026-02-08 | MEDIUM | Cookie secure=True on HTTP dev | Cookie not sent over HTTP in development | Made COOKIE_SECURE conditional on environment | Manual test | FIXED |
| 2026-02-08 | MEDIUM | User enumeration via login error | Different errors for invalid email vs invalid password | Unified error message: "Email atau password salah" | test_security_audit.py #1 | FIXED |
| 2026-02-08 | LOW | WebSocket accepts before auth | `realtime.py` accepted connection before token | Documented as remaining risk | — | DOCUMENTED |
| 2026-02-08 | LOW | Build tools in runtime image | `build-essential` left in final image | Multi-stage build removes build deps | Dockerfile review | FIXED |
| 2026-02-08 | LOW | Nginx proxy passes Authorization header | `nginx.conf` forwarded `Authorization` header | Removed (cookie-only auth, no Bearer header) | nginx.conf review | FIXED |
| 2026-02-08 | LOW | WebSocket timeout 7 days | `nginx.conf` had 7d proxy timeouts | Reduced to 300s | nginx.conf review | FIXED |
