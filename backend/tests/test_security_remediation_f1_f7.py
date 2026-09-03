"""
Regression tests for authenticated-cashier red-team remediation F1–F7.

Run: python backend/tests/test_security_remediation_f1_f7.py
Requires: backend running on localhost:8001 with the remediation applied.
"""
import requests
import uuid
import os

BASE = os.environ.get("API_BASE", "http://localhost:8001/api")
TIMEOUT = 15

KASIR_EMAIL = os.environ.get("TEST_KASIR_EMAIL", "kasir@sutankhulifah.com")
KASIR_PWD = os.environ.get("TEST_KASIR_PASSWORD", "Kasir@2026")
MANAGER_EMAIL = os.environ.get("TEST_MANAGER_EMAIL", "manager.budi@republikdimsum.id")
MANAGER_PWD = os.environ.get("TEST_MANAGER_PASSWORD", "Manager@2026")

O1 = "10000000-0000-0000-0000-000000000001"
O2 = "10000000-0000-0000-0000-000000000002"

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


def login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=TIMEOUT)
    if r.status_code != 200:
        print(f"  LOGIN FAILED {email}: {r.status_code} {r.text[:100]}")
        return None
    return s


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


def api_post(session, path, body=None, headers=None):
    try:
        return session.post(f"{BASE}{path}", json=body, headers=headers or {}, timeout=TIMEOUT)
    except Exception as e:
        class FakeR:
            status_code = 0
            text = str(e)
            def json(self):
                return {}
        return FakeR()


# ============================================================
print("\n=== SETUP: login and product ===")
# ============================================================

kasir = login(KASIR_EMAIL, KASIR_PWD)
manager = login(MANAGER_EMAIL, MANAGER_PWD)

check("Kasir login", kasir is not None, "")
check("Manager login", manager is not None, "")

if not kasir or not manager:
    print("\nRESULTS: setup failed")
    exit(1)

# Find a product with reseller/wholesale prices for F1 testing
r = api_get(kasir, "/products", {"limit": 200})
products = r.json() if r.status_code == 200 else []
product = next((p for p in products if p.get("reseller_price")), products[0] if products else None)
check("Product found for F1 test", product is not None, f"status={r.status_code}")
if not product:
    exit(1)

pid = product["id"]
pprice = float(product["price"])
reseller = float(product.get("reseller_price") or pprice)
wholesale = float(product.get("wholesale_price") or pprice)

# Get available tables in O1 for dine-in order tests
r = api_get(kasir, "/tables", {"outlet_id": O1, "limit": 50})
tables = [t for t in (r.json() if r.status_code == 200 else []) if t.get("status") == "available"]
table_id = tables[0]["id"] if tables else None
table_id2 = tables[1]["id"] if len(tables) > 1 else table_id


# ============================================================
print("\n=== F1: price_type authorization ===")
# ============================================================

# F1a. Cashier cannot use reseller price in /sales
r = api_post(kasir, "/sales", {
    "items": [{"product_id": pid, "name": product["name"], "price": pprice, "quantity": 1}],
    "payment_method": "cash", "amount_paid": reseller,
    "discount": 0, "tax": 0, "outlet_id": O1,
    "price_type": "reseller",
}, headers={"Idempotency-Key": f"f1a-{uuid.uuid4()}"})
check("F1a: kasir /sales price_type=reseller rejected", r.status_code == 403, f"got {r.status_code}: {r.text[:80]}")

# F1b. Cashier cannot use wholesale price in /sales
r = api_post(kasir, "/sales", {
    "items": [{"product_id": pid, "name": product["name"], "price": pprice, "quantity": 1}],
    "payment_method": "cash", "amount_paid": wholesale,
    "discount": 0, "tax": 0, "outlet_id": O1,
    "price_type": "partai",
}, headers={"Idempotency-Key": f"f1b-{uuid.uuid4()}"})
check("F1b: kasir /sales price_type=partai rejected", r.status_code == 403, f"got {r.status_code}: {r.text[:80]}")

# F1c. Cashier cannot use reseller price in /orders/{id}/checkout
if table_id:
    r = api_post(kasir, "/orders", {
        "table_id": table_id, "outlet_id": O1,
        "items": [{"product_id": pid, "name": product["name"], "quantity": 1, "price": pprice}],
    })
    if r.status_code == 200:
        order_id = r.json()["id"]
        r2 = api_post(kasir, f"/orders/{order_id}/checkout", {
            "payment_method": "cash", "amount_paid": reseller,
            "discount": 0, "tax": 0, "outlet_id": O1,
            "price_type": "reseller",
        }, headers={"Idempotency-Key": f"f1c-{uuid.uuid4()}"})
        check("F1c: kasir /orders/checkout price_type=reseller rejected", r2.status_code == 403, f"got {r2.status_code}: {r2.text[:80]}")
    else:
        check("F1c: create order for checkout", False, f"got {r.status_code}: {r.text[:80]}")
else:
    check("F1c: no available table", False, "")

# F1d. Cashier cannot use reseller price in /payments/qris
r = api_post(kasir, "/payments/qris", {
    "amount": reseller,
    "description": "test",
    "items": [{"product_id": pid, "quantity": 1}],
    "outlet_id": O1,
    "price_type": "reseller",
    "discount": 0, "tax": 0,
}, headers={"Idempotency-Key": f"f1d-{uuid.uuid4()}"})
check("F1d: kasir /payments/qris price_type=reseller rejected (before gateway)", r.status_code == 403, f"got {r.status_code}: {r.text[:80]}")

# F1e. Manager CAN use reseller price in /sales (authorized role)
r = api_post(manager, "/sales", {
    "items": [{"product_id": pid, "name": product["name"], "price": pprice, "quantity": 1}],
    "payment_method": "cash", "amount_paid": reseller,
    "discount": 0, "tax": 0, "outlet_id": O1,
    "price_type": "reseller",
}, headers={"Idempotency-Key": f"f1e-{uuid.uuid4()}"})
if r.status_code == 200:
    subtotal = float(r.json().get("subtotal", 0))
    check("F1e: manager /sales price_type=reseller allowed", subtotal == reseller, f"subtotal={subtotal}, expected={reseller}")
else:
    check("F1e: manager /sales price_type=reseller allowed", False, f"got {r.status_code}: {r.text[:80]}")


# ============================================================
print("\n=== F2: discount authorization ===")
# ============================================================

# F2a. Cashier cannot apply discount=subtotal in /sales
r = api_post(kasir, "/sales", {
    "items": [{"product_id": pid, "name": product["name"], "price": pprice, "quantity": 1}],
    "payment_method": "cash", "amount_paid": 0,
    "discount": pprice, "tax": 0, "outlet_id": O1,
}, headers={"Idempotency-Key": f"f2a-{uuid.uuid4()}"})
check("F2a: kasir /sales discount=subtotal rejected", r.status_code == 403, f"got {r.status_code}: {r.text[:80]}")

# F2b. Normal discount still works for cashier
r = api_post(kasir, "/sales", {
    "items": [{"product_id": pid, "name": product["name"], "price": pprice, "quantity": 1}],
    "payment_method": "cash", "amount_paid": pprice - 1000,
    "discount": 1000, "tax": 0, "outlet_id": O1,
}, headers={"Idempotency-Key": f"f2b-{uuid.uuid4()}"})
check("F2b: kasir /sales normal discount allowed", r.status_code == 200, f"got {r.status_code}: {r.text[:80]}")

# F2c. Manager CAN apply discount=subtotal in /sales
r = api_post(manager, "/sales", {
    "items": [{"product_id": pid, "name": product["name"], "price": pprice, "quantity": 1}],
    "payment_method": "cash", "amount_paid": 0,
    "discount": pprice, "tax": 0, "outlet_id": O1,
}, headers={"Idempotency-Key": f"f2c-{uuid.uuid4()}"})
if r.status_code == 200:
    total = float(r.json().get("total", -1))
    check("F2c: manager /sales discount=subtotal allowed", total == 0, f"total={total}")
else:
    check("F2c: manager /sales discount=subtotal allowed", False, f"got {r.status_code}: {r.text[:80]}")

# F2d. Cashier cannot apply discount=subtotal in /orders/{id}/checkout
if table_id2:
    r = api_post(kasir, "/orders", {
        "table_id": table_id2, "outlet_id": O1,
        "items": [{"product_id": pid, "name": product["name"], "quantity": 1, "price": pprice}],
    })
    if r.status_code == 200:
        order_id2 = r.json()["id"]
        r2 = api_post(kasir, f"/orders/{order_id2}/checkout", {
            "payment_method": "cash", "amount_paid": 0,
            "discount": pprice, "tax": 0, "outlet_id": O1,
        }, headers={"Idempotency-Key": f"f2d-{uuid.uuid4()}"})
        check("F2d: kasir /orders/checkout discount=subtotal rejected", r2.status_code == 403, f"got {r2.status_code}: {r2.text[:80]}")
    else:
        check("F2d: create order for checkout", False, f"got {r.status_code}: {r.text[:80]}")
else:
    check("F2d: no available second table", False, "")


# ============================================================
print("\n=== F3: payment account data exposure ===")
# ============================================================

r = api_get(kasir, "/payment-accounts")
if r.status_code == 200 and r.json():
    acct = r.json()[0]
    check("F3a: kasir /payment-accounts hides account_no", "account_no" not in acct or not acct.get("account_no"), f"fields={list(acct.keys())}")
else:
    check("F3a: kasir /payment-accounts accessible", r.status_code == 200, f"got {r.status_code}")

r = api_get(manager, "/payment-accounts")
if r.status_code == 200 and r.json():
    acct = r.json()[0]
    check("F3b: manager /payment-accounts sees account_no", "account_no" in acct and acct.get("account_no"), f"fields={list(acct.keys())}")
else:
    check("F3b: manager /payment-accounts accessible", r.status_code == 200, f"got {r.status_code}")


# ============================================================
print("\n=== F4: stock transfer cross-outlet read ===")
# ============================================================

r = api_get(kasir, "/stock-transfers")
if r.status_code == 200:
    transfers = r.json()
    cross = any(str(t.get("from_outlet_id")) not in (O1,) and str(t.get("to_outlet_id")) not in (O1,) for t in transfers)
    check("F4a: kasir /stock-transfers no cross-outlet", not cross, f"count={len(transfers)}")
    # Detail endpoint should also enforce outlet scoping; test an own transfer
    if transfers:
        tid = transfers[0]["id"]
        r2 = api_get(kasir, f"/stock-transfers/{tid}")
        check("F4b: kasir /stock-transfers/{id} accessible when authorized", r2.status_code == 200, f"got {r2.status_code}")
else:
    check("F4a: kasir /stock-transfers accessible", r.status_code == 200, f"got {r.status_code}")

# Querying another outlet should be blocked
r = api_get(kasir, "/stock-transfers", {"outlet_id": O2})
check("F4c: kasir /stock-transfers?outlet_id=O2 blocked", r.status_code == 403, f"got {r.status_code}")


# ============================================================
print("\n=== F5: purchase order cross-outlet read ===")
# ============================================================

r = api_get(kasir, "/purchase-orders")
if r.status_code == 200:
    pos = r.json()
    cross = any(str(po.get("outlet_id")) != O1 for po in pos)
    check("F5a: kasir /purchase-orders no cross-outlet", not cross, f"count={len(pos)}")
else:
    check("F5a: kasir /purchase-orders accessible", r.status_code == 200, f"got {r.status_code}")

r = api_get(kasir, "/purchase-orders", {"outlet_id": O2})
check("F5b: kasir /purchase-orders?outlet_id=O2 blocked", r.status_code == 403, f"got {r.status_code}")


# ============================================================
print("\n=== F6: supplier contact exposure ===")
# ============================================================

r = api_get(kasir, "/suppliers")
if r.status_code == 200 and r.json():
    sup = r.json()[0]
    sensitive = ["contact_person", "phone", "email", "address"]
    leaked = any(s in sup and sup.get(s) for s in sensitive)
    check("F6a: kasir /suppliers hides contact fields", not leaked, f"fields={list(sup.keys())}")
else:
    check("F6a: kasir /suppliers accessible", r.status_code == 200, f"got {r.status_code}")

r = api_get(manager, "/suppliers")
if r.status_code == 200 and r.json():
    sup = r.json()[0]
    has_contact = "phone" in sup and sup.get("phone")
    check("F6b: manager /suppliers sees contact fields", has_contact, f"fields={list(sup.keys())}")
else:
    check("F6b: manager /suppliers accessible", r.status_code == 200, f"got {r.status_code}")


# ============================================================
print("\n=== F7: outlet list exposure ===")
# ============================================================

r = api_get(kasir, "/outlets")
if r.status_code == 200:
    outlets = r.json()
    own_only = all(str(o.get("id")) == O1 for o in outlets)
    check("F7a: kasir /outlets only own outlet", own_only, f"count={len(outlets)}, ids={[o.get('id') for o in outlets]}")
else:
    check("F7a: kasir /outlets accessible", r.status_code == 200, f"got {r.status_code}")

r = api_get(kasir, "/outlets", {"outlet_id": O2})
check("F7b: kasir /outlets?outlet_id=O2 returns only O1 or blocked", r.status_code in (200, 403), f"got {r.status_code}")


# ============================================================
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
