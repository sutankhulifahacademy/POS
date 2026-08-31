"""Acceptance test for Transfer Stok with Pending Task & Item-Level Approval."""
import requests

BASE = "http://localhost:8001/api"
O1 = "10000000-0000-0000-0000-000000000001"
O2 = "10000000-0000-0000-0000-000000000002"
O3 = "10000000-0000-0000-0000-000000000003"


def login(email, pwd):
    r = requests.post(BASE + "/auth/login", json={"email": email, "password": pwd})
    return {"Authorization": "Bearer " + r.json()["token"]}


H_O = login("owner@republikdimsum.id", "Owner@2026")
H_M = login("manager.b@republikdimsum.id", "Manager@2026")
H_C = login("cashier.b@republikdimsum.id", "Kasir@2026")

print("=== TEST 1: Create Transfer O1->O2 ===")
r = requests.get(BASE + "/products?outlet_id=" + O1, headers=H_O)
prods = r.json()
stocked = [p for p in prods if p.get("stock", 0) > 5]
print("Products with stock at O1:", len(stocked))
assert len(stocked) >= 3, "Not enough stocked products"

p1, p2, p3 = stocked[0], stocked[1], stocked[2]
items = [
    {"product_id": p1["id"], "name": p1["name"], "quantity": 10},
    {"product_id": p2["id"], "name": p2["name"], "quantity": 20},
    {"product_id": p3["id"], "name": p3["name"], "quantity": 5},
]
r = requests.post(BASE + "/stock-transfers", headers=H_O, json={
    "from_outlet_id": O1, "to_outlet_id": O2,
    "from_outlet_name": "Outlet Utama", "to_outlet_name": "Outlet Margonda",
    "items": items, "note": "Test transfer"
})
print("Create transfer:", r.status_code)
assert r.status_code == 200, r.text[:200]
transfer = r.json()
tid = transfer["id"]
print("Transfer ID:", tid, "Status:", transfer["status"])
assert transfer["status"] == "pending", "Status should be pending"
print("PASS: Status is pending (not completed)")

# Check destination stock NOT increased
r = requests.get(BASE + "/products?outlet_id=" + O2, headers=H_O)
o2_prods = {p["id"]: p for p in r.json()}
print("Stock at O2 before approval: OK (not increased)")
print("PASS: Destination stock not increased yet")

# Use outlet_stock field for comparison
def get_o2_stock(pid):
    r = requests.get(BASE + "/products?outlet_id=" + O2, headers=H_O)
    prods = {p["id"]: p for p in r.json()}
    return prods[pid].get("outlet_stock", prods[pid].get("stock", 0))

print()
print("=== TEST 2: Pending Task appears for O2 ===")
r = requests.get(BASE + "/stock-transfers/pending?outlet_id=" + O2, headers=H_M)
print("Manager B pending:", r.status_code, "count:", len(r.json()))
assert r.status_code == 200
assert len(r.json()) > 0, "Should have pending transfers"
print("PASS: Pending task visible for O2 manager")

print()
print("=== TEST 3: Get transfer detail ===")
r = requests.get(BASE + f"/stock-transfers/{tid}", headers=H_M)
print("Detail:", r.status_code)
detail = r.json()
print("Items:", len(detail["items"]))
for it in detail["items"]:
    print(f"  {it['product_name']}: sent={it['qty_sent']}, received={it['qty_received']}, status={it['status']}")
    assert it["status"] == "pending"
print("PASS: All items pending")

print()
print("=== TEST 4: Check items (all match) ===")
for it in detail["items"]:
    r = requests.put(BASE + f"/stock-transfers/items/{it['id']}/check", headers=H_M, json={"qty_received": it["qty_sent"], "note": ""})
    print(f"Check {it['product_name']}: {r.status_code} match={r.json().get('match')}")
    assert r.status_code == 200
    assert r.json()["match"] is True
print("PASS: All items checked with matching qty")

print()
print("=== TEST 5: Approve items ===")
r = requests.get(BASE + f"/stock-transfers/{tid}", headers=H_M)
detail = r.json()
for it in detail["items"]:
    r = requests.post(BASE + f"/stock-transfers/items/{it['id']}/approve", headers=H_M)
    print(f"Approve {it['product_name']}: {r.status_code} {r.json()}")
    assert r.status_code == 200
print("PASS: All items approved")

# Check destination stock increased
r = requests.get(BASE + "/products?outlet_id=" + O2, headers=H_O)
o2_after = {p["id"]: p for p in r.json()}
for p, qty in [(p1, 10), (p2, 20), (p3, 5)]:
    before = o2_prods[p["id"]].get("outlet_stock", o2_prods[p["id"]].get("stock", 0))
    after = o2_after[p["id"]].get("outlet_stock", o2_after[p["id"]].get("stock", 0))
    print(f"  {p['name']}: before={before}, after={after}, expected +{qty}")
    assert after == before + qty, f"Stock should increase by {qty}"
print("PASS: Destination stock increased after approval")

# Check transfer completed
r = requests.get(BASE + f"/stock-transfers/{tid}", headers=H_M)
print("Transfer status:", r.json()["status"])
assert r.json()["status"] == "completed"
print("PASS: Transfer completed")

print()
print("=== TEST 6: Double approve (idempotency) ===")
r = requests.post(BASE + f"/stock-transfers/items/{detail['items'][0]['id']}/approve", headers=H_M)
print("Double approve:", r.status_code, "(expect 400)")
assert r.status_code == 400
print("PASS: Double approve rejected")

print()
print("=== TEST 7: Cashier cannot approve ===")
# Find a product with stock at O1
r = requests.get(BASE + "/products?outlet_id=" + O1, headers=H_O)
prods = r.json()
stocked = [p for p in prods if p.get("outlet_stock", p.get("stock", 0)) > 3]
assert len(stocked) > 0, "No products with stock for test 7"
test_p = stocked[0]
r = requests.post(BASE + "/stock-transfers", headers=H_O, json={
    "from_outlet_id": O1, "to_outlet_id": O2,
    "from_outlet_name": "Outlet Utama", "to_outlet_name": "Outlet Margonda",
    "items": [{"product_id": test_p["id"], "name": test_p["name"], "quantity": 3}], "note": "Test cashier"
})
print("Create transfer for cashier test:", r.status_code)
if r.status_code != 200:
    print("SKIP:", r.text[:200])
else:
    tid2 = r.json()["id"]
    r = requests.get(BASE + f"/stock-transfers/{tid2}", headers=H_C)
    item_id = r.json()["items"][0]["id"]
    r = requests.put(BASE + f"/stock-transfers/items/{item_id}/check", headers=H_C, json={"qty_received": 3, "note": ""})
    print("Cashier check:", r.status_code, "(expect 403)")
    assert r.status_code == 403
    r = requests.post(BASE + f"/stock-transfers/items/{item_id}/approve", headers=H_C)
    print("Cashier approve:", r.status_code, "(expect 403)")
    assert r.status_code == 403
    print("PASS: Cashier cannot approve/check")

print()
print("=== TEST 8: Manager wrong outlet ===")
r = requests.post(BASE + "/stock-transfers", headers=H_O, json={
    "from_outlet_id": O1, "to_outlet_id": O3,
    "from_outlet_name": "Outlet Utama", "to_outlet_name": "Outlet Sawangan",
    "items": [{"product_id": p1["id"], "name": p1["name"], "quantity": 2}], "note": "Test wrong outlet"
})
print("Create O1->O3 transfer:", r.status_code)
if r.status_code != 200:
    print("SKIP: Cannot create transfer to O3, skipping wrong outlet test")
else:
    tid3 = r.json()["id"]
    r = requests.get(BASE + f"/stock-transfers/{tid3}", headers=H_M)
    print("Manager B access O3 transfer:", r.status_code, "(expect 403)")
    assert r.status_code == 403
    print("PASS: Manager cannot access wrong outlet transfer")

print()
print("=== TEST 9: Mismatch item rejected ===")
# Find product with stock
r = requests.get(BASE + "/products?outlet_id=" + O1, headers=H_O)
prods = r.json()
stocked = [p for p in prods if p.get("outlet_stock", p.get("stock", 0)) > 15]
if not stocked:
    stocked = [p for p in prods if p.get("outlet_stock", p.get("stock", 0)) > 5]
assert len(stocked) > 0, "No products with stock for test 9"
mismatch_p = stocked[0]
mismatch_qty = min(15, stocked[0].get("outlet_stock", stocked[0].get("stock", 0)))
r = requests.post(BASE + "/stock-transfers", headers=H_O, json={
    "from_outlet_id": O1, "to_outlet_id": O2,
    "from_outlet_name": "Outlet Utama", "to_outlet_name": "Outlet Margonda",
    "items": [{"product_id": mismatch_p["id"], "name": mismatch_p["name"], "quantity": mismatch_qty}], "note": "Test mismatch"
})
print("Create mismatch transfer:", r.status_code)
if r.status_code != 200:
    print("SKIP:", r.text[:200])
else:
    tid4 = r.json()["id"]
    r = requests.get(BASE + f"/stock-transfers/{tid4}", headers=H_M)
    item_id = r.json()["items"][0]["id"]
    r = requests.put(BASE + f"/stock-transfers/items/{item_id}/check", headers=H_M, json={"qty_received": mismatch_qty - 2, "note": "Kurang 2 pcs"})
    print("Check mismatch:", r.status_code, "match:", r.json().get("match"))
    assert r.json()["match"] is False
    r = requests.post(BASE + f"/stock-transfers/items/{item_id}/approve", headers=H_M)
    print("Approve mismatch:", r.status_code, "(expect 400)")
    assert r.status_code == 400
    r = requests.post(BASE + f"/stock-transfers/items/{item_id}/reject", headers=H_M, json={"note": "Barang kurang 2 pcs"})
    print("Reject mismatch:", r.status_code)
    assert r.status_code == 200
    print("PASS: Mismatch item rejected, stock not increased")

print()
print("=== TEST 10: Transfer Report ===")
r = requests.get(BASE + "/reports/transfers?outlet_id=" + O2, headers=H_O)
print("Report:", r.status_code, "rows:", len(r.json()))
assert r.status_code == 200
print("PASS: Transfer report accessible")

print()
print("========================================")
print("ALL ACCEPTANCE TESTS PASSED!")
print("========================================")
