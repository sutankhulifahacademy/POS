"""
Multi-price POS regression tests.

Run: docker exec rdi-backend python /app/tests/test_multi_price_pos.py
Requires: backend running on localhost:8001 with the multi-price feature.
"""
import requests
import uuid
import os

BASE = os.environ.get("API_BASE", "http://localhost:8001/api")
TIMEOUT = 15

MANAGER_EMAIL = os.environ.get("TEST_MANAGER_EMAIL", "manager.budi@republikdimsum.id")
MANAGER_PWD = os.environ.get("TEST_MANAGER_PASSWORD", "Manager@2026")
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


def login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=TIMEOUT)
    if r.status_code != 200:
        print(f"  LOGIN FAILED {email}: {r.status_code} {r.text[:100]}")
        return None
    return s


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


print("\n=== SETUP: login ===")

mgr = login(MANAGER_EMAIL, MANAGER_PWD)
kasir = login(KASIR_EMAIL, KASIR_PWD)

check("Manager login", mgr is not None, "")
check("Kasir login", kasir is not None, "")

if not mgr or not kasir:
    print("\nRESULTS: setup failed")
    exit(1)

# Get an existing product with all prices for positive tests
r = mgr.get(f"{BASE}/products?limit=200", timeout=TIMEOUT)
products = r.json() if r.status_code == 200 else []
product = next((p for p in products if p.get("reseller_price") and p.get("wholesale_price")), products[0] if products else None)
check("Product with reseller + wholesale found", product is not None, f"status={r.status_code}")
if not product:
    exit(1)

pid = product["id"]
retail = float(product["price"])
reseller = float(product.get("reseller_price") or retail)
wholesale = float(product.get("wholesale_price") or retail)

# Find a product with only price (no reseller/wholesale) for negative tests
basic = next((p for p in products if p.get("reseller_price") is None and p.get("wholesale_price") is None), None)
if not basic:
    # create is complex; just skip negative tests if no basic product
    print("  No basic-only product; some negative tests will be skipped")


print("\n=== CANONICAL PRICE MAPPING ===")

# 1. Retail (ecceran) uses products.price
r = api_post(mgr, "/sales", {
    "outlet_id": O1,
    "items": [{"product_id": pid, "name": product["name"], "price": 1, "quantity": 1}],
    "payment_method": "cash", "amount_paid": retail,
    "discount": 0, "tax": 0,
    "sales_channel": "offline", "price_type": "ecceran",
}, headers={"Idempotency-Key": f"mp-ecceran-{uuid.uuid4()}"})
if r.status_code == 200:
    item = r.json()["items"][0]
    check("Eceran -> products.price", float(item["price"]) == retail, f"got {item['price']}, expected {retail}")
    check("Eceran price_type persisted", item.get("price_type") == "ecceran", f"got {item.get('price_type')}")
else:
    check("Eceran sale", False, f"got {r.status_code}: {r.text[:100]}")

# 2. Reseller uses products.reseller_price
r = api_post(mgr, "/sales", {
    "outlet_id": O1,
    "items": [{"product_id": pid, "name": product["name"], "price": 1, "quantity": 1}],
    "payment_method": "cash", "amount_paid": reseller,
    "discount": 0, "tax": 0,
    "sales_channel": "offline", "price_type": "reseller",
}, headers={"Idempotency-Key": f"mp-reseller-{uuid.uuid4()}"})
if r.status_code == 200:
    item = r.json()["items"][0]
    check("Reseller -> products.reseller_price", float(item["price"]) == reseller, f"got {item['price']}, expected {reseller}")
    check("Reseller price_type persisted", item.get("price_type") == "reseller", f"got {item.get('price_type')}")
else:
    check("Reseller sale", False, f"got {r.status_code}: {r.text[:100]}")

# 3. Wholesale uses products.wholesale_price
r = api_post(mgr, "/sales", {
    "outlet_id": O1,
    "items": [{"product_id": pid, "name": product["name"], "price": 1, "quantity": 1}],
    "payment_method": "cash", "amount_paid": wholesale,
    "discount": 0, "tax": 0,
    "sales_channel": "offline", "price_type": "partai",
}, headers={"Idempotency-Key": f"mp-partai-{uuid.uuid4()}"})
if r.status_code == 200:
    item = r.json()["items"][0]
    check("Wholesale -> products.wholesale_price", float(item["price"]) == wholesale, f"got {item['price']}, expected {wholesale}")
    check("Wholesale price_type persisted", item.get("price_type") == "partai", f"got {item.get('price_type')}")
else:
    check("Wholesale sale", False, f"got {r.status_code}: {r.text[:100]}")


print("\n=== NULL PRICE REJECTION ===")

if basic:
    bid = basic["id"]
    bretail = float(basic["price"])

    # 4. Reseller when NULL -> reject
    r = api_post(mgr, "/sales", {
        "outlet_id": O1,
        "items": [{"product_id": bid, "name": basic["name"], "price": 1, "quantity": 1}],
        "payment_method": "cash", "amount_paid": bretail,
        "discount": 0, "tax": 0,
        "sales_channel": "offline", "price_type": "reseller",
    }, headers={"Idempotency-Key": f"mp-null-reseller-{uuid.uuid4()}"})
    check("Reseller NULL -> 422", r.status_code == 422, f"got {r.status_code}: {r.text[:100]}")

    # 5. Wholesale when NULL -> reject
    r = api_post(mgr, "/sales", {
        "outlet_id": O1,
        "items": [{"product_id": bid, "name": basic["name"], "price": 1, "quantity": 1}],
        "payment_method": "cash", "amount_paid": bretail,
        "discount": 0, "tax": 0,
        "sales_channel": "offline", "price_type": "partai",
    }, headers={"Idempotency-Key": f"mp-null-partai-{uuid.uuid4()}"})
    check("Wholesale NULL -> 422", r.status_code == 422, f"got {r.status_code}: {r.text[:100]}")
else:
    check("Reseller NULL -> 422", False, "no basic-only product")
    check("Wholesale NULL -> 422", False, "no basic-only product")


print("\n=== AUTHORIZATION ===")

# 6. Cashier cannot use reseller
r = api_post(kasir, "/sales", {
    "outlet_id": O1,
    "items": [{"product_id": pid, "name": product["name"], "price": 1, "quantity": 1}],
    "payment_method": "cash", "amount_paid": reseller,
    "discount": 0, "tax": 0,
    "sales_channel": "offline", "price_type": "reseller",
}, headers={"Idempotency-Key": f"mp-auth-reseller-{uuid.uuid4()}"})
check("Kasir reseller -> 403", r.status_code == 403, f"got {r.status_code}: {r.text[:100]}")

# 7. Cashier can use retail
r = api_post(kasir, "/sales", {
    "outlet_id": O1,
    "items": [{"product_id": pid, "name": product["name"], "price": 1, "quantity": 1}],
    "payment_method": "cash", "amount_paid": retail,
    "discount": 0, "tax": 0,
    "sales_channel": "offline", "price_type": "ecceran",
}, headers={"Idempotency-Key": f"mp-auth-ecceran-{uuid.uuid4()}"})
check("Kasir eceran -> 200", r.status_code == 200, f"got {r.status_code}: {r.text[:100]}")


print("\n=== FRONTEND PRICE MANIPULATION ===")

# 8. Frontend price ignored, backend resolves
r = api_post(mgr, "/sales", {
    "outlet_id": O1,
    "items": [{"product_id": pid, "name": product["name"], "price": 1, "quantity": 1}],
    "payment_method": "cash", "amount_paid": reseller,
    "discount": 0, "tax": 0,
    "sales_channel": "offline", "price_type": "reseller",
}, headers={"Idempotency-Key": f"mp-manip-{uuid.uuid4()}"})
if r.status_code == 200:
    item = r.json()["items"][0]
    check("Frontend unit price ignored", float(item["price"]) == reseller, f"got {item['price']}, submitted 1")
else:
    check("Frontend unit price ignored", False, f"got {r.status_code}: {r.text[:100]}")


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
