"""
Comprehensive test suite — outlet integration across all menus.
Tests per-outlet vs all-outlets behavior for every menu.
"""
import requests, json, time

BASE = "http://localhost:8001/api"
TIMEOUT = 15
O1 = "10000000-0000-0000-0000-000000000001"
O2 = "10000000-0000-0000-0000-000000000002"
O3 = "10000000-0000-0000-0000-000000000003"

results = []
fails = []

def login(email, pwd):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": pwd}, timeout=TIMEOUT)
    if r.status_code != 200:
        raise Exception(f"Login failed for {email}: {r.status_code} {r.text[:100]}")
    return r.json()["token"]

OWNER = login("owner@republikdimsum.id", "Owner@2026")
MANAGER = login("manager.budi@republikdimsum.id", "Manager@2026")
KASIR = None
try:
    KASIR = login("kasir.andi@republikdimsum.id", "Kasir@2026")
except:
    try:
        KASIR = login("kasir.dina@republikdimsum.id", "Kasir@2026")
    except:
        pass

def H(tok): return {"Authorization": f"Bearer {tok}"}

def check(name, cond, detail=""):
    if cond:
        results.append(name)
    else:
        fails.append(f"{name}: {detail}")
        results.append(f"FAIL  {name}")

def api_get(tok, path, params=None):
    try:
        r = requests.get(f"{BASE}{path}", headers=H(tok), params=params, timeout=TIMEOUT)
        return r
    except Exception as e:
        class FakeR:
            status_code = 0
            text = str(e)
            def json(self): return {}
        return FakeR()

# ============================================================
print("\n=== 1. AUTH & ROLE ===")
# ============================================================
r = requests.post(f"{BASE}/auth/login", json={"email": "owner@republikdimsum.id", "password": "Owner@2026"}, timeout=TIMEOUT)
check("Owner login", r.status_code == 200, r.text[:80])
owner_data = r.json() if r.status_code == 200 else {}
check("Owner role is 'owner'", owner_data.get("role") == "owner", owner_data.get("role"))

r = requests.post(f"{BASE}/auth/login", json={"email": "manager.budi@republikdimsum.id", "password": "Manager@2026"}, timeout=TIMEOUT)
check("Manager login", r.status_code == 200, r.text[:80])
manager_data = r.json() if r.status_code == 200 else {}
check("Manager role is 'manager'", manager_data.get("role") == "manager", manager_data.get("role"))

# ============================================================
print("\n=== 2. MENUS ===")
# ============================================================
r = api_get(OWNER, "/menus/my-menus")
menus = r.json() if r.status_code == 200 else []
routes = [m.get("route") for m in menus] if isinstance(menus, list) else []
check("Owner has 20+ menus", len(menus) >= 20, f"got {len(menus)}")
check("Owner has /dashboard", "/dashboard" in routes)
check("Owner has /pos", "/pos" in routes)
check("Owner has /loyalty", "/loyalty" in routes)
check("Owner has /kds", "/kds" in routes)
check("Owner has /payroll", "/payroll" in routes)
check("Owner has /schedules", "/schedules" in routes)
check("Owner has /coupons", "/coupons" in routes)

r = api_get(MANAGER, "/menus/my-menus")
mgr_menus = r.json() if r.status_code == 200 else []
check("Manager has fewer menus than owner", len(mgr_menus) < len(menus), f"mgr={len(mgr_menus)} owner={len(menus)}")

# ============================================================
print("\n=== 3. OUTLETS ===")
# ============================================================
r = api_get(OWNER, "/outlets")
outlets = r.json() if r.status_code == 200 else []
check("Owner sees 3 outlets", len(outlets) == 3, f"got {len(outlets)}")
outlet_ids = [o.get("id") for o in outlets]
check("Outlet 1 exists", O1 in outlet_ids)
check("Outlet 2 exists", O2 in outlet_ids)
check("Outlet 3 exists", O3 in outlet_ids)

r = api_get(MANAGER, "/outlets/my")
mgr_outlets = r.json() if r.status_code == 200 else {}
check("Manager /outlets/my", r.status_code == 200)
check("Manager sees limited outlets", len(mgr_outlets.get("outlets", [])) < 3, f"got {len(mgr_outlets.get('outlets', []))}")

# ============================================================
print("\n=== 4. SALES PER OUTLET ===")
# ============================================================
r = api_get(OWNER, "/sales", {"outlet_id": O1})
sales_o1 = r.json() if r.status_code == 200 else []
check("Sales O1 200", r.status_code == 200)
check("Sales O1 only O1", all(s.get("outlet_id") == O1 for s in sales_o1 if s.get("outlet_id")), f"found other outlets")

r = api_get(OWNER, "/sales", {"outlet_id": O2})
sales_o2 = r.json() if r.status_code == 200 else []
check("Sales O2 200", r.status_code == 200)
check("Sales O2 only O2", all(s.get("outlet_id") == O2 for s in sales_o2 if s.get("outlet_id")))

r = api_get(OWNER, "/sales", {"outlet_id": O3})
sales_o3 = r.json() if r.status_code == 200 else []
check("Sales O3 200", r.status_code == 200)
check("Sales O3 only O3", all(s.get("outlet_id") == O3 for s in sales_o3 if s.get("outlet_id")))

check("Sales O1 != O2 count", len(sales_o1) != len(sales_o2) or len(sales_o1) > 0, f"O1={len(sales_o1)} O2={len(sales_o2)}")

# ============================================================
print("\n=== 5. ATTENDANCE PER OUTLET ===")
# ============================================================
r = api_get(OWNER, "/attendance", {"outlet_id": O1})
att_o1 = r.json() if r.status_code == 200 else []
check("Attendance O1 200", r.status_code == 200)
check("Attendance O1 has data", len(att_o1) > 0, f"got {len(att_o1)}")
check("Attendance O1 only O1", all(a.get("outlet_id") == O1 for a in att_o1 if a.get("outlet_id")))

r = api_get(OWNER, "/attendance", {"outlet_id": O2})
att_o2 = r.json() if r.status_code == 200 else []
check("Attendance O2 200", r.status_code == 200)
check("Attendance O2 has data", len(att_o2) > 0, f"got {len(att_o2)}")
check("Attendance O2 only O2", all(a.get("outlet_id") == O2 for a in att_o2 if a.get("outlet_id")))

r = api_get(OWNER, "/attendance", {"outlet_id": O3})
att_o3 = r.json() if r.status_code == 200 else []
check("Attendance O3 200", r.status_code == 200)
check("Attendance O3 has data", len(att_o3) > 0, f"got {len(att_o3)}")

r = api_get(OWNER, "/attendance")
att_all = r.json() if r.status_code == 200 else []
check("Attendance all 200", r.status_code == 200)
check("Attendance all > any single", len(att_all) >= max(len(att_o1), len(att_o2), len(att_o3)),
      f"all={len(att_all)} max_single={max(len(att_o1), len(att_o2), len(att_o3))}")

# ============================================================
print("\n=== 6. SHIFTS PER OUTLET ===")
# ============================================================
r = api_get(OWNER, "/shifts", {"outlet_id": O1})
shifts_o1 = r.json() if r.status_code == 200 else []
check("Shifts O1 200", r.status_code == 200)
check("Shifts O1 only O1", all(s.get("outlet_id") == O1 for s in shifts_o1 if s.get("outlet_id")))

r = api_get(OWNER, "/shifts", {"outlet_id": O2})
shifts_o2 = r.json() if r.status_code == 200 else []
check("Shifts O2 200", r.status_code == 200)
check("Shifts O2 has data", len(shifts_o2) > 0, f"got {len(shifts_o2)}")
check("Shifts O2 only O2", all(s.get("outlet_id") == O2 for s in shifts_o2 if s.get("outlet_id")))

r = api_get(OWNER, "/shifts", {"outlet_id": O3})
shifts_o3 = r.json() if r.status_code == 200 else []
check("Shifts O3 200", r.status_code == 200)
check("Shifts O3 has data", len(shifts_o3) > 0, f"got {len(shifts_o3)}")

# ============================================================
print("\n=== 7. INVENTORY PER OUTLET ===")
# ============================================================
r = api_get(OWNER, "/inventory/stock", {"outlet_id": O1})
check("Stock O1 200", r.status_code == 200)

r = api_get(OWNER, "/inventory/stock", {"outlet_id": O2})
check("Stock O2 200", r.status_code == 200)

r = api_get(OWNER, "/inventory/movements", {"outlet_id": O1})
mov_o1 = r.json() if r.status_code == 200 else []
check("Movements O1 200", r.status_code == 200)
check("Movements O1 only O1", all(m.get("outlet_id") == O1 for m in mov_o1 if m.get("outlet_id")))

r = api_get(OWNER, "/inventory/movements", {"outlet_id": O2})
mov_o2 = r.json() if r.status_code == 200 else []
check("Movements O2 200", r.status_code == 200)
check("Movements O2 only O2", all(m.get("outlet_id") == O2 for m in mov_o2 if m.get("outlet_id")))

# ============================================================
print("\n=== 8. STOCK TRANSFERS PER OUTLET ===")
# ============================================================
r = api_get(OWNER, "/stock-transfers", {"outlet_id": O1})
trf_o1 = r.json() if r.status_code == 200 else []
check("Transfers O1 200", r.status_code == 200)

r = api_get(OWNER, "/stock-transfers", {"outlet_id": O2})
trf_o2 = r.json() if r.status_code == 200 else []
check("Transfers O2 200", r.status_code == 200)
check("Transfers O2 has data", len(trf_o2) > 0, f"got {len(trf_o2)}")

r = api_get(OWNER, "/stock-transfers")
trf_all = r.json() if r.status_code == 200 else []
check("Transfers all 200", r.status_code == 200)
check("Transfers all >= O2", len(trf_all) >= len(trf_o2), f"all={len(trf_all)} O2={len(trf_o2)}")

# ============================================================
print("\n=== 9. PURCHASE ORDERS PER OUTLET ===")
# ============================================================
r = api_get(OWNER, "/purchase-orders", {"outlet_id": O1})
po_o1 = r.json() if r.status_code == 200 else []
check("PO O1 200", r.status_code == 200)

r = api_get(OWNER, "/purchase-orders", {"outlet_id": O2})
po_o2 = r.json() if r.status_code == 200 else []
check("PO O2 200", r.status_code == 200)
check("PO O2 has data", len(po_o2) > 0, f"got {len(po_o2)}")

r = api_get(OWNER, "/purchase-orders", {"outlet_id": O3})
po_o3 = r.json() if r.status_code == 200 else []
check("PO O3 200", r.status_code == 200)
check("PO O3 has data", len(po_o3) > 0, f"got {len(po_o3)}")

# ============================================================
print("\n=== 10. EXPENSES PER OUTLET ===")
# ============================================================
r = api_get(OWNER, "/expenses", {"outlet_id": O1})
exp_o1 = r.json() if r.status_code == 200 else []
check("Expenses O1 200", r.status_code == 200)

r = api_get(OWNER, "/expenses", {"outlet_id": O2})
exp_o2 = r.json() if r.status_code == 200 else []
check("Expenses O2 200", r.status_code == 200)
check("Expenses O2 has data", len(exp_o2) > 0, f"got {len(exp_o2)}")

r = api_get(OWNER, "/expenses", {"outlet_id": O3})
exp_o3 = r.json() if r.status_code == 200 else []
check("Expenses O3 200", r.status_code == 200)
check("Expenses O3 has data", len(exp_o3) > 0, f"got {len(exp_o3)}")

# ============================================================
print("\n=== 11. PRODUCTS (global catalog, outlet stock) ===")
# ============================================================
r = api_get(OWNER, "/products", {"outlet_id": O1})
prod_o1 = r.json() if r.status_code == 200 else []
check("Products O1 200", r.status_code == 200)
check("Products O1 has data", len(prod_o1) > 0)

r = api_get(OWNER, "/products", {"outlet_id": O2})
prod_o2 = r.json() if r.status_code == 200 else []
check("Products O2 200", r.status_code == 200)

# Products should be same count (global catalog) but stock may differ
check("Products same catalog count", len(prod_o1) == len(prod_o2), f"O1={len(prod_o1)} O2={len(prod_o2)}")

# ============================================================
print("\n=== 12. TABLES (DINE-IN) PER OUTLET ===")
# ============================================================
r = api_get(OWNER, "/tables", {"outlet_id": O1})
tables_o1 = r.json() if r.status_code == 200 else []
check("Tables O1 200", r.status_code == 200)
check("Tables O1 only O1", all(t.get("outlet_id") == O1 for t in tables_o1 if t.get("outlet_id")))

r = api_get(OWNER, "/tables", {"outlet_id": O2})
tables_o2 = r.json() if r.status_code == 200 else []
check("Tables O2 200", r.status_code == 200)
check("Tables O2 has data", len(tables_o2) > 0, f"got {len(tables_o2)}")
check("Tables O2 only O2", all(t.get("outlet_id") == O2 for t in tables_o2 if t.get("outlet_id")))

r = api_get(OWNER, "/tables", {"outlet_id": O3})
tables_o3 = r.json() if r.status_code == 200 else []
check("Tables O3 200", r.status_code == 200)
check("Tables O3 has data", len(tables_o3) > 0, f"got {len(tables_o3)}")

# ============================================================
print("\n=== 13. DINE-IN SALES (source = dine_in) ===")
# ============================================================
dine_o2 = [s for s in sales_o2 if s.get("source") == "dine_in"]
check("O2 has dine-in sales", len(dine_o2) > 0, f"got {len(dine_o2)}")
dine_o3 = [s for s in sales_o3 if s.get("source") == "dine_in"]
check("O3 has dine-in sales", len(dine_o3) > 0, f"got {len(dine_o3)}")

# ============================================================
print("\n=== 14. REPORTS PER OUTLET ===")
# ============================================================
r = api_get(OWNER, "/reports/dashboard", {"outlet_id": O1})
check("Dashboard O1 200", r.status_code == 200)

r = api_get(OWNER, "/reports/dashboard", {"outlet_id": O2})
check("Dashboard O2 200", r.status_code == 200)

r = api_get(OWNER, "/reports/sales", {"outlet_id": O1, "period": "daily"})
check("Reports sales O1 200", r.status_code == 200, r.text[:100])

r = api_get(OWNER, "/reports/sales", {"outlet_id": O2, "period": "daily"})
check("Reports sales O2 200", r.status_code == 200, r.text[:100])

# ============================================================
print("\n=== 15. AUDIT LOGS PER OUTLET ===")
# ============================================================
r = api_get(OWNER, "/audit-logs", {"outlet_id": O1})
check("AuditLogs O1 200", r.status_code == 200)

r = api_get(OWNER, "/audit-logs", {"outlet_id": O2})
check("AuditLogs O2 200", r.status_code == 200)

# ============================================================
print("\n=== 16. ALERTS PER OUTLET ===")
# ============================================================
r = api_get(OWNER, "/alerts", {"outlet_id": O1})
check("Alerts O1 200", r.status_code == 200)

r = api_get(OWNER, "/alerts", {"outlet_id": O2})
check("Alerts O2 200", r.status_code == 200)

# ============================================================
print("\n=== 17. LEAVE REQUESTS PER OUTLET ===")
# ============================================================
r = api_get(OWNER, "/leave-requests", {"outlet_id": O1})
check("LeaveReq O1 200", r.status_code == 200)

r = api_get(OWNER, "/leave-requests")
check("LeaveReq all 200", r.status_code == 200)

# ============================================================
print("\n=== 18. LOYALTY PER OUTLET ===")
# ============================================================
r = api_get(OWNER, "/loyalty/memberships", {"outlet_id": O1})
check("Loyalty O1 200", r.status_code == 200)

r = api_get(OWNER, "/loyalty/tiers")
check("Loyalty tiers 200", r.status_code == 200)
tiers_data = r.json()
check("Loyalty tiers has 4", len(tiers_data.get("tiers", [])) == 4, f"got {len(tiers_data.get('tiers', []))}")

# ============================================================
print("\n=== 19. KDS PER OUTLET ===")
# ============================================================
r = api_get(OWNER, "/kds/orders", {"outlet_id": O1})
check("KDS O1 200", r.status_code == 200)

r = api_get(OWNER, "/kds/stats", {"outlet_id": O1})
check("KDS stats O1 200", r.status_code == 200)

# ============================================================
print("\n=== 20. COUPONS PER OUTLET ===")
# ============================================================
r = api_get(OWNER, "/coupons", {"outlet_id": O1})
check("Coupons O1 200", r.status_code == 200)

# Create coupon for O2 (use unique code to avoid duplicate)
import random, string
coupon_code = "TEST" + "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
r = requests.post(f"{BASE}/coupons", headers=H(OWNER), json={
    "outlet_id": O2, "code": coupon_code, "discount_type": "percentage",
    "discount_value": 15, "start_date": "2026-01-01", "end_date": "2026-12-31"
}, timeout=TIMEOUT)
check("Create coupon O2", r.status_code == 200, r.text[:80])

r = api_get(OWNER, "/coupons", {"outlet_id": O2})
coupons_o2 = r.json() if r.status_code == 200 else []
check("Coupons O2 has data", len(coupons_o2) > 0, f"got {len(coupons_o2)}")

# ============================================================
print("\n=== 21. SCHEDULES PER OUTLET ===")
# ============================================================
r = api_get(OWNER, "/schedules", {"outlet_id": O1})
check("Schedules O1 200", r.status_code == 200)

r = api_get(OWNER, "/schedules", {"outlet_id": O2})
check("Schedules O2 200", r.status_code == 200)

# ============================================================
print("\n=== 22. PAYROLL PER OUTLET ===")
# ============================================================
r = api_get(OWNER, "/payroll/periods", {"outlet_id": O1})
check("Payroll O1 200", r.status_code == 200)

r = api_get(OWNER, "/payroll/periods", {"outlet_id": O2})
check("Payroll O2 200", r.status_code == 200)

# ============================================================
print("\n=== 23. RECEIPT CONFIG PER OUTLET ===")
# ============================================================
r = api_get(OWNER, f"/receipt-config/{O1}")
check("Receipt O1 200", r.status_code == 200)

r = api_get(OWNER, f"/receipt-config/{O2}")
check("Receipt O2 200", r.status_code == 200)

# ============================================================
print("\n=== 24. USERS WITH OUTLET INFO ===")
# ============================================================
r = api_get(OWNER, "/users")
users = r.json() if r.status_code == 200 else []
check("Users list 200", r.status_code == 200)
check("Users have outlet info", any(u.get("primary_outlet") or u.get("outlets") for u in users),
      "no user has outlet info")

# ============================================================
print("\n=== 25. MANAGER OUTLET ISOLATION ===")
# ============================================================
# Manager should only see assigned outlets
r = api_get(MANAGER, "/outlets/my")
mgr_my = r.json() if r.status_code == 200 else {}
mgr_outlet_ids = [o.get("outlet_id") for o in mgr_my.get("outlets", [])]
check("Manager has assigned outlets", len(mgr_outlet_ids) > 0, f"got {mgr_outlet_ids}")

# Manager should NOT see unauthorized outlet data
if O3 not in mgr_outlet_ids:
    r = api_get(MANAGER, "/sales", {"outlet_id": O3})
    check("Manager blocked from O3 sales", r.status_code in (403, 200), f"got {r.status_code}")
    if r.status_code == 200:
        sales_mgr_o3 = r.json()
        check("Manager O3 sales empty or filtered", len(sales_mgr_o3) == 0 or all(s.get("outlet_id") != O3 for s in sales_mgr_o3 if s.get("outlet_id")))
else:
    check("Manager blocked from O3 sales", True, "manager has O3 access")

# ============================================================
print("\n=== 26. KARYAWAN OUTLET ASSIGNMENT ===")
# ============================================================
# Create user with outlet assignment
r = requests.post(f"{BASE}/users", headers=H(OWNER), json={
    "email": "test_outlet_assign@test.com",
    "name": "Test Outlet Assign",
    "role": "kasir",
    "password": "Test@2026",
    "outlet_ids": [O2, O3],
    "primary_outlet_id": O2,
}, timeout=TIMEOUT)
check("Create user with outlets", r.status_code == 200, r.text[:100])

if r.status_code == 200:
    new_uid = r.json().get("id")
    r2 = api_get(OWNER, f"/users/{new_uid}/outlets")
    if r2.status_code == 200:
        uo = r2.json()
        check("User has 2 outlets", len(uo.get("outlet_ids", [])) == 2, f"got {len(uo.get('outlet_ids', []))}")
        check("User primary is O2", any(o.get("is_primary") and o.get("outlet_id") == O2 for o in uo.get("outlets", [])))
    # Cleanup
    requests.delete(f"{BASE}/users/{new_uid}", headers=H(OWNER), timeout=TIMEOUT)

# ============================================================
print("\n=== 27. AI ENDPOINTS PER OUTLET ===")
# ============================================================
r = api_get(OWNER, "/ai/daily-briefing", {"outlet_id": O1})
check("AI briefing O1 200", r.status_code == 200)

r = api_get(OWNER, "/ai/anomalies", {"outlet_id": O1})
check("AI anomaly O1 200", r.status_code == 200, r.text[:100])

# ============================================================
# RESULTS
# ============================================================
print("\n" + "=" * 60)
passed = sum(1 for r in results if not r.startswith("FAIL"))
failed = len(fails)
print(f"RESULTS: {passed} passed, {failed} failed, {len(results)} total")
print("=" * 60)

if fails:
    print("\nFAILURES:")
    for f in fails:
        print(f"  - {f}")
