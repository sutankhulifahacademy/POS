# DASHBOARD — BUSINESS & TECHNICAL DOCUMENTATION

> Dokumentasi AS-IS berdasarkan audit source code.
> Source: `frontend/src/pages/Dashboard.js`, `backend/routes/reports.py`, `backend/sql/postgres_schema.sql`

---

## 1. Module Overview

Dashboard adalah halaman ringkasan operasional utama yang menampilkan KPI (Key Performance Indicator) penjualan, transaksi, item terjual, produk stok rendah, pelanggan, dan grafik pendapatan. Dashboard merupakan landing page default untuk role owner, admin, manager, dan supervisor setelah login.

---

## 2. Business Purpose

Memberikan gambaran cepat kepada manajemen/owner mengenai performa bisnis pada periode tertentu (harian, mingguan, bulanan, tahunan) dalam konteks outlet yang dipilih.

---

## 3. Business Objective

- Memantau revenue dan jumlah transaksi secara real-time.
- Mendeteksi produk dengan stok rendah.
- Melihat tren penjualan via grafik.
- Membandingkan performa antar outlet (untuk owner).

---

## 4. Actors / Roles

| Role | Akses | Keterangan |
|------|-------|------------|
| Owner | YA | Lihat semua outlet + selector outlet |
| Admin | YA | Lihat outlet yang di-assign |
| Manager | YA | Lihat outlet yang di-assign |
| Supervisor | YA | Lihat outlet yang di-assign |
| Kasir | TIDAK | Default landing = `/pos` |

Berdasarkan `frontend/src/components/Layout.js` line 94: `defaultLandingFor` mengarahkan `kasir` ke `/pos`, role lain ke `/dashboard`.

---

## 5. Outlet Scope

**Klasifikasi: OUTLET-SCOPED**

- Owner: dapat memilih outlet via dropdown global (`ALL OUTLETS` atau outlet spesifik).
- Non-owner: terbatas pada `user["outlet_ids"]`, outlet selector bersifat read-only.
- Frontend mengirim `outlet_id` sebagai query param ke API.
- Backend memfilter data berdasarkan `outlet_id` atau `filter_outlets_for_user`.

Sumber: `frontend/src/context/OutletContext.js` lines 19-47, `frontend/src/pages/Dashboard.js` line 101.

---

## 6. Role & Permission

| Aksi | Owner | Admin | Manager | Supervisor | Kasir |
|------|-------|-------|---------|------------|-------|
| View Dashboard | YA | YA | YA | YA | TIDAK |

Backend: `GET /api/reports/dashboard` memerlukan `require_role("owner","admin","manager","supervisor")` — `backend/routes/reports.py` line 83.

---

## 7. Business Flow

```
USER LOGIN
 ↓
REDIRECT KE /DASHBOARD
 ↓
OUTLET CONTEXT DIPILIH (auto / selector)
 ↓
PILIH PERIODE (daily/weekly/monthly/yearly)
 ↓
SISTEM AMBIL DATA DARI API
 ↓
TAMPILKAN KPI + GRAFIK
 ↓
USER ANALISA
```

---

## 8. Detailed Business Rules

1. User login dengan role owner/admin/manager/supervisor → redirect ke `/dashboard`.
2. Sistem memuat outlet context dari `GET /api/outlets/my`.
3. Owner melihat dropdown outlet; non-owner melihat outlet label read-only.
4. User memilih periode: daily, weekly, monthly, yearly.
5. Frontend memanggil `GET /api/reports/dashboard?period={period}&outlet_id={outletIdForApi}`.
6. Backend memfilter data sesuai outlet scope dan periode.
7. Dashboard menampilkan: revenue, transactions, items sold, low stock count, customer count, product count, revenue chart.
8. Untuk owner dengan "ALL OUTLETS", data gabungan semua outlet ditampilkan.

---

## 9. State / Status

Dashboard tidak memiliki state machine. State UI:
- `period`: `daily` | `weekly` | `monthly` | `yearly`
- `data`: object KPI dari API
- `loading`: boolean
- `error`: string | null

Sumber: `frontend/src/pages/Dashboard.js` lines 101-112.

---

## 10. Technical Architecture

```
Browser
 ↓
React Component (Dashboard.js)
 ↓
API Client (lib/api.js — axios)
 ↓
FastAPI Endpoint (routes/reports.py)
 ↓
Auth (get_current_user + require_role)
 ↓
Business Logic (report_dashboard function)
 ↓
SQL Query (raw SQL via asyncpg/SQLAlchemy text())
 ↓
PostgreSQL
 ↓
JSON Response
 ↓
React State Update
 ↓
UI Render (metric cards + recharts)
```

---

## 11. Technical Flow

1. `Dashboard.js` mount → `useOutlet()` menyediakan `outletIdForApi`.
2. `useEffect` trigger fetch → `api.get("/reports/dashboard", { params: { period, outlet_id } })`.
3. Backend `report_dashboard` (reports.py L83):
   - Verifikasi auth via `require_role`.
   - Resolve outlet filter via `_outlet_filter`.
   - Konversi tanggal ke Asia/Jakarta timezone.
   - Query agregasi: revenue, transactions, items sold, low stock, top products, branch comparison.
4. Response JSON dikembalikan ke frontend.
5. Frontend set state `data` dan render metric cards + chart.

---

## 12. Frontend

**File:** `frontend/src/pages/Dashboard.js`

| Elemen | Detail |
|--------|--------|
| Context | `useOutlet()` — `outletIdForApi` (line 101) |
| API Call | `GET /reports/dashboard?period=...&outlet_id=...` (line 112) |
| State | `period`, `data`, `loading`, `error` |
| UI Cards | TrendingUp (revenue), ShoppingBag (transactions), Users (customers), AlertTriangle (low stock), DollarSign, Package |
| Chart | Revenue line chart menggunakan `recharts` |
| Period Selector | daily / weekly / monthly / yearly |

---

## 13. Backend

**File:** `backend/routes/reports.py`

| Endpoint | Method | Function | Line | Auth |
|----------|--------|----------|------|------|
| `/api/reports/dashboard` | GET | `report_dashboard` | L83 | `require_role("owner","admin","manager","supervisor")` |

**Business Logic:**
- Menghitung revenue total dari `sales` table.
- Menghitung jumlah transaksi.
- Menghitung item terjual dari `sales.items` JSONB.
- Menghitung produk stok rendah dari `outlet_stocks` + `products.low_stock_threshold`.
- Top products berdasarkan qty sold.
- Branch comparison (owner only / multi-outlet).

---

## 14. API

```
GET /api/reports/dashboard
Query Params:
  - period: daily | weekly | monthly | yearly
  - outlet_id: UUID (optional, owner only)

Response: {
  revenue, transactions, items_sold,
  low_stock_count, customer_count, product_count,
  revenue_chart: [...],
  top_products: [...],
  branch_comparison: [...]
}
```

> Struktur response exact field names: NOT CONFIRMED FROM SOURCE (berdasarkan audit, field-level response tidak didokumentasikan secara eksplisit).

---

## 15. Database

**Tables involved:**

| Table | Penggunaan |
|-------|------------|
| `sales` | Revenue, transactions, items sold |
| `products` | Product count, low stock |
| `outlet_stocks` | Stock per outlet |
| `outlets` | Branch comparison |
| `customers` | Customer count |

**Key columns:**
- `sales.outlet_id`, `sales.total`, `sales.items`, `sales.created_at`
- `outlet_stocks.quantity`, `outlet_stocks.outlet_id`
- `products.low_stock_threshold`, `products.is_active`

---

## 16. Data Flow

```
USER PILIH PERIODE + OUTLET
 ↓
FRONTEND STATE (period, outletId)
 ↓
API REQUEST: GET /reports/dashboard
 ↓
BACKEND: report_dashboard()
 ↓
SQL AGGREGATION (sales, products, outlet_stocks)
 ↓
JSON RESPONSE
 ↓
FRONTEND SET DATA STATE
 ↓
RENDER KPI CARDS + CHART
```

---

## 17. Validation

- Backend: `require_role` memastikan hanya owner/admin/manager/supervisor.
- Backend: `_outlet_filter` memastikan non-owner hanya melihat outlet sendiri.
- Frontend: `canAccess(role, path)` di `Layout.js` membatasi akses route.

---

## 18. Calculation

| Metric | Formula (berdasarkan audit) |
|--------|----------------------------|
| Revenue | `SUM(sales.total)` untuk periode & outlet |
| Transactions | `COUNT(sales.id)` untuk periode & outlet |
| Items Sold | Agregasi qty dari `sales.items` JSONB |
| Low Stock | `COUNT` produk dimana `outlet_stocks.quantity <= products.low_stock_threshold` |
| Customer Count | `COUNT(customers.id)` |
| Product Count | `COUNT(products.id) WHERE is_active = TRUE` |

> Detail rounding/tax: NOT CONFIRMED FROM SOURCE untuk dashboard level.

---

## 19. Audit Log

Dashboard adalah read-only module. **Tidak ada audit log yang dicatat** saat user membuka atau melihat dashboard.

---

## 20. Reports

Dashboard sendiri merupakan ringkasan dari data yang juga tersedia di menu Reports. Dashboard tidak menghasilkan report terpisah.

---

## 21. Integration / Dependency

| Dependency | Keterangan |
|------------|------------|
| Sales | Sumber data revenue & transaksi |
| Products | Sumber data product count & low stock |
| Outlet Stocks | Sumber data stok per outlet |
| Customers | Sumber data customer count |
| Outlets | Branch comparison & outlet context |
| Reports module | Dashboard menggunakan endpoint yang sama dengan Reports |

---

## 22. Error Handling

| Kondisi | Behavior |
|---------|----------|
| 401 Unauthorized | Redirect ke `/login` |
| 403 Forbidden | `canAccess` block di frontend |
| 500 Server Error | `error` state ditampilkan |
| Network Error | `error` state ditampilkan |
| Empty Data | KPI menampilkan 0 |

---

## 23. Edge Cases

- Owner memilih "ALL OUTLETS" → data gabungan semua outlet.
- Outlet tidak memiliki penjualan → revenue = 0, transactions = 0.
- Periode tidak memiliki data → chart kosong.
- User non-owner tanpa outlet assignment → `filter_outlets_for_user` mengembalikan dummy UUID → data kosong.

---

## 24. Security

| Aspek | Status |
|-------|--------|
| Authentication | YA — `get_current_user` |
| Authorization | YA — `require_role` |
| Outlet Enforcement | YA — `_outlet_filter` di backend |
| SQL Injection | Aman — parameterized queries via `:param` |
| IDOR | TIDAK ADA — outlet_id divalidasi backend |

---

## 25. QA / Test Cases

```
TC-DASH-001: Owner melihat dashboard semua outlet
Given: Owner login
When: Buka /dashboard, pilih "ALL OUTLETS"
Then: Data gabungan semua outlet ditampilkan

TC-DASH-002: Manager melihat dashboard outlet sendiri
Given: Manager login dengan 1 outlet
When: Buka /dashboard
Then: Hanya data outlet sendiri yang ditampilkan

TC-DASH-003: Kasir tidak bisa akses dashboard
Given: Kasir login
When: Redirect
Then: Landing di /pos, bukan /dashboard

TC-DASH-004: Ganti periode
Given: User di dashboard
When: Pilih periode "monthly"
Then: Data refresh dengan agregasi bulanan

TC-DASH-005: Outlet tanpa penjualan
Given: Outlet baru tanpa transaksi
When: Lihat dashboard outlet tersebut
Then: Revenue = 0, transactions = 0
```

---

## 26. Current Implementation Status

```
STATUS: IMPLEMENTED
```

Frontend dan backend lengkap. Dashboard berfungsi dengan outlet scope dan periode selector.

---

## 27. Bugs / Findings

| ID | Severity | Finding |
|----|----------|---------|
| DASH-F-01 | LOW | Struktur response field dashboard tidak didokumentasikan secara eksplisit di source code (hanya dilihat dari audit) |
| DASH-F-02 | LOW | Tidak ada loading skeleton — hanya spinner/empty state sederhana |

---

## 28. Gaps

| Gap | Keterangan |
|-----|------------|
| Real-time update | Dashboard tidak auto-refresh; user harus manual refresh |
| Custom date range | Dashboard hanya support periode preset (daily/weekly/monthly/yearly), tidak ada custom range |
| Export | Dashboard tidak memiliki fitur export (export ada di Reports) |

---

## 29. Dependency Map

```
Dashboard
 ├── Sales (revenue, transactions)
 ├── Products (product count, low stock)
 ├── Outlet Stocks (stock per outlet)
 ├── Customers (customer count)
 ├── Outlets (branch comparison, outlet context)
 └── Reports API (shared endpoint)
```

---

## 30. End-to-End Flow

```
USER LOGIN (owner/admin/manager/supervisor)
 ↓
REDIRECT /DASHBOARD
 ↓
LOAD OUTLET CONTEXT (GET /outlets/my)
 ↓
FETCH DASHBOARD DATA (GET /reports/dashboard)
 ↓
OUTLET FILTER + PERIODE FILTER
 ↓
SQL AGGREGATION
 ↓
RENDER KPI + CHART
 ↓
USER ANALISA PERFORMANCE
```
