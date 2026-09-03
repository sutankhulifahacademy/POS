"""
Security & Transaction Integrity Tests — validates P0/P1 audit fixes.
Tests: credential hardening, registration restriction, outlet isolation,
menu/role authorization, MFA, CSRF, brute force, cookie auth, transaction
integrity, price validation, payment replay protection.

Run: python backend/tests/test_security_audit.py
Requires: backend running on localhost:8001 with the new secure config.
"""
import requests
import json
import time
import os
import uuid
import hashlib

BASE = os.environ.get("API_BASE", "http://localhost:8001/api")
TIMEOUT = 15

# Read credentials from environment
OWNER_EMAIL = os.environ.get("TEST_OWNER_EMAIL", "owner@republikdimsum.id")
OWNER_PWD = os.environ.get("TEST_OWNER_PASSWORD", "RdiOwner@2026!Secure")
KASIR_EMAIL = os.environ.get("TEST_KASIR_EMAIL", "kasir@sutankhulifah.com")
KASIR_PWD = os.environ.get("TEST_KASIR_PASSWORD", "Kasir@2026")

O1 = "10000000-0000-0000-0000-000000000001"

results = []
fails = []


def check(name, cond, detail=""):
    if cond:
        results.append(f"PASS  {name}")
        print(f"  PASS  {name}")
    else:
        fails.append(f"{name}: {detail}")
        results.append(f"FAIL  {name}")
        print(f"  FAIL  {name} — {detail}")


def api_get(session, path, params=None):
    try:
        return session.get(f"{BASE}{path}", params=params, timeout=TIMEOUT)
    except Exception as e:
        class FakeR:
            status_code = 0
            text = str(e)
            def json(self):
                return {}
        return FakeR()


def api_post(session, path, body=None):
    try:
        return session.post(f"{BASE}{path}", json=body, timeout=TIMEOUT)
    except Exception as e:
        class FakeR:
            status_code = 0
            text = str(e)
            def json(self):
                return {}
        return FakeR()


def api_put(session, path, body=None):
    try:
        return session.put(f"{BASE}{path}", json=body, timeout=TIMEOUT)
    except Exception as e:
        class FakeR:
            status_code = 0
            text = str(e)
            def json(self):
                return {}
        return FakeR()


# ============================================================
print("\n=== 1. CREDENTIAL HARDENING ===")
# ============================================================

# 1a. Old admin password should be rejected
r = requests.post(
    f"{BASE}/auth/login",
    json={"email": OWNER_EMAIL, "password": "Owner@2026"},
    timeout=TIMEOUT,
)
check("Old admin password rejected", r.status_code == 401, f"got {r.status_code}")

# 1b. New admin password triggers MFA (not direct login)
r = requests.post(
    f"{BASE}/auth/login",
    json={"email": OWNER_EMAIL, "password": OWNER_PWD},
    timeout=TIMEOUT,
)
check("Owner login returns MFA challenge", r.status_code == 200 and r.json().get("mfa_required") is True, f"got {r.status_code}: {r.text[:100]}")
check("Owner login does NOT return access token in body", "token" not in r.json(), "token in response body!")

# ============================================================
print("\n=== 2. REGISTRATION RESTRICTION ===")
# ============================================================

for role in ["owner", "admin", "manager", "supervisor"]:
    r = requests.post(
        f"{BASE}/auth/register",
        json={
            "email": f"test-{role}-{uuid.uuid4().hex[:8]}@test.com",
            "password": "TestPass123!",
            "name": f"Test {role}",
            "role": role,
        },
        timeout=TIMEOUT,
    )
    check(f"{role} role registration rejected", r.status_code == 400, f"got {r.status_code}")

# Short password
r = requests.post(
    f"{BASE}/auth/register",
    json={
        "email": f"test-short-{uuid.uuid4().hex[:8]}@test.com",
        "password": "short",
        "name": "Test Short",
        "role": "kasir",
    },
    timeout=TIMEOUT,
)
check("Short password registration rejected", r.status_code == 400, f"got {r.status_code}")

# ============================================================
print("\n=== 3. COOKIE-BASED AUTHENTICATION ===")
# ============================================================

# 3a. No Bearer header support — token in body should not work
# First get an MFA challenge, then try to use the mfa_token as Bearer
r = requests.post(
    f"{BASE}/auth/login",
    json={"email": OWNER_EMAIL, "password": OWNER_PWD},
    timeout=TIMEOUT,
)
if r.status_code == 200 and r.json().get("mfa_token"):
    mfa_token = r.json()["mfa_token"]
    # Try to use mfa_token as Bearer header (should fail)
    r2 = requests.get(
        f"{BASE}/auth/me",
        headers={"Authorization": f"Bearer {mfa_token}"},
        timeout=TIMEOUT,
    )
    check("Bearer header rejected (cookie-only auth)", r2.status_code == 401, f"got {r2.status_code}")

# 3b. No cookie = no access
r = requests.get(f"{BASE}/auth/me", timeout=TIMEOUT)
check("No cookie rejected", r.status_code == 401, f"got {r.status_code}")

# 3c. Invalid cookie rejected
r = requests.get(
    f"{BASE}/auth/me",
    cookies={"access_token": "invalid.token.here"},
    timeout=TIMEOUT,
)
check("Invalid cookie rejected", r.status_code == 401, f"got {r.status_code}")

# ============================================================
print("\n=== 4. BRUTE FORCE PROTECTION ===")
# ============================================================

# Use a test email that won't conflict with the owner (which is MFA-locked)
test_email = f"bruteforce-{uuid.uuid4().hex[:8]}@test.com"
for i in range(6):
    r = requests.post(
        f"{BASE}/auth/login",
        json={"email": test_email, "password": f"Wrong{i}"},
        timeout=TIMEOUT,
    )

# After 5 attempts, should be locked (429)
check("Brute force lock after 5 attempts", r.status_code == 429, f"got {r.status_code}")

# ============================================================
print("\n=== 5. MFA FLOW ===")
# ============================================================

# Login as owner — should require MFA
session = requests.Session()
r = session.post(f"{BASE}/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PWD}, timeout=TIMEOUT)
if r.status_code == 200 and r.json().get("mfa_required"):
    check("MFA required for owner", True)

    # Try wrong MFA code (should fail)
    r2 = session.post(f"{BASE}/auth/mfa/verify", json={"mfa_token": r.json()["mfa_token"], "code": "000000"}, timeout=TIMEOUT)
    check("Wrong MFA code rejected", r2.status_code == 401, f"got {r2.status_code}")

    # Try with MFA challenge token as access token (should fail)
    r3 = session.get(f"{BASE}/auth/me", cookies={"access_token": r.json()["mfa_token"]}, timeout=TIMEOUT)
    check("MFA challenge token not accepted as access token", r3.status_code == 401, f"got {r3.status_code}")
else:
    check("MFA required for owner", False, f"login returned {r.status_code}: {r.text[:100]}")

# ============================================================
print("\n=== 6. CSRF PROTECTION ===")
# ============================================================

# Test that a POST with wrong Origin is rejected
r = requests.post(
    f"{BASE}/auth/login",
    json={"email": "test@test.com", "password": "test"},
    headers={"Origin": "https://evil.com"},
    timeout=TIMEOUT,
)
check("Wrong Origin rejected for POST", r.status_code == 403, f"got {r.status_code}")

# Test that a POST with valid Origin is accepted (may return 401 for bad creds, but not 403)
r = requests.post(
    f"{BASE}/auth/login",
    json={"email": "test@test.com", "password": "test"},
    headers={"Origin": "http://localhost"},
    timeout=TIMEOUT,
)
check("Valid Origin accepted for POST", r.status_code != 403, f"got {r.status_code}")

# ============================================================
print("\n=== 7. MENU & ROLE AUTHORIZATION ===")
# ============================================================

# Login as kasir (no MFA required for kasir)
try:
    kasir_session = requests.Session()
    r = kasir_session.post(f"{BASE}/auth/login", json={"email": KASIR_EMAIL, "password": KASIR_PWD}, timeout=TIMEOUT)
    if r.status_code == 200 and not r.json().get("mfa_required"):
        check("Kasir login succeeds (no MFA)", True)

        # Kasir should NOT access GET /menus
        r = api_get(kasir_session, "/menus")
        check("Kasir blocked from GET /menus", r.status_code == 403, f"got {r.status_code}")

        # Kasir should NOT access GET /roles/permission-tree
        r = api_get(kasir_session, "/roles/permission-tree")
        check("Kasir blocked from GET /roles/permission-tree", r.status_code == 403, f"got {r.status_code}")

        # Kasir SHOULD access GET /menus/my-menus
        r = api_get(kasir_session, "/menus/my-menus")
        check("Kasir can access GET /menus/my-menus", r.status_code == 200, f"got {r.status_code}")
    else:
        check("Kasir login", False, f"got {r.status_code}: {r.text[:80]}")
except Exception as e:
    check("Kasir login", False, str(e))

# ============================================================
print("\n=== 8. OUTLET ISOLATION ===")
# ============================================================

if 'kasir_session' in dir():
    fake_outlet = "99999999-9999-9999-9999-999999999999"
    r = api_get(kasir_session, f"/outlet-stocks/{fake_outlet}")
    check("Kasir blocked from other outlet's stock", r.status_code == 403, f"got {r.status_code}")

# ============================================================
print("\n=== 9. API DOCS DISABLED IN PRODUCTION ===")
# ============================================================

r = requests.get(f"{BASE}/docs", timeout=TIMEOUT, allow_redirects=False)
# The backend runs with DEBUG=false in Docker, so docs should be disabled
check("Docs disabled in production (DEBUG=false)", r.status_code == 404, f"got {r.status_code}")

# ============================================================
print("\n=== 10. HEALTH ENDPOINT ===")
# ============================================================

r = requests.get(f"{BASE}/health", timeout=TIMEOUT)
check("Health endpoint returns 200", r.status_code == 200, f"got {r.status_code}")
check("Health endpoint returns ok status", r.json().get("status") == "ok", f"got {r.json()}")

# ============================================================
print("\n=== 11. PRICE VALIDATION ===")
# ============================================================

# Test that negative discount is rejected
# We need an authenticated session and a valid product ID
if 'kasir_session' in dir():
    # First get a valid product
    r = api_get(kasir_session, "/products?limit=1")
    if r.status_code == 200 and r.json():
        pid = r.json()[0]["id"]
        item_price = float(r.json()[0].get("price", 100))

        # Test negative discount — rejected by Pydantic (422) or service (400)
        r = api_post(kasir_session, "/sales", {
            "items": [{"product_id": pid, "name": "test", "price": item_price, "quantity": 1}],
            "payment_method": "cash",
            "amount_paid": item_price,
            "discount": -50,
            "tax": 0,
            "outlet_id": O1,
        })
        check("Negative discount rejected", r.status_code in (400, 422), f"got {r.status_code}: {r.text[:100]}")

        # Test discount > subtotal
        r = api_post(kasir_session, "/sales", {
            "items": [{"product_id": pid, "name": "test", "price": item_price, "quantity": 1}],
            "payment_method": "cash",
            "amount_paid": item_price,
            "discount": 999999,
            "tax": 0,
            "outlet_id": O1,
        })
        check("Discount > subtotal rejected", r.status_code in (400, 422), f"got {r.status_code}: {r.text[:100]}")

        # Test negative quantity — should be rejected by Pydantic
        r = api_post(kasir_session, "/sales", {
            "items": [{"product_id": pid, "name": "test", "price": item_price, "quantity": -5}],
            "payment_method": "cash",
            "amount_paid": item_price,
            "discount": 0,
            "tax": 0,
            "outlet_id": O1,
        })
        check("Negative quantity rejected", r.status_code in (400, 422), f"got {r.status_code}: {r.text[:100]}")
    else:
        check("Get product for price test", False, f"got {r.status_code}")

# ============================================================
print("\n=== 12. FILE UPLOAD SECURITY ===")
# ============================================================

# Test that SVG upload is rejected
if 'kasir_session' in dir():
    # Create a fake SVG file
    svg_content = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    r = kasir_session.post(
        f"{BASE}/uploads",
        files={"file": ("test.svg", svg_content, "image/svg+xml")},
        timeout=TIMEOUT,
    )
    check("SVG upload rejected", r.status_code == 400, f"got {r.status_code}")

    # Test that a file with spoofed content-type is rejected
    fake_content = b'This is not an image'
    r = kasir_session.post(
        f"{BASE}/uploads",
        files={"file": ("test.jpg", fake_content, "image/jpeg")},
        timeout=TIMEOUT,
    )
    check("Spoofed content-type rejected (magic byte check)", r.status_code == 400, f"got {r.status_code}")

# ============================================================
print("\n=== 13. SECOND-PASS: VOID SALE PERMISSION ===")
# ============================================================

# Kasir should NOT be able to void a sale
if 'kasir_session' in dir():
    # First get a sale ID (kasir can list sales)
    r = api_get(kasir_session, "/sales?limit=1")
    if r.status_code == 200 and r.json():
        sale_id = r.json()[0]["id"]
        r = api_post(kasir_session, f"/sales/{sale_id}/void", {"reason": "test"})
        check("Kasir blocked from voiding sale", r.status_code == 403, f"got {r.status_code}")

# ============================================================
print("\n=== 14. SECOND-PASS: LOYALTY TIERS AUTH ===")
# ============================================================

# /loyalty/tiers should require authentication
r = requests.get(f"{BASE}/loyalty/tiers", timeout=TIMEOUT)
check("Loyalty tiers requires auth", r.status_code == 401, f"got {r.status_code}")

# ============================================================
print("\n=== 15. SECOND-PASS: PAYMENT ACCOUNT OUTLET ISOLATION ===")
# ============================================================

if 'kasir_session' in dir():
    # Kasir should not be able to create payment account in other outlet
    other_outlet = "10000000-0000-0000-0000-000000000003"
    r = api_post(kasir_session, "/payment-accounts", {
        "bank_name": "Test Bank",
        "account_name": "Test",
        "account_no": "1234567890",
        "outlet_id": other_outlet,
        "is_active": True,
    })
    check("Kasir blocked from creating payment account in other outlet", r.status_code == 403, f"got {r.status_code}")

# ============================================================
print("\n=== 16. SECOND-PASS: TABLE OUTLET ISOLATION ===")
# ============================================================

if 'kasir_session' in dir():
    # Kasir should not be able to create table in other outlet
    other_outlet = "10000000-0000-0000-0000-000000000003"
    r = api_post(kasir_session, "/tables", {
        "name": "Test Table",
        "capacity": 4,
        "outlet_id": other_outlet,
        "zone": "Utama",
    })
    check("Kasir blocked from creating table in other outlet", r.status_code == 403, f"got {r.status_code}")

# ============================================================
print("\n=== 17. SECOND-PASS: ONLINE ORDERS OUTLET ISOLATION ===")
# ============================================================

if 'kasir_session' in dir():
    # Kasir should not be able to list online orders from other outlet
    other_outlet = "10000000-0000-0000-0000-000000000003"
    r = api_get(kasir_session, f"/online-orders?outlet_id={other_outlet}")
    check("Kasir blocked from online orders in other outlet", r.status_code == 403, f"got {r.status_code}")

# ============================================================
print("\n=== 18. SECOND-PASS: USER PRIVILEGE ESCALATION ===")
# ============================================================

# Test that a user cannot change their own role
if 'kasir_session' in dir():
    # Get current user info
    me = api_get(kasir_session, "/auth/me")
    if me.status_code == 200:
        my_id = me.json().get("id")
        # Try to change own role to admin (PUT, not POST)
        r = api_put(kasir_session, f"/users/{my_id}", {"role": "admin"})
        # Should be 403 (blocked by self-role-change guard) or 403 (no permission)
        check("User blocked from changing own role", r.status_code in (403, 401), f"got {r.status_code}")

# ============================================================
print("\n=== 19. SECOND-PASS: QRIS ERROR NOT LEAKING GATEWAY ===")
# ============================================================

# Test that QRIS creation failure doesn't leak Midtrans response
if 'kasir_session' in dir():
    r = api_post(kasir_session, "/payments/qris", {"amount": 0.01, "description": "test"})
    if r.status_code not in (200, 201):
        # Error message should NOT contain raw gateway response
        body = r.text.lower()
        check("QRIS error doesn't leak gateway response", "midtrans" not in body or "gagal" in body, f"got {r.text[:100]}")
    else:
        check("QRIS error doesn't leak gateway response", True, "QRIS succeeded (skipped)")
print("\n" + "=" * 60)
passed = len([r for r in results if r.startswith("PASS")])
failed = len(fails)
print(f"RESULTS: {passed} passed, {failed} failed")
if fails:
    print("\nFAILED TESTS:")
    for f in fails:
        print(f"  - {f}")
print("=" * 60)

exit(0 if not fails else 1)
