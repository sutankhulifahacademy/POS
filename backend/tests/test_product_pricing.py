"""
Acceptance tests for Product Additional Pricing feature.
Tests the 6 acceptance scenarios from the requirement:
  1. Existing flow still uses existing price
  2. Offline + Eceran → retail_price
  3. Offline + Reseller → reseller_price
  4. Offline + Partai → wholesale_price
  5. Online channel → online_price
  6. Existing price unchanged after all tests
"""
import requests
import uuid

BASE = "http://localhost:8001/api"
TIMEOUT = 30


def login(email, pwd):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": pwd}, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()["token"]


def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def main():
    token = login("owner@republikdimsum.id", "Owner@2026")
    h = auth_headers(token)

    # Get outlets — use main outlet so outlet stock is auto-initialized
    outlets = requests.get(f"{BASE}/outlets", headers=h, timeout=TIMEOUT).json()
    main_outlet = [o for o in outlets if o.get("is_main")][0]
    outlet_id = main_outlet["id"]
    print(f"Using outlet: {main_outlet['name']}")

    # Create test product with additional pricing
    test_sku = f"TEST-PRC-{uuid.uuid4().hex[:8].upper()}"
    create_body = {
        "name": "Test Pricing Product",
        "sku": test_sku,
        "barcode": "",
        "category_id": "",
        "price": 25000,           # EXISTING price
        "cost": 15000,
        "stock": 100,
        "unit": "pcs",
        "is_active": True,
        "variants": [],
        "product_type": "frozen",
        "retail_price": 25000,
        "reseller_price": 23000,
        "wholesale_price": 21000,
        "online_price": 27000,
    }
    r = requests.post(f"{BASE}/products", json=create_body, headers=h, timeout=TIMEOUT)
    assert r.status_code == 200, f"Create product failed: {r.status_code} {r.text}"
    product = r.json()
    pid = product["id"]
    print(f"Created product: {pid} (SKU: {test_sku})")
    print(f"  existing price: {product['price']}")
    print(f"  retail: {product['retail_price']}")
    print(f"  reseller: {product['reseller_price']}")
    print(f"  wholesale: {product['wholesale_price']}")
    print(f"  online: {product['online_price']}")

    results = []

    # =========================================================
    # TEST 1: Existing flow (no channel/price_type) → existing price
    # =========================================================
    sale_body = {
        "outlet_id": outlet_id,
        "items": [{"product_id": pid, "name": "Test", "price": 99999, "quantity": 1}],
        "payment_method": "cash",
        "amount_paid": 999999,
    }
    r = requests.post(f"{BASE}/sales", json=sale_body, headers=h, timeout=TIMEOUT)
    assert r.status_code == 200, f"Test 1 sale failed: {r.status_code} {r.text}"
    sale = r.json()
    item_price = float(sale["items"][0]["price"])
    expected = 25000.0
    assert item_price == expected, f"TEST 1 FAIL: expected {expected}, got {item_price}"
    print(f"TEST 1 (Existing/Eceran): {item_price} == {expected} ✓")
    results.append(("TEST 1 — Existing flow", item_price == expected))

    # =========================================================
    # TEST 2: Offline + Eceran → retail_price
    # =========================================================
    sale_body = {
        "outlet_id": outlet_id,
        "items": [{"product_id": pid, "name": "Test", "price": 99999, "quantity": 1}],
        "payment_method": "cash",
        "amount_paid": 999999,
        "sales_channel": "offline",
        "price_type": "ecceran",
    }
    r = requests.post(f"{BASE}/sales", json=sale_body, headers=h, timeout=TIMEOUT)
    assert r.status_code == 200, f"Test 2 sale failed: {r.status_code} {r.text}"
    sale = r.json()
    item_price = float(sale["items"][0]["price"])
    expected = 25000.0
    assert item_price == expected, f"TEST 2 FAIL: expected {expected}, got {item_price}"
    print(f"TEST 2 (Offline+Eceran): {item_price} == {expected} ✓")
    results.append(("TEST 2 — Offline + Eceran", item_price == expected))

    # =========================================================
    # TEST 3: Offline + Reseller → reseller_price
    # =========================================================
    sale_body = {
        "outlet_id": outlet_id,
        "items": [{"product_id": pid, "name": "Test", "price": 99999, "quantity": 1}],
        "payment_method": "cash",
        "amount_paid": 999999,
        "sales_channel": "offline",
        "price_type": "reseller",
    }
    r = requests.post(f"{BASE}/sales", json=sale_body, headers=h, timeout=TIMEOUT)
    assert r.status_code == 200, f"Test 3 sale failed: {r.status_code} {r.text}"
    sale = r.json()
    item_price = float(sale["items"][0]["price"])
    expected = 23000.0
    assert item_price == expected, f"TEST 3 FAIL: expected {expected}, got {item_price}"
    print(f"TEST 3 (Offline+Reseller): {item_price} == {expected} ✓")
    results.append(("TEST 3 — Offline + Reseller", item_price == expected))

    # =========================================================
    # TEST 4: Offline + Partai → wholesale_price
    # =========================================================
    sale_body = {
        "outlet_id": outlet_id,
        "items": [{"product_id": pid, "name": "Test", "price": 99999, "quantity": 1}],
        "payment_method": "cash",
        "amount_paid": 999999,
        "sales_channel": "offline",
        "price_type": "partai",
    }
    r = requests.post(f"{BASE}/sales", json=sale_body, headers=h, timeout=TIMEOUT)
    assert r.status_code == 200, f"Test 4 sale failed: {r.status_code} {r.text}"
    sale = r.json()
    item_price = float(sale["items"][0]["price"])
    expected = 21000.0
    assert item_price == expected, f"TEST 4 FAIL: expected {expected}, got {item_price}"
    print(f"TEST 4 (Offline+Partai): {item_price} == {expected} ✓")
    results.append(("TEST 4 — Offline + Partai", item_price == expected))

    # =========================================================
    # TEST 5: Online channel → online_price
    # =========================================================
    sale_body = {
        "outlet_id": outlet_id,
        "items": [{"product_id": pid, "name": "Test", "price": 99999, "quantity": 1}],
        "payment_method": "cash",
        "amount_paid": 999999,
        "sales_channel": "online",
        "price_type": "online",
    }
    r = requests.post(f"{BASE}/sales", json=sale_body, headers=h, timeout=TIMEOUT)
    assert r.status_code == 200, f"Test 5 sale failed: {r.status_code} {r.text}"
    sale = r.json()
    item_price = float(sale["items"][0]["price"])
    expected = 27000.0
    assert item_price == expected, f"TEST 5 FAIL: expected {expected}, got {item_price}"
    print(f"TEST 5 (Online): {item_price} == {expected} ✓")
    results.append(("TEST 5 — Online channel", item_price == expected))

    # =========================================================
    # TEST 6: Verify existing price unchanged
    # =========================================================
    r = requests.get(f"{BASE}/products", headers=h, timeout=TIMEOUT)
    products = r.json()
    test_product = [p for p in products if p["id"] == pid][0]
    existing_price = float(test_product["price"])
    expected = 25000.0
    assert existing_price == expected, f"TEST 6 FAIL: existing price changed to {existing_price}"
    print(f"TEST 6 (Existing price unchanged): {existing_price} == {expected} ✓")
    results.append(("TEST 6 — Existing price immutable", existing_price == expected))

    # =========================================================
    # TEST 7: Update online_price and verify new sales use new price
    # =========================================================
    update_body = {"online_price": 50000}
    r = requests.put(f"{BASE}/products/{pid}", json=update_body, headers=h, timeout=TIMEOUT)
    assert r.status_code == 200, f"Update failed: {r.status_code} {r.text}"

    # New sale should use new online price
    sale_body = {
        "outlet_id": outlet_id,
        "items": [{"product_id": pid, "name": "Test", "price": 99999, "quantity": 1}],
        "payment_method": "cash",
        "amount_paid": 999999,
        "sales_channel": "online",
        "price_type": "online",
    }
    r = requests.post(f"{BASE}/sales", json=sale_body, headers=h, timeout=TIMEOUT)
    sale = r.json()
    new_price = float(sale["items"][0]["price"])
    assert new_price == 50000.0, f"TEST 7 FAIL: new online price should be 50000, got {new_price}"
    print(f"TEST 7 (Updated online price): {new_price} == 50000 ✓")
    results.append(("TEST 7 — Price update applies to new sales", new_price == 50000.0))

    # Verify existing price STILL unchanged
    r = requests.get(f"{BASE}/products", headers=h, timeout=TIMEOUT)
    products = r.json()
    test_product = [p for p in products if p["id"] == pid][0]
    assert float(test_product["price"]) == 25000.0, "Existing price changed after update!"
    print(f"  Existing price still: {test_product['price']} ✓")

    # =========================================================
    # SUMMARY
    # =========================================================
    print("\n" + "=" * 60)
    all_passed = True
    for name, passed in results:
        status = "PASS" if passed else "FAIL"
        if not passed:
            all_passed = False
        print(f"  {status}: {name}")
    print("=" * 60)

    if all_passed:
        print("\nALL ACCEPTANCE TESTS PASSED!")
    else:
        print("\nSOME TESTS FAILED!")
        exit(1)


if __name__ == "__main__":
    main()
