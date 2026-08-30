"""
Phase 7 — Comprehensive Multi-Outlet + Authorization Test Suite.
Tests: owner/admin/manager/kasir access, outlet filtering, permissions, AI, regression.
"""
import requests
import json
import sys

BASE = 'http://localhost:8001/api'
results = []

def test(name, condition, detail=""):
    status = "PASS" if condition else "FAIL"
    results.append((name, condition, detail))
    print(f"  {status}  {name}" + (f" — {detail}" if detail and not condition else ""))

def login(email, password):
    r = requests.post(f'{BASE}/auth/login', json={'email': email, 'password': password})
    if r.status_code != 200:
        return None, None
    tok = r.json()['token']
    # Get full user info via /auth/me
    r2 = requests.get(f'{BASE}/auth/me', headers=H(tok))
    if r2.status_code == 200:
        return tok, r2.json()
    return tok, r.json()

def H(token):
    return {'Authorization': f'Bearer {token}'}

# ============================================================
# CREDENTIALS
# ============================================================
OWNER = ('owner@republikdimsum.id', 'Owner@2026')
ADMIN = None  # Will find admin user
MANAGER = ('manager.budi@republikdimsum.id', 'Manager@2026')
KASIR = ('kasir@sutankhulifah.com', 'Kasir@2026')

# Outlet IDs
OUTLET_MAIN = '10000000-0000-0000-0000-000000000001'
OUTLET_2 = '10000000-0000-0000-0000-000000000002'
OUTLET_3 = '10000000-0000-0000-0000-000000000003'

print("\n" + "=" * 60)
print("PHASE 7 — COMPREHENSIVE TEST SUITE")
print("=" * 60)

# ============================================================
# 1. LOGIN & ROLE VERIFICATION
# ============================================================
print("\n--- 1. LOGIN & ROLE VERIFICATION ---")

owner_tok, owner_user = login(*OWNER)
test("Owner login", owner_tok is not None, f"Status: {owner_user is not None}")
test("Owner role is 'owner'", owner_user and owner_user.get('role') == 'owner')
test("Owner outlet_ids empty (all outlets)", owner_user and owner_user.get('outlet_ids') == [])

mgr_tok, mgr_user = login(*MANAGER)
test("Manager login", mgr_tok is not None)
test("Manager role is 'manager'", mgr_user and mgr_user.get('role') == 'manager')
test("Manager has outlet_ids", mgr_user and len(mgr_user.get('outlet_ids', [])) > 0)

ksr_tok, ksr_user = login(*KASIR)
test("Kasir login", ksr_tok is not None)
test("Kasir role is 'kasir'", ksr_user and ksr_user.get('role') == 'kasir')
test("Kasir has outlet_ids", ksr_user and len(ksr_user.get('outlet_ids', [])) > 0)

# ============================================================
# 2. OUTLET ACCESS
# ============================================================
print("\n--- 2. OUTLET ACCESS ---")

# Owner can see all outlets
r = requests.get(f'{BASE}/outlets/my', headers=H(owner_tok))
test("Owner /outlets/my", r.status_code == 200)
test("Owner all_access=True", r.json().get('all_access') == True)
test("Owner sees 3 outlets", len(r.json().get('outlets', [])) == 3, f"Got {len(r.json().get('outlets', []))}")

# Manager sees only assigned outlets
r = requests.get(f'{BASE}/outlets/my', headers=H(mgr_tok))
test("Manager /outlets/my", r.status_code == 200)
test("Manager all_access=False", r.json().get('all_access') == False)
test("Manager sees 1 outlet", len(r.json().get('outlets', [])) == 1, f"Got {len(r.json().get('outlets', []))}")

# Kasir sees only assigned outlets
r = requests.get(f'{BASE}/outlets/my', headers=H(ksr_tok))
test("Kasir /outlets/my", r.status_code == 200)
test("Kasir all_access=False", r.json().get('all_access') == False)

# ============================================================
# 3. DASHBOARD OUTLET FILTERING
# ============================================================
print("\n--- 3. DASHBOARD OUTLET FILTERING ---")

# Owner can see all outlets dashboard
r = requests.get(f'{BASE}/reports/dashboard?period=daily', headers=H(owner_tok))
test("Owner dashboard (all)", r.status_code == 200)
test("Owner dashboard has branch_comparison", len(r.json().get('branch_comparison', [])) > 0)

# Owner can filter by specific outlet
r = requests.get(f'{BASE}/reports/dashboard?period=daily&outlet_id={OUTLET_MAIN}', headers=H(owner_tok))
test("Owner dashboard (filtered)", r.status_code == 200)
test("Owner dashboard filtered has outlet_id", r.json().get('outlet_id') == OUTLET_MAIN)

# Manager dashboard auto-filtered
r = requests.get(f'{BASE}/reports/dashboard?period=daily', headers=H(mgr_tok))
test("Manager dashboard (auto-filter)", r.status_code == 200)

# Manager cannot access other outlet dashboard
r = requests.get(f'{BASE}/reports/dashboard?period=daily&outlet_id={OUTLET_2}', headers=H(mgr_tok))
test("Manager dashboard other outlet blocked", r.status_code in [403, 401], f"Got {r.status_code}")

# ============================================================
# 4. SALES MONITORING
# ============================================================
print("\n--- 4. SALES MONITORING ---")

r = requests.get(f'{BASE}/reports/sales-monitor?limit=10', headers=H(owner_tok))
test("Owner sales-monitor", r.status_code == 200)
test("Owner sales-monitor has data", 'sales' in r.json())

r = requests.get(f'{BASE}/reports/sales-monitor?limit=10', headers=H(mgr_tok))
test("Manager sales-monitor", r.status_code == 200)

r = requests.get(f'{BASE}/reports/sales-monitor?limit=10', headers=H(ksr_tok))
test("Kasir sales-monitor blocked", r.status_code == 403)

# ============================================================
# 5. BRANCH COMPARISON
# ============================================================
print("\n--- 5. BRANCH COMPARISON ---")

r = requests.get(f'{BASE}/reports/branch-comparison?period=daily', headers=H(owner_tok))
test("Owner branch-comparison", r.status_code == 200)
test("Owner sees all outlets in comparison", len(r.json().get('outlets', [])) == 3)

r = requests.get(f'{BASE}/reports/branch-comparison?period=daily', headers=H(mgr_tok))
test("Manager branch-comparison", r.status_code == 200)
test("Manager sees only assigned outlet", len(r.json().get('outlets', [])) <= 1)

# ============================================================
# 6. SHIFTS REPORT
# ============================================================
print("\n--- 6. SHIFTS REPORT ---")

r = requests.get(f'{BASE}/reports/shifts', headers=H(owner_tok))
test("Owner shifts report", r.status_code == 200)

r = requests.get(f'{BASE}/reports/shifts?outlet_id={OUTLET_MAIN}', headers=H(owner_tok))
test("Owner shifts report (filtered)", r.status_code == 200)

r = requests.get(f'{BASE}/reports/shifts', headers=H(mgr_tok))
test("Manager shifts report", r.status_code == 200)

# ============================================================
# 7. SALES LIST OUTLET FILTER
# ============================================================
print("\n--- 7. SALES LIST ---")

r = requests.get(f'{BASE}/sales?limit=5', headers=H(owner_tok))
test("Owner sales list", r.status_code == 200)

r = requests.get(f'{BASE}/sales?limit=5&outlet_id={OUTLET_MAIN}', headers=H(owner_tok))
test("Owner sales list (filtered)", r.status_code == 200)

r = requests.get(f'{BASE}/sales?limit=5', headers=H(mgr_tok))
test("Manager sales list", r.status_code == 200)

# ============================================================
# 8. PERMISSION ENFORCEMENT
# ============================================================
print("\n--- 8. PERMISSION ENFORCEMENT ---")

# Owner can access roles
r = requests.get(f'{BASE}/roles', headers=H(owner_tok))
test("Owner can list roles", r.status_code == 200)

# Manager cannot access roles
r = requests.get(f'{BASE}/roles', headers=H(mgr_tok))
test("Manager cannot list roles", r.status_code in [403, 401], f"Got {r.status_code}")

# Kasir cannot access roles
r = requests.get(f'{BASE}/roles', headers=H(ksr_tok))
test("Kasir cannot list roles", r.status_code in [403, 401], f"Got {r.status_code}")

# Owner can list users
r = requests.get(f'{BASE}/users', headers=H(owner_tok))
test("Owner can list users", r.status_code == 200)

# Kasir cannot list users
r = requests.get(f'{BASE}/users', headers=H(ksr_tok))
test("Kasir cannot list users", r.status_code in [403, 401], f"Got {r.status_code}")

# ============================================================
# 9. AI ENDPOINTS
# ============================================================
print("\n--- 9. AI ENDPOINTS ---")

# AI Assistant
r = requests.post(f'{BASE}/ai/assistant', headers=H(owner_tok), json={'question': 'Produk apa yang paling laku minggu ini?'})
test("Owner AI assistant", r.status_code == 200)
test("AI assistant returns answer", 'answer' in r.json())
test("AI assistant has data_sources", 'data_sources' in r.json())

# AI Daily Briefing
r = requests.get(f'{BASE}/ai/daily-briefing', headers=H(owner_tok))
test("Owner AI daily-briefing", r.status_code == 200)
test("AI briefing has briefings array", 'briefings' in r.json())
test("AI briefing has summary", 'summary' in r.json())

# AI Anomalies
r = requests.get(f'{BASE}/ai/anomalies', headers=H(owner_tok))
test("Owner AI anomalies", r.status_code == 200)
test("AI anomalies has count", 'count' in r.json())

# AI Forecast
r = requests.get(f'{BASE}/ai/forecast?days=7', headers=H(owner_tok))
test("Owner AI forecast", r.status_code == 200)
test("AI forecast has confidence", 'confidence' in r.json())

# Manager cannot access AI (no ai permission)
r = requests.post(f'{BASE}/ai/assistant', headers=H(mgr_tok), json={'question': 'Berapa total penjualan hari ini?'})
test("Manager AI assistant blocked", r.status_code in [403, 401], f"Got {r.status_code}")

# Kasir cannot access AI (no ai permission)
r = requests.post(f'{BASE}/ai/assistant', headers=H(ksr_tok), json={'question': 'test'})
test("Kasir AI assistant blocked", r.status_code in [403, 401], f"Got {r.status_code}")

# ============================================================
# 10. MENU VISIBILITY
# ============================================================
print("\n--- 10. MENU VISIBILITY ---")

r = requests.get(f'{BASE}/menus/my-menus', headers=H(owner_tok))
test("Owner my-menus", r.status_code == 200)
test("Owner sees all menus", len(r.json()) >= 17, f"Got {len(r.json())}")

r = requests.get(f'{BASE}/menus/my-menus', headers=H(mgr_tok))
test("Manager my-menus", r.status_code == 200)
test("Manager sees menus", len(r.json()) > 0)

r = requests.get(f'{BASE}/menus/my-menus', headers=H(ksr_tok))
test("Kasir my-menus", r.status_code == 200)
test("Kasir sees limited menus", len(r.json()) <= 5, f"Got {len(r.json())}")

# ============================================================
# 11. UNAUTHENTICATED ACCESS
# ============================================================
print("\n--- 11. UNAUTHENTICATED ACCESS ---")

r = requests.get(f'{BASE}/reports/dashboard')
test("Unauth dashboard blocked", r.status_code in [401, 403, 422], f"Got {r.status_code}")

r = requests.get(f'{BASE}/sales')
test("Unauth sales blocked", r.status_code in [401, 403, 422], f"Got {r.status_code}")

r = requests.get(f'{BASE}/users')
test("Unauth users blocked", r.status_code in [401, 403, 422], f"Got {r.status_code}")

r = requests.post(f'{BASE}/ai/assistant', json={'question': 'test'})
test("Unauth AI blocked", r.status_code in [401, 403, 422], f"Got {r.status_code}")

# ============================================================
# 12. OUTLET AUTHORIZATION ON WRITES
# ============================================================
print("\n--- 12. OUTLET AUTHORIZATION ---")

# Manager cannot create outlet
r = requests.post(f'{BASE}/outlets', headers=H(mgr_tok), json={'name': 'Test Outlet', 'address': 'Test'})
test("Manager cannot create outlet", r.status_code in [403, 401], f"Got {r.status_code}")

# Kasir cannot create outlet
r = requests.post(f'{BASE}/outlets', headers=H(ksr_tok), json={'name': 'Test Outlet', 'address': 'Test'})
test("Kasir cannot create outlet", r.status_code in [403, 401], f"Got {r.status_code}")

# ============================================================
# RESULTS
# ============================================================
print("\n" + "=" * 60)
passed = sum(1 for _, c, _ in results if c)
failed = sum(1 for _, c, _ in results if not c)
total = len(results)
print(f"RESULTS: {passed} passed, {failed} failed, {total} total")
print("=" * 60)

if failed > 0:
    print("\nFAILURES:")
    for name, cond, detail in results:
        if not cond:
            print(f"  - {name}: {detail}")

sys.exit(0 if failed == 0 else 1)
