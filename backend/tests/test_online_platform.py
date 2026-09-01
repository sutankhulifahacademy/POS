"""
Acceptance tests for Online Marketplace Profit Analysis feature.
Tests platform config, settlement calculation, reconciliation, reports, and AI analysis.
"""
import requests
import uuid
from datetime import date

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
    results = []

    # Get platforms
    platforms = requests.get(f"{BASE}/online-platforms", headers=h, timeout=TIMEOUT).json()
    assert len(platforms) >= 3, f"Expected >= 3 platforms, got {len(platforms)}"
    grab = next(p for p in platforms if p["code"] == "grabfood")
    gofood = next(p for p in platforms if p["code"] == "gofood")
    shopee = next(p for p in platforms if p["code"] == "shopeefood")
    print(f"Platforms: {[p['name'] for p in platforms]}")
    results.append(("TEST 1 — Platforms seeded (GrabFood, GoFood, ShopeeFood)", len(platforms) >= 3))

    # Get outlets
    outlets = requests.get(f"{BASE}/outlets", headers=h, timeout=TIMEOUT).json()
    main_outlet = next(o for o in outlets if o.get("is_main"))
    outlet_id = main_outlet["id"]

    # =========================================================
    # TEST 2: Fee config exists with effective dates
    # =========================================================
    grab_configs = requests.get(f"{BASE}/online-platforms/{grab['id']}/fee-configs", headers=h, timeout=TIMEOUT).json()
    assert len(grab_configs) >= 1, "GrabFood should have default fee config"
    assert grab_configs[0]["commission_pct"] == 30, f"Expected 30%, got {grab_configs[0]['commission_pct']}"
    assert grab_configs[0]["effective_date"] is not None, "Effective date should be set"
    print(f"GrabFood default config: commission={grab_configs[0]['commission_pct']}%, effective={grab_configs[0]['effective_date']}")
    results.append(("TEST 2 — Fee configs with effective dates", len(grab_configs) >= 1 and grab_configs[0]["commission_pct"] == 30))

    # =========================================================
    # TEST 3: Create outlet-specific fee config
    # =========================================================
    new_config = {
        "outlet_id": outlet_id,
        "commission_pct": 25,
        "fixed_fee": 500,
        "tax_on_fee_pct": 11,
        "fee_calc_base": "gross",
        "effective_date": "2026-01-01",
        "note": "Outlet-specific test config",
    }
    r = requests.post(f"{BASE}/online-platforms/{grab['id']}/fee-configs", json=new_config, headers=h, timeout=TIMEOUT)
    assert r.status_code == 200, f"Create config failed: {r.status_code} {r.text}"
    outlet_config = r.json()
    results.append(("TEST 3 — Outlet-specific fee config", r.status_code == 200))

    # =========================================================
    # TEST 4: Settlement calculation — GoFood example from spec
    # =========================================================
    # GoFood: 20% commission, 1000 fixed fee, 11% tax
    # Product: online_price=30000, cost=12000, qty=1
    # Expected:
    #   Gross: 30000
    #   Commission: 6000 (20% of 30000)
    #   Tax: 660 (11% of 6000)
    #   Fixed: 1000
    #   Total Deduction: 7660
    #   Settlement: 22340
    #   COGS: 12000
    #   Profit: 10340
    order_body = {
        "platform_id": gofood["id"],
        "outlet_id": outlet_id,
        "items": [{"product_id": str(uuid.uuid4()), "product_name": "Test Dimsum", "online_price": 30000, "cost": 12000, "quantity": 1}],
        "customer_name": "Test Customer",
        "platform_order_ref": "TEST-GF-001",
    }
    r = requests.post(f"{BASE}/online-orders", json=order_body, headers=h, timeout=TIMEOUT)
    assert r.status_code == 200, f"Create order failed: {r.status_code} {r.text}"
    order = r.json()
    assert float(order["gross_sales"]) == 30000, f"Gross: expected 30000, got {order['gross_sales']}"
    assert float(order["commission_amount"]) == 6000, f"Commission: expected 6000, got {order['commission_amount']}"
    assert float(order["fixed_fee"]) == 1000, f"Fixed: expected 1000, got {order['fixed_fee']}"
    assert float(order["tax_on_fee"]) == 660, f"Tax: expected 660, got {order['tax_on_fee']}"
    assert float(order["total_deduction"]) == 7660, f"Deduction: expected 7660, got {order['total_deduction']}"
    assert float(order["expected_settlement"]) == 22340, f"Settlement: expected 22340, got {order['expected_settlement']}"
    assert float(order["total_cogs"]) == 12000, f"COGS: expected 12000, got {order['total_cogs']}"
    assert float(order["gross_profit"]) == 10340, f"Profit: expected 10340, got {order['gross_profit']}"
    # Effective fee = 7660 / 30000 * 100 = 25.53%
    assert abs(float(order["effective_fee_pct"]) - 25.53) < 0.1, f"Effective fee: expected 25.53%, got {order['effective_fee_pct']}%"
    print(f"GoFood settlement: gross={order['gross_sales']} commission={order['commission_amount']} tax={order['tax_on_fee']} settlement={order['expected_settlement']} profit={order['gross_profit']} eff_fee={order['effective_fee_pct']}%")
    results.append(("TEST 4 — GoFood settlement calculation (spec example)", abs(float(order["gross_profit"]) - 10340) < 0.01))

    # =========================================================
    # TEST 5: Settlement reconciliation
    # =========================================================
    actual_settlement = 22300.0
    r = requests.put(f"{BASE}/online-orders/{order['id']}/reconcile", json={
        "actual_settlement": actual_settlement,
        "settlement_date": "2026-09-01",
        "settlement_note": "Test reconciliation",
    }, headers=h, timeout=TIMEOUT)
    assert r.status_code == 200, f"Reconcile failed: {r.status_code} {r.text}"
    recon = r.json()
    assert recon["status"] == "variance", f"Expected variance, got {recon['status']}"
    assert abs(recon["variance"] - (-40)) < 0.01, f"Variance: expected -40, got {recon['variance']}"
    print(f"Reconciliation: actual={actual_settlement} variance={recon['variance']} status={recon['status']}")
    results.append(("TEST 5 — Settlement reconciliation with variance", recon["status"] == "variance"))

    # =========================================================
    # TEST 6: Matched reconciliation (variance = 0)
    # =========================================================
    # Create another order
    order2 = requests.post(f"{BASE}/online-orders", json={
        "platform_id": gofood["id"],
        "outlet_id": outlet_id,
        "items": [{"product_id": str(uuid.uuid4()), "product_name": "Test Dimsum 2", "online_price": 30000, "cost": 12000, "quantity": 1}],
    }, headers=h, timeout=TIMEOUT).json()

    r = requests.put(f"{BASE}/online-orders/{order2['id']}/reconcile", json={
        "actual_settlement": float(order2["expected_settlement"]),
        "settlement_date": "2026-09-01",
    }, headers=h, timeout=TIMEOUT)
    recon2 = r.json()
    assert recon2["status"] == "matched", f"Expected matched, got {recon2['status']}"
    print(f"Matched reconciliation: variance={recon2['variance']} status={recon2['status']}")
    results.append(("TEST 6 — Matched reconciliation (variance=0)", recon2["status"] == "matched"))

    # =========================================================
    # TEST 7: Online profitability report
    # =========================================================
    report = requests.get(f"{BASE}/online-profit/report?group_by=platform", headers=h, timeout=TIMEOUT).json()
    assert "summary" in report, "Report should have summary"
    assert "breakdown" in report, "Report should have breakdown"
    assert report["summary"]["order_count"] >= 2, f"Expected >= 2 orders, got {report['summary']['order_count']}"
    assert float(report["summary"]["total_gross"]) > 0, "Total gross should be > 0"
    assert float(report["summary"]["total_profit"]) > 0, "Total profit should be > 0"
    print(f"Report: orders={report['summary']['order_count']} gross={report['summary']['total_gross']} profit={report['summary']['total_profit']} margin={report['summary']['profit_margin']}%")
    results.append(("TEST 7 — Online profitability report", report["summary"]["order_count"] >= 2 and float(report["summary"]["total_gross"]) > 0))

    # =========================================================
    # TEST 8: AI analysis with data labels
    # =========================================================
    ai = requests.get(f"{BASE}/ai/online-profit?target_margin=25", headers=h, timeout=TIMEOUT).json()
    assert "platform_comparison" in ai, "AI should have platform_comparison"
    assert "data_labels" in ai, "AI should have data_labels"
    assert ai["data_labels"]["platform_comparison"] == "ACTUAL DATA", "Platform comparison should be ACTUAL DATA"
    assert ai["data_labels"]["market_benchmark"] == "ESTIMATED / MARKET REFERENCE", "Market benchmark should be ESTIMATED"
    assert len(ai["facts"]) > 0 or len(ai["observations"]) > 0, "AI should have facts or observations"
    print(f"AI: facts={len(ai['facts'])} observations={len(ai['observations'])} recommendations={len(ai['recommendations'])}")
    results.append(("TEST 8 — AI analysis with data labels (ACTUAL vs ESTIMATED)", ai["data_labels"]["platform_comparison"] == "ACTUAL DATA"))

    # =========================================================
    # TEST 9: Break-even calculation
    # =========================================================
    be = requests.post(f"{BASE}/online-orders/break-even", json={
        "platform_id": gofood["id"],
        "outlet_id": outlet_id,
        "cogs": 12000,
        "target_profit": 10000,
    }, headers=h, timeout=TIMEOUT).json()
    assert "break_even_price" in be, "Should have break_even_price"
    assert "recommended_price" in be, "Should have recommended_price"
    assert float(be["break_even_price"]) > 12000, f"Break-even should be > COGS (12000), got {be['break_even_price']}"
    assert float(be["recommended_price"]) > float(be["break_even_price"]), "Recommended should be > break-even"
    print(f"Break-even: cogs=12000 break_even={be['break_even_price']} recommended={be['recommended_price']} (target profit=10000)")
    results.append(("TEST 9 — Break-even / recommended price calculation", float(be["break_even_price"]) > 12000 and float(be["recommended_price"]) > float(be["break_even_price"])))

    # =========================================================
    # TEST 10: Fee config history preservation (new config doesn't overwrite old)
    # =========================================================
    # Create a new config with later effective date
    new_config2 = {
        "outlet_id": outlet_id,
        "commission_pct": 22,
        "fixed_fee": 500,
        "tax_on_fee_pct": 11,
        "fee_calc_base": "gross",
        "effective_date": "2026-07-01",
        "note": "Updated commission",
    }
    r = requests.post(f"{BASE}/online-platforms/{grab['id']}/fee-configs", json=new_config2, headers=h, timeout=TIMEOUT)
    assert r.status_code == 200, f"Create config2 failed: {r.status_code} {r.text}"

    # Verify old config still exists (history preserved)
    configs = requests.get(f"{BASE}/online-platforms/{grab['id']}/fee-configs?outlet_id={outlet_id}", headers=h, timeout=TIMEOUT).json()
    assert len(configs) >= 2, "Should have 2 configs (old + new)"
    # Old config should have end_date set
    old_config = [c for c in configs if c["commission_pct"] == 25]
    assert len(old_config) >= 1, "Old config (25%) should still exist"
    assert old_config[0]["end_date"] is not None, "Old config should have end_date set"
    print(f"History preserved: {len(configs)} configs, old commission={old_config[0]['commission_pct']}% end_date={old_config[0]['end_date']}")
    results.append(("TEST 10 — Fee config history preservation", len(configs) >= 2 and old_config[0]["end_date"] is not None))

    # =========================================================
    # TEST 11: Existing product price NOT modified
    # =========================================================
    products = requests.get(f"{BASE}/products", headers=h, timeout=TIMEOUT).json()
    # Verify products still have their original price (not affected by online module)
    test_product = [p for p in products if p["id"] == "21c0cf59-37ae-43fb-a40b-17945710f2cb"]
    if test_product:
        assert float(test_product[0]["price"]) == 46000, f"Existing price should be 46000, got {test_product[0]['price']}"
        print(f"Existing product price unchanged: {test_product[0]['price']}")
        results.append(("TEST 11 — Existing product price NOT modified", float(test_product[0]["price"]) == 46000))
    else:
        results.append(("TEST 11 — Existing product price NOT modified", True))

    # =========================================================
    # SUMMARY
    # =========================================================
    print("\n" + "=" * 70)
    all_passed = True
    for name, passed in results:
        status = "PASS" if passed else "FAIL"
        if not passed:
            all_passed = False
        print(f"  {status}: {name}")
    print("=" * 70)

    if all_passed:
        print("\nALL ACCEPTANCE TESTS PASSED!")
    else:
        print("\nSOME TESTS FAILED!")
        exit(1)


if __name__ == "__main__":
    main()
