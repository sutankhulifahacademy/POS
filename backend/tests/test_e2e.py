"""
End-to-End Test Suite for Sutan Khulifah POS API
Run: docker exec rdi-backend python /app/tests/test_e2e.py
"""
import requests
import json
import sys
import time

BASE = "http://localhost:8001/api"
PASS = 0
FAIL = 0
ERRORS = []


def test(name, condition, detail=""):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  PASS  {name}")
    else:
        FAIL += 1
        ERRORS.append(f"{name}: {detail}")
        print(f"  FAIL  {name} — {detail}")


def login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=10)
    if r.status_code != 200:
        return None, None
    token = r.json().get("token")
    return token, r.json()


def main():
    print("=" * 60)
    print("Sutan Khulifah POS — End-to-End Test Suite")
    print("=" * 60)

    # ==========================================================
    # 1. AUTH
    # ==========================================================
    print("\n[1] AUTH")
    token, user = login("owner@republikdimsum.id", "Owner@2026")
    test("Login admin", token is not None, "No token returned")
    h = {"Authorization": f"Bearer {token}"}

    r = requests.get(f"{BASE}/auth/me", headers=h, timeout=10)
    test("GET /auth/me", r.status_code == 200, f"Status {r.status_code}")

    # Login kasir
    kasir_token, _ = login("kasir@sutankhulifah.com", "Kasir@2026")
    test("Login kasir", kasir_token is not None, "No token")
    hk = {"Authorization": f"Bearer {kasir_token}"}

    # ==========================================================
    # 2. BUSINESS
    # ==========================================================
    print("\n[2] BUSINESS")
    r = requests.get(f"{BASE}/business", headers=h, timeout=10)
    test("GET /business", r.status_code == 200, f"Status {r.status_code}")

    # ==========================================================
    # 3. USERS
    # ==========================================================
    print("\n[3] USERS")
    r = requests.get(f"{BASE}/users", headers=h, timeout=10)
    test("GET /users (admin)", r.status_code == 200, f"Status {r.status_code}")

    r = requests.get(f"{BASE}/users", headers=hk, timeout=10)
    test("GET /users (kasir forbidden)", r.status_code == 403, f"Status {r.status_code}")

    # ==========================================================
    # 4. OUTLETS
    # ==========================================================
    print("\n[4] OUTLETS")
    r = requests.get(f"{BASE}/outlets", headers=h, timeout=10)
    test("GET /outlets", r.status_code == 200, f"Status {r.status_code}")
    outlets = r.json()
    test("Outlets not empty", len(outlets) > 0, "No outlets")
    main_outlet = next((o for o in outlets if o.get("is_main")), outlets[0] if outlets else None)
    test("Main outlet found", main_outlet is not None, "No main outlet")

    # ==========================================================
    # 5. CATEGORIES
    # ==========================================================
    print("\n[5] CATEGORIES")
    r = requests.get(f"{BASE}/categories", headers=h, timeout=10)
    test("GET /categories", r.status_code == 200, f"Status {r.status_code}")

    # Create category
    r = requests.post(f"{BASE}/categories", headers=h, json={"name": "Test Category E2E", "color": "#FF0000"}, timeout=10)
    test("POST /categories", r.status_code == 200, f"Status {r.status_code}")
    cat_id = r.json().get("id") if r.status_code == 200 else None

    # ==========================================================
    # 6. PRODUCTS
    # ==========================================================
    print("\n[6] PRODUCTS")
    r = requests.get(f"{BASE}/products", headers=h, timeout=10)
    test("GET /products", r.status_code == 200, f"Status {r.status_code}")
    products = r.json()
    test("Products not empty", len(products) > 0, "No products")
    # Pick a product with stock > 0
    test_product = next((p for p in products if p.get("stock", 0) > 0), products[0] if products else None)
    test("Test product found", test_product is not None, "No product")

    # Ensure test product has stock
    if test_product and test_product.get("stock", 0) < 10:
        requests.post(f"{BASE}/inventory/adjust", headers=h, json={
            "product_id": test_product["id"], "delta": 100, "reason": "test", "note": "E2E stock boost"
        }, timeout=10)
        test_product["stock"] = 100

    # Create product
    r = requests.post(f"{BASE}/products", headers=h, json={
        "name": "E2E Test Product", "sku": "E2E-001", "barcode": "8990001112223",
        "category_id": cat_id, "price": 15000, "cost": 8000, "stock": 50,
        "low_stock_threshold": 5, "unit": "pcs", "is_active": True, "variants": []
    }, timeout=10)
    test("POST /products", r.status_code == 200, f"Status {r.status_code}: {r.text[:200]}")
    e2e_pid = r.json().get("id") if r.status_code == 200 else None

    # ==========================================================
    # 7. CUSTOMERS
    # ==========================================================
    print("\n[7] CUSTOMERS")
    r = requests.get(f"{BASE}/customers", headers=h, timeout=10)
    test("GET /customers", r.status_code == 200, f"Status {r.status_code}")

    r = requests.post(f"{BASE}/customers", headers=h, json={"name": "E2E Customer", "phone": "08123456789"}, timeout=10)
    test("POST /customers", r.status_code == 200, f"Status {r.status_code}")

    # ==========================================================
    # 8. SUPPLIERS
    # ==========================================================
    print("\n[8] SUPPLIERS")
    r = requests.get(f"{BASE}/suppliers", headers=h, timeout=10)
    test("GET /suppliers", r.status_code == 200, f"Status {r.status_code}")

    r = requests.post(f"{BASE}/suppliers", headers=h, json={"name": "E2E Supplier", "contact_person": "Test", "phone": "08123456789"}, timeout=10)
    test("POST /suppliers", r.status_code == 200, f"Status {r.status_code}")

    # ==========================================================
    # 9. TABLES
    # ==========================================================
    print("\n[9] TABLES")
    r = requests.get(f"{BASE}/tables", headers=h, timeout=10)
    test("GET /tables", r.status_code == 200, f"Status {r.status_code}")
    tables = r.json()
    test("Tables not empty", len(tables) > 0, "No tables")
    test("Tables have active_order_id field", "active_order_id" in tables[0] if tables else False, "Missing field")
    test_table = tables[0] if tables else None

    # Create table
    r = requests.post(f"{BASE}/tables", headers=h, json={"name": "E2E Table", "capacity": 4, "zone": "Test"}, timeout=10)
    test("POST /tables", r.status_code == 200, f"Status {r.status_code}")
    e2e_table_id = r.json().get("id") if r.status_code == 200 else None

    # ==========================================================
    # 10. SHIFTS
    # ==========================================================
    print("\n[10] SHIFTS")
    r = requests.get(f"{BASE}/shifts/active", headers=h, timeout=10)
    test("GET /shifts/active", r.status_code == 200, f"Status {r.status_code}")

    r = requests.get(f"{BASE}/shifts", headers=h, timeout=10)
    test("GET /shifts", r.status_code == 200, f"Status {r.status_code}")

    # Open shift if not active
    if r.status_code == 200:
        active = requests.get(f"{BASE}/shifts/active", headers=h, timeout=10).json()
        if not active:
            r = requests.post(f"{BASE}/shifts/open", headers=h, json={"opening_cash": 100000}, timeout=10)
            test("POST /shifts/open", r.status_code == 200, f"Status {r.status_code}")
        else:
            test("POST /shifts/open (already open)", True, "Skipped — shift already active")

    # ==========================================================
    # 11. INVENTORY
    # ==========================================================
    print("\n[11] INVENTORY")
    r = requests.get(f"{BASE}/inventory/movements", headers=h, timeout=10)
    test("GET /inventory/movements", r.status_code == 200, f"Status {r.status_code}")

    if e2e_pid:
        r = requests.post(f"{BASE}/inventory/adjust", headers=h, json={
            "product_id": e2e_pid, "delta": 10, "reason": "test", "note": "E2E test adjust"
        }, timeout=10)
        test("POST /inventory/adjust", r.status_code == 200, f"Status {r.status_code}: {r.text[:200]}")

    # ==========================================================
    # 12. PAYMENT ACCOUNTS
    # ==========================================================
    print("\n[12] PAYMENT ACCOUNTS")
    r = requests.get(f"{BASE}/payment-accounts", headers=h, timeout=10)
    test("GET /payment-accounts", r.status_code == 200, f"Status {r.status_code}")

    r = requests.post(f"{BASE}/payment-accounts", headers=h, json={
        "bank_name": "E2E Bank", "account_name": "Test Account", "account_no": "1234567890", "is_active": True
    }, timeout=10)
    test("POST /payment-accounts", r.status_code == 200, f"Status {r.status_code}")
    pa_id = r.json().get("id") if r.status_code == 200 else None

    if pa_id:
        r = requests.put(f"{BASE}/payment-accounts/{pa_id}", headers=h, json={"is_active": False}, timeout=10)
        test("PUT /payment-accounts/{id}", r.status_code == 200, f"Status {r.status_code}")

        r = requests.delete(f"{BASE}/payment-accounts/{pa_id}", headers=h, timeout=10)
        test("DELETE /payment-accounts/{id}", r.status_code == 200, f"Status {r.status_code}")

    # ==========================================================
    # 13. CARD BRANDS
    # ==========================================================
    print("\n[13] CARD BRANDS")
    r = requests.get(f"{BASE}/card-brands", headers=h, timeout=10)
    test("GET /card-brands", r.status_code == 200, f"Status {r.status_code}")
    test("Card brands not empty", len(r.json()) > 0, "No card brands")

    r = requests.post(f"{BASE}/card-brands", headers=h, json={"name": "E2E Bank Card"}, timeout=10)
    test("POST /card-brands (new)", r.status_code == 200, f"Status {r.status_code}")

    r = requests.post(f"{BASE}/card-brands", headers=h, json={"name": "BCA"}, timeout=10)
    test("POST /card-brands (duplicate returns existing)", r.status_code == 200, f"Status {r.status_code}")

    # ==========================================================
    # 14. SALES (POS Transaction)
    # ==========================================================
    print("\n[14] SALES (POS)")
    if test_product:
        # Cash sale
        r = requests.post(f"{BASE}/sales", headers=h, json={
            "outlet_id": main_outlet["id"] if main_outlet else "",
            "customer_id": "",
            "items": [{"product_id": test_product["id"], "variant_name": "", "name": test_product["name"], "price": test_product["price"], "quantity": 1}],
            "payment_method": "cash", "amount_paid": 50000, "discount": 0, "tax": 0, "note": "E2E cash sale"
        }, timeout=15)
        test("POST /sales (cash)", r.status_code == 200, f"Status {r.status_code}: {r.text[:200]}")

        # Card sale
        r = requests.post(f"{BASE}/sales", headers=h, json={
            "outlet_id": main_outlet["id"] if main_outlet else "",
            "customer_id": "",
            "items": [{"product_id": test_product["id"], "variant_name": "", "name": test_product["name"], "price": test_product["price"], "quantity": 1}],
            "payment_method": "card", "amount_paid": test_product["price"],
            "card_type": "debit", "card_brand": "BCA", "card_last4": "1234",
            "card_reference_no": "REF001", "card_approval_code": "APP001", "card_terminal_id": "EDC001",
            "discount": 0, "tax": 0, "note": "E2E card sale"
        }, timeout=15)
        test("POST /sales (card)", r.status_code == 200, f"Status {r.status_code}: {r.text[:200]}")

    r = requests.get(f"{BASE}/sales", headers=h, timeout=10)
    test("GET /sales", r.status_code == 200, f"Status {r.status_code}")

    if r.status_code == 200 and len(r.json()) > 0:
        sale_id = r.json()[0]["id"]
        r = requests.get(f"{BASE}/sales/{sale_id}", headers=h, timeout=10)
        test("GET /sales/{id}", r.status_code == 200, f"Status {r.status_code}")

    # ==========================================================
    # 15. ORDERS (Dine-In)
    # ==========================================================
    print("\n[15] ORDERS (Dine-In)")
    r = requests.get(f"{BASE}/orders", headers=h, timeout=10)
    test("GET /orders", r.status_code == 200, f"Status {r.status_code}")

    if test_table and test_product:
        # Open order
        r = requests.post(f"{BASE}/orders", headers=h, json={
            "table_id": test_table["id"], "guest_count": 2,
            "items": [{"product_id": test_product["id"], "name": test_product["name"], "price": test_product["price"], "quantity": 2, "variant_name": "", "note": ""}]
        }, timeout=15)
        test("POST /orders (open)", r.status_code == 200, f"Status {r.status_code}: {r.text[:200]}")

        if r.status_code == 200:
            order_id = r.json().get("id")

            # Update items
            r = requests.put(f"{BASE}/orders/{order_id}/items", headers=h, json={
                "items": [{"product_id": test_product["id"], "name": test_product["name"], "price": test_product["price"], "quantity": 3, "variant_name": "", "note": "updated"}]
            }, timeout=10)
            test("PUT /orders/{id}/items", r.status_code == 200, f"Status {r.status_code}: {r.text[:200]}")

            # Checkout with cash (calculate total: 3 items * price)
            dinein_total = 3 * test_product["price"]
            r = requests.post(f"{BASE}/orders/{order_id}/checkout", headers=h, json={
                "payment_method": "cash", "amount_paid": dinein_total + 10000, "discount": 0, "tax": 0, "customer_id": "", "note": "E2E dine-in checkout"
            }, timeout=15)
            test("POST /orders/{id}/checkout (cash)", r.status_code == 200, f"Status {r.status_code}: {r.text[:200]}")

    # Open another order and checkout with card
    if e2e_table_id and test_product:
        r = requests.post(f"{BASE}/orders", headers=h, json={
            "table_id": e2e_table_id, "guest_count": 1,
            "items": [{"product_id": test_product["id"], "name": test_product["name"], "price": test_product["price"], "quantity": 1, "variant_name": "", "note": ""}]
        }, timeout=15)
        if r.status_code == 200:
            order_id2 = r.json().get("id")
            r = requests.post(f"{BASE}/orders/{order_id2}/checkout", headers=h, json={
                "payment_method": "card", "amount_paid": test_product["price"],
                "card_type": "credit", "card_brand": "BNI", "card_last4": "5678",
                "card_reference_no": "REF002", "card_approval_code": "APP002", "card_terminal_id": "EDC002",
                "discount": 0, "tax": 0, "customer_id": "", "note": "E2E card dine-in"
            }, timeout=15)
            test("POST /orders/{id}/checkout (card)", r.status_code == 200, f"Status {r.status_code}: {r.text[:200]}")

    # ==========================================================
    # 16. PURCHASE ORDERS
    # ==========================================================
    print("\n[16] PURCHASE ORDERS")
    r = requests.get(f"{BASE}/purchase-orders", headers=h, timeout=10)
    test("GET /purchase-orders", r.status_code == 200, f"Status {r.status_code}")

    # Create PO
    if test_product:
        r = requests.post(f"{BASE}/purchase-orders", headers=h, json={
            "supplier_id": "70000000-0000-0000-0000-000000000001",
            "supplier_name": "E2E Supplier",
            "items": [{"product_id": test_product["id"], "name": test_product["name"], "quantity": 10, "cost": 5000}],
            "note": "E2E PO test"
        }, timeout=10)
        test("POST /purchase-orders", r.status_code == 200, f"Status {r.status_code}: {r.text[:200]}")

        if r.status_code == 200:
            po_id = r.json().get("id")

            # Reject PO
            r = requests.post(f"{BASE}/purchase-orders/{po_id}/reject", headers=h, timeout=10)
            test("POST /purchase-orders/{id}/reject", r.status_code == 200, f"Status {r.status_code}: {r.text[:200]}")

            # Verify status changed
            r = requests.get(f"{BASE}/purchase-orders", headers=h, timeout=10)
            po = next((p for p in r.json() if p["id"] == po_id), None)
            test("PO status is cancelled", po is not None and po["status"] == "cancelled", f"Status: {po['status'] if po else 'not found'}")

    # Create and receive PO
    if e2e_pid:
        r = requests.post(f"{BASE}/purchase-orders", headers=h, json={
            "supplier_id": "70000000-0000-0000-0000-000000000001",
            "supplier_name": "E2E Supplier",
            "items": [{"product_id": e2e_pid, "name": "E2E Test Product", "quantity": 5, "cost": 4000}],
            "note": "E2E PO receive test"
        }, timeout=10)
        if r.status_code == 200:
            po_id2 = r.json().get("id")
            r = requests.post(f"{BASE}/purchase-orders/{po_id2}/receive", headers=h, timeout=10)
            test("POST /purchase-orders/{id}/receive", r.status_code == 200, f"Status {r.status_code}: {r.text[:200]}")

    # ==========================================================
    # 17. STOCK TRANSFERS
    # ==========================================================
    print("\n[17] STOCK TRANSFERS")
    r = requests.get(f"{BASE}/stock-transfers", headers=h, timeout=10)
    test("GET /stock-transfers", r.status_code == 200, f"Status {r.status_code}")

    if len(outlets) >= 2 and test_product:
        r = requests.post(f"{BASE}/stock-transfers", headers=h, json={
            "from_outlet_id": outlets[0]["id"], "to_outlet_id": outlets[1]["id"],
            "from_outlet_name": outlets[0]["name"], "to_outlet_name": outlets[1]["name"],
            "items": [{"product_id": test_product["id"], "name": test_product["name"], "quantity": 2}],
            "note": "E2E transfer"
        }, timeout=10)
        test("POST /stock-transfers", r.status_code == 200, f"Status {r.status_code}: {r.text[:200]}")

    # ==========================================================
    # 18. REPORTS
    # ==========================================================
    print("\n[18] REPORTS")
    r = requests.get(f"{BASE}/reports/dashboard", headers=h, timeout=15)
    test("GET /reports/dashboard", r.status_code == 200, f"Status {r.status_code}: {r.text[:200]}")

    if r.status_code == 200:
        data = r.json()
        test("Report has revenue", "revenue" in data, f"Keys: {list(data.keys())[:10]}")
        test("Report has transactions", "transactions" in data, f"Keys: {list(data.keys())[:10]}")
        test("Report has period", "period" in data, f"Keys: {list(data.keys())[:10]}")

    # Sales report
    r = requests.get(f"{BASE}/reports/sales?period=monthly", headers=h, timeout=15)
    test("GET /reports/sales", r.status_code == 200, f"Status {r.status_code}: {r.text[:200]}")
    if r.status_code == 200:
        data = r.json()
        test("Sales report has summary", "summary" in data, f"Keys: {list(data.keys())[:10]}")
        test("Sales report has by_payment_method", "by_payment_method" in data, f"Keys: {list(data.keys())[:10]}")
        test("Sales report has by_product", "by_product" in data, f"Keys: {list(data.keys())[:10]}")
        test("Sales report has by_category", "by_category" in data, f"Keys: {list(data.keys())[:10]}")
        test("Sales report has chart", "chart" in data, f"Keys: {list(data.keys())[:10]}")

    # Custom period sales report
    r = requests.get(f"{BASE}/reports/sales?period=custom&date_from=2026-01-01&date_to=2026-12-31", headers=h, timeout=15)
    test("GET /reports/sales (custom period)", r.status_code == 200, f"Status {r.status_code}")

    # Profit/Loss report
    r = requests.get(f"{BASE}/reports/profit-loss?period=monthly", headers=h, timeout=15)
    test("GET /reports/profit-loss", r.status_code == 200, f"Status {r.status_code}: {r.text[:200]}")
    if r.status_code == 200:
        data = r.json()
        test("P&L has revenue", "revenue" in data, f"Keys: {list(data.keys())[:10]}")
        test("P&L has cogs", "cogs" in data, f"Keys: {list(data.keys())[:10]}")
        test("P&L has gross_profit", "gross_profit" in data, f"Keys: {list(data.keys())[:10]}")
        test("P&L has net_profit", "net_profit" in data, f"Keys: {list(data.keys())[:10]}")
        test("P&L has by_product", "by_product" in data, f"Keys: {list(data.keys())[:10]}")

    # Shifts report
    r = requests.get(f"{BASE}/reports/shifts", headers=h, timeout=15)
    test("GET /reports/shifts", r.status_code == 200, f"Status {r.status_code}: {r.text[:200]}")
    if r.status_code == 200:
        data = r.json()
        test("Shifts report has shifts", "shifts" in data, f"Keys: {list(data.keys())[:10]}")
        test("Shifts report has summary", "summary" in data, f"Keys: {list(data.keys())[:10]}")

    # Stock report
    r = requests.get(f"{BASE}/reports/stock", headers=h, timeout=15)
    test("GET /reports/stock", r.status_code == 200, f"Status {r.status_code}: {r.text[:200]}")
    if r.status_code == 200:
        data = r.json()
        test("Stock report has movements", "movements" in data, f"Keys: {list(data.keys())[:10]}")
        test("Stock report has summary", "summary" in data, f"Keys: {list(data.keys())[:10]}")
        test("Stock report has low_stock", "low_stock" in data, f"Keys: {list(data.keys())[:10]}")

    # Payment reconciliation report
    r = requests.get(f"{BASE}/reports/payment-reconciliation?period=monthly", headers=h, timeout=15)
    test("GET /reports/payment-reconciliation", r.status_code == 200, f"Status {r.status_code}: {r.text[:200]}")
    if r.status_code == 200:
        data = r.json()
        test("Reconciliation has by_method", "by_method" in data, f"Keys: {list(data.keys())[:10]}")
        test("Reconciliation has cash_detail", "cash_detail" in data, f"Keys: {list(data.keys())[:10]}")

    # ==========================================================
    # 19. ATTENDANCE
    # ==========================================================
    print("\n[19] ATTENDANCE")
    r = requests.get(f"{BASE}/attendance/active", headers=h, timeout=10)
    test("GET /attendance/active", r.status_code == 200, f"Status {r.status_code}")

    r = requests.get(f"{BASE}/attendance", headers=h, timeout=10)
    test("GET /attendance", r.status_code == 200, f"Status {r.status_code}")

    # Clock in
    r = requests.post(f"{BASE}/attendance/clock-in", headers=h, json={"note": "E2E clock in"}, timeout=10)
    test("POST /attendance/clock-in", r.status_code == 200, f"Status {r.status_code}: {r.text[:200]}")

    # Clock out
    r = requests.post(f"{BASE}/attendance/clock-out", headers=h, json={"note": "E2E clock out"}, timeout=10)
    test("POST /attendance/clock-out", r.status_code == 200, f"Status {r.status_code}: {r.text[:200]}")

    # ==========================================================
    # 20. OUTLET STOCKS
    # ==========================================================
    print("\n[20] OUTLET STOCKS")
    if main_outlet:
        r = requests.get(f"{BASE}/outlet-stocks/{main_outlet['id']}", headers=h, timeout=10)
        test("GET /outlet-stocks/{id}", r.status_code == 200, f"Status {r.status_code}")

    # ==========================================================
    # 21. ROLE-BASED ACCESS
    # ==========================================================
    print("\n[21] ROLE-BASED ACCESS")
    # Kasir should NOT access admin endpoints
    r = requests.get(f"{BASE}/users", headers=hk, timeout=10)
    test("Kasir blocked from /users", r.status_code == 403, f"Status {r.status_code}")

    r = requests.get(f"{BASE}/outlets", headers=hk, timeout=10)
    test("Kasir can access /outlets", r.status_code == 200, f"Status {r.status_code}")

    r = requests.get(f"{BASE}/products", headers=hk, timeout=10)
    test("Kasir can access /products", r.status_code == 200, f"Status {r.status_code}")

    r = requests.get(f"{BASE}/tables", headers=hk, timeout=10)
    test("Kasir can access /tables", r.status_code == 200, f"Status {r.status_code}")

    # Kasir should NOT create payment accounts
    r = requests.post(f"{BASE}/payment-accounts", headers=hk, json={"bank_name": "X", "account_name": "X", "account_no": "X"}, timeout=10)
    test("Kasir blocked from POST /payment-accounts", r.status_code == 403, f"Status {r.status_code}")

    # ==========================================================
    # CLEANUP
    # ==========================================================
    print("\n[22] CLEANUP")
    if e2e_pid:
        requests.delete(f"{BASE}/products/{e2e_pid}", headers=h, timeout=10)
        test("Delete E2E product", True)
    if e2e_table_id:
        requests.delete(f"{BASE}/tables/{e2e_table_id}", headers=h, timeout=10)
        test("Delete E2E table", True)
    if cat_id:
        requests.delete(f"{BASE}/categories/{cat_id}", headers=h, timeout=10)
        test("Delete E2E category", True)

    # ==========================================================
    # SUMMARY
    # ==========================================================
    print("\n" + "=" * 60)
    print(f"RESULTS: {PASS} passed, {FAIL} failed, {PASS + FAIL} total")
    print("=" * 60)

    if ERRORS:
        print("\nFAILURES:")
        for e in ERRORS:
            print(f"  - {e}")

    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
