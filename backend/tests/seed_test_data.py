"""
BUG-007 fix: Create sales via API for O2 and O3 so stock movements are recorded.
Also serves as Phase 7 test data generation with -A, -B, -C suffixes.
"""
import requests
import uuid
import time

BASE = "http://localhost:8001/api"
TIMEOUT = 15
O1 = "10000000-0000-0000-0000-000000000001"
O2 = "10000000-0000-0000-0000-000000000002"
O3 = "10000000-0000-0000-0000-000000000003"

results = []

def login(email, pwd):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": pwd}, timeout=TIMEOUT)
    assert r.status_code == 200, f"Login {email} failed: {r.status_code} {r.text[:100]}"
    return r.json()["token"]

def H(token):
    return {"Authorization": f"Bearer {token}"}

def get_products(outlet_id, headers):
    r = requests.get(f"{BASE}/products?outlet_id={outlet_id}", headers=headers, timeout=TIMEOUT)
    return r.json() if r.status_code == 200 else []

def create_sale(outlet_id, items, payment_method, headers, label=""):
    """Create a sale via API. Returns (success, sale_data)."""
    total = sum(i["price"] * i["quantity"] for i in items)
    body = {
        "outlet_id": outlet_id,
        "items": items,
        "payment_method": payment_method,
        "amount_paid": total + 10000 if payment_method == "cash" else total,
        "discount": 0,
        "tax": 0,
    }
    r = requests.post(f"{BASE}/sales", headers=headers, json=body, timeout=TIMEOUT)
    if r.status_code == 200:
        results.append(f"PASS  Sale {label} at {outlet_id[:8]} {payment_method}: {r.json().get('invoice_no')}")
        return True, r.json()
    else:
        results.append(f"FAIL  Sale {label} at {outlet_id[:8]} {payment_method}: {r.status_code} {r.text[:100]}")
        return False, None

# Login as owner
OWNER = login("owner@republikdimsum.id", "Owner@2026")
HO = H(OWNER)

print("=== BUG-007: Re-seed O2/O3 sales via API ===")

# Get products for each outlet
p1 = get_products(O1, HO)
p2 = get_products(O2, HO)
p3 = get_products(O3, HO)

print(f"Products: O1={len(p1)}, O2={len(p2)}, O3={len(p3)}")

# Create 3 sales per outlet with different payment methods
for label, oid, products in [("A", O1, p1), ("B", O2, p2), ("C", O3, p3)]:
    if not products:
        results.append(f"SKIP  No products for {label}")
        continue

    # Pick 2 products with stock
    stocked = [p for p in products if p.get("outlet_stock") and int(p["outlet_stock"]) > 0]
    if len(stocked) < 2:
        stocked = products[:2]

    # Cash sale
    items_cash = [
        {"product_id": stocked[0]["id"], "name": stocked[0].get("name", ""), "price": float(stocked[0].get("price", 10000)), "quantity": 2},
        {"product_id": stocked[1]["id"], "name": stocked[1].get("name", ""), "price": float(stocked[1].get("price", 10000)), "quantity": 2},
    ]
    create_sale(oid, items_cash, "cash", HO, f"SALE-{label}-001-cash")

    # Card sale
    items_card = [
        {"product_id": stocked[0]["id"], "name": stocked[0].get("name", ""), "price": float(stocked[0].get("price", 10000)), "quantity": 1},
    ]
    body_card = {
        "outlet_id": oid,
        "items": items_card,
        "payment_method": "card",
        "amount_paid": sum(i["price"] * i["quantity"] for i in items_card),
        "discount": 0,
        "tax": 0,
        "card_type": "debit",
        "card_brand": "Visa",
        "card_last4": "1234",
        "card_reference_no": f"REF-{label}-002",
        "card_approval_code": f"APP-{label}-002",
        "card_terminal_id": "EDC-001",
    }
    r = requests.post(f"{BASE}/sales", headers=HO, json=body_card, timeout=TIMEOUT)
    if r.status_code == 200:
        results.append(f"PASS  Sale SALE-{label}-002-card at {oid[:8]}: {r.json().get('invoice_no')}")
    else:
        results.append(f"FAIL  Sale SALE-{label}-002-card: {r.status_code} {r.text[:100]}")

    # QRIS sale
    items_qris = [
        {"product_id": stocked[1]["id"], "name": stocked[1].get("name", ""), "price": float(stocked[1].get("price", 10000)), "quantity": 1},
    ]
    body_qris = {
        "outlet_id": oid,
        "items": items_qris,
        "payment_method": "qris",
        "amount_paid": sum(i["price"] * i["quantity"] for i in items_qris),
        "discount": 0,
        "tax": 0,
    }
    r = requests.post(f"{BASE}/sales", headers=HO, json=body_qris, timeout=TIMEOUT)
    if r.status_code == 200:
        results.append(f"PASS  Sale SALE-{label}-003-qris at {oid[:8]}: {r.json().get('invoice_no')}")
    else:
        results.append(f"FAIL  Sale SALE-{label}-003-qris: {r.status_code} {r.text[:100]}")

    # Transfer sale
    items_transfer = [
        {"product_id": stocked[0]["id"], "name": stocked[0].get("name", ""), "price": float(stocked[0].get("price", 10000)), "quantity": 1},
    ]
    body_transfer = {
        "outlet_id": oid,
        "items": items_transfer,
        "payment_method": "transfer",
        "amount_paid": sum(i["price"] * i["quantity"] for i in items_transfer),
        "discount": 0,
        "tax": 0,
        "transfer_bank": "BCA",
        "transfer_account_name": f"Customer-{label}",
        "transfer_account_no": "1234567890",
        "transfer_reference_no": f"TRF-{label}-004",
        "transfer_sender_name": f"Sender-{label}",
    }
    r = requests.post(f"{BASE}/sales", headers=HO, json=body_transfer, timeout=TIMEOUT)
    if r.status_code == 200:
        results.append(f"PASS  Sale SALE-{label}-004-transfer at {oid[:8]}: {r.json().get('invoice_no')}")
    else:
        results.append(f"FAIL  Sale SALE-{label}-004-transfer: {r.status_code} {r.text[:100]}")

print("\n=== PHASE 7: Test data with -A, -B, -C suffixes ===")

# Create customers per outlet (global table, but tag with name suffix)
for label in ["A", "B", "C"]:
    cust = {"name": f"CUSTOMER-{label}-001", "phone": f"081{label}001", "email": f"customer-{label}@test.id"}
    r = requests.post(f"{BASE}/customers", headers=HO, json=cust, timeout=TIMEOUT)
    if r.status_code == 200:
        results.append(f"PASS  Customer CUSTOMER-{label}-001 created")
    else:
        results.append(f"SKIP  Customer CUSTOMER-{label}-001: {r.status_code} {r.text[:60]}")

# Create expenses per outlet
for label, oid in [("A", O1), ("B", O2), ("C", O3)]:
    exp = {
        "outlet_id": oid,
        "category": "utilities",
        "description": f"EXP-{label}-001 Listrik",
        "amount": 500000,
        "expense_date": "2026-08-30",
        "payment_method": "cash",
        "vendor": f"PLN-{label}",
        "receipt_no": f"RCP-{label}-001",
    }
    r = requests.post(f"{BASE}/expenses", headers=HO, json=exp, timeout=TIMEOUT)
    if r.status_code == 200:
        results.append(f"PASS  Expense EXP-{label}-001 created at {oid[:8]}")
    else:
        results.append(f"FAIL  Expense EXP-{label}-001: {r.status_code} {r.text[:60]}")

# Create attendance per outlet (clock-in)
for label, oid, email, pwd in [("A", O1, "manager.budi@republikdimsum.id", "Manager@2026"),
                                 ("B", O2, "manager.b@republikdimsum.id", "Manager@2026"),
                                 ("C", O3, "manager.c@republikdimsum.id", "Manager@2026")]:
    try:
        tok = login(email, pwd)
        h = H(tok)
        r = requests.post(f"{BASE}/attendance/clock-in", headers=h, json={"note": f"ATT-{label}-001", "outlet_id": oid}, timeout=TIMEOUT)
        if r.status_code == 200:
            results.append(f"PASS  Attendance ATT-{label}-001 clock-in at {oid[:8]}")
            # Clock out
            r2 = requests.post(f"{BASE}/attendance/clock-out", headers=h, json={"note": "done", "outlet_id": oid}, timeout=TIMEOUT)
            if r2.status_code == 200:
                results.append(f"PASS  Attendance ATT-{label}-001 clock-out at {oid[:8]}")
            else:
                results.append(f"SKIP  Attendance clock-out {label}: {r2.status_code}")
        else:
            results.append(f"SKIP  Attendance {label}: {r.status_code} {r.text[:60]}")
    except Exception as e:
        results.append(f"SKIP  Attendance {label}: {e}")

# Create leave requests per outlet
for label, oid, email, pwd in [("A", O1, "manager.budi@republikdimsum.id", "Manager@2026"),
                                 ("B", O2, "manager.b@republikdimsum.id", "Manager@2026"),
                                 ("C", O3, "manager.c@republikdimsum.id", "Manager@2026")]:
    try:
        tok = login(email, pwd)
        h = H(tok)
        leave = {
            "leave_type": "izin",
            "start_date": "2026-09-15",
            "end_date": "2026-09-16",
            "reason": f"LEAVE-{label}-001 Personal",
            "outlet_id": oid,
        }
        r = requests.post(f"{BASE}/leave-requests", headers=h, json=leave, timeout=TIMEOUT)
        if r.status_code == 200:
            results.append(f"PASS  Leave LEAVE-{label}-001 created at {oid[:8]}")
        else:
            results.append(f"SKIP  Leave {label}: {r.status_code} {r.text[:60]}")
    except Exception as e:
        results.append(f"SKIP  Leave {label}: {e}")

# Create stock transfers A→B, B→C, C→A
print("\n=== Transfers A→B, B→C, C→A ===")
outlets_map = {"A": O1, "B": O2, "C": O3}
names_map = {"A": "Outlet Utama", "B": "Outlet Margonda", "C": "Outlet Sawangan"}
for src, dst in [("A", "B"), ("B", "C"), ("C", "A")]:
    src_id, dst_id = outlets_map[src], outlets_map[dst]
    src_name, dst_name = names_map[src], names_map[dst]
    products = get_products(src_id, HO)
    stocked = [p for p in products if p.get("outlet_stock") and int(p["outlet_stock"]) > 0]
    if stocked:
        body = {
            "from_outlet_id": src_id,
            "to_outlet_id": dst_id,
            "from_outlet_name": src_name,
            "to_outlet_name": dst_name,
            "items": [{"product_id": stocked[0]["id"], "name": stocked[0].get("name", ""), "quantity": 2}],
            "note": f"TRF-{src}-to-{dst}-001",
        }
        r = requests.post(f"{BASE}/stock-transfers", headers=HO, json=body, timeout=TIMEOUT)
        if r.status_code == 200:
            results.append(f"PASS  Transfer {src}->{dst}: {r.json().get('transfer_no', 'OK')}")
        else:
            results.append(f"FAIL  Transfer {src}->{dst}: {r.status_code} {r.text[:80]}")
    else:
        results.append(f"SKIP  Transfer {src}->{dst}: no stock")

# Create purchase orders per outlet
for label, oid in [("A", O1), ("B", O2), ("C", O3)]:
    products = get_products(oid, HO)
    if products:
        body = {
            "outlet_id": oid,
            "supplier_name": f"SUPPLIER-{label}-001",
            "note": f"PO-{label}-001 Restock",
            "items": [{"product_id": products[0]["id"], "name": products[0].get("name", ""), "quantity": 10, "unit_cost": 5000}],
        }
        r = requests.post(f"{BASE}/purchase-orders", headers=HO, json=body, timeout=TIMEOUT)
        if r.status_code == 200:
            results.append(f"PASS  PO PO-{label}-001 created at {oid[:8]}")
        else:
            results.append(f"FAIL  PO {label}: {r.status_code} {r.text[:80]}")

# Print results
print("\n" + "=" * 60)
passed = sum(1 for r in results if r.startswith("PASS"))
failed = sum(1 for r in results if r.startswith("FAIL"))
skipped = sum(1 for r in results if r.startswith("SKIP"))
print(f"RESULTS: {passed} passed, {failed} failed, {skipped} skipped, {len(results)} total")
print("=" * 60)
for r in results:
    print(f"  {r}")
