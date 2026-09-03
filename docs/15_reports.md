# REPORTS (LAPORAN) — BUSINESS & TECHNICAL DOCUMENTATION

> Dokumentasi AS-IS berdasarkan audit source code.
> Source: `frontend/src/pages/Reports.js`, `backend/routes/reports.py`, `backend/sql/postgres_schema.sql`

---

## 1. Module Overview

Menu Reports menyediakan 7 tab laporan: Dashboard, Sales, Profit/Loss, Shifts, Stock, Payment Reconciliation, dan Transfers. Setiap tab memiliki filter tanggal, outlet scope, summary cards, tabel detail, dan export Excel/PDF.

---

## 2. Business Purpose

Memberikan visibilitas performa bisnis melalui laporan terperinci untuk pengambilan keputusan manajerial.

---

## 3. Business Objective

- Menyediakan laporan penjualan (revenue, transaksi, breakdown).
- Menghitung profit/loss (COGS, gross/net profit).
- Melakukan rekonsiliasi shift dan payment.
- Melacak pergerakan stok.
- Melaporkan transfer antar outlet.
- Mendukung export Excel/PDF.

---

## 4. Actors / Roles

| Role | Akses | Keterangan |
|------|-------|------------|
| Owner | YA | Semua outlet |
| Admin | YA | Outlet yang di-assign |
| Manager | YA | Outlet yang di-assign |
| Supervisor | YA | Outlet yang di-assign |
| Kasir | TIDAK | Tidak ada menu Reports |

Berdasarkan `seed_roles.sql`: manager memiliki `reports: view, export, detail`.

---

## 5. Outlet Scope

**Klasifikasi: OUTLET-SCOPED**

- Semua report menggunakan `_outlet_filter` helper.
- Owner dapat melihat semua outlet atau memilih outlet spesifik.
- Non-owner terbatas pada `user["outlet_ids"]`.
- Frontend mengirim `outlet_id` via query param.

Sumber: `backend/routes/reports.py` lines 83-1511.

---

## 6. Role & Permission

| Aksi | Owner | Admin | Manager | Supervisor | Kasir |
|------|-------|-------|---------|------------|-------|
| View Reports | YA | YA | YA | YA | TIDAK |
| Export Excel/PDF | YA | YA | YA | TIDAK | TIDAK |
| View Detail | YA | YA | YA | TIDAK | TIDAK |

Backend: semua endpoint menggunakan `require_role("owner","admin","manager","supervisor")`.

---

## 7. Business Flow

```
MANAGER BUKA MENU LAPORAN
 ↓
PILIH TAB (Dashboard/Sales/P&L/Shifts/Stock/Payment/Transfers)
 ↓
SET DATE RANGE
 ↓
PILIH OUTLET (auto / selector)
 ↓
KLIK "TERAPKAN"
 ↓
SISTEM AMBIL DATA DARI API
 ↓
TAMPILKAN SUMMARY + TABLE + CHART
 ↓
[EXPORT EXCEL]
 ↓
[EXPORT PDF]
```

---

## 8. Detailed Business Rules

1. 7 tab report tersedia.
2. Setiap tab memiliki filter tanggal (start_date, end_date).
3. Default date range: NOT CONFIRMED (kemungkinan 30 hari terakhir).
4. Owner dapat pilih "ALL OUTLETS" untuk data gabungan.
5. Export Excel menggunakan `xlsx` library.
6. Export PDF menggunakan `jspdf` + `jspdf-autotable`.
7. Tanggal dikonversi ke Asia/Jakarta timezone di backend.

---

## 9. State / Status

Reports tidak memiliki state machine. State UI:
- `activeTab`: dashboard | sales | profit-loss | shifts | stock | payment-reconciliation | transfers
- Per-tab: date filters, data, loading

---

## 10. Technical Architecture

```
Browser → React (Reports.js) → API → FastAPI (reports.py) → PostgreSQL (sales, shifts, stock_movements, dll) → Response → UI + Export
```

---

## 11. Technical Flow

1. `Reports.js` → user pilih tab, set date range, klik "Terapkan".
2. Frontend call API sesuai tab:
   - Dashboard: `GET /api/reports/dashboard`
   - Sales: `GET /api/reports/sales?start_date=...&end_date=...&outlet_id=...`
   - P&L: `GET /api/reports/profit-loss?...`
   - Shifts: `GET /api/reports/shifts?...`
   - Stock: `GET /api/reports/stock?...`
   - Payment: `GET /api/reports/payment-reconciliation?...`
   - Transfers: `GET /api/reports/transfers?...`
3. Backend: `_outlet_filter` → SQL aggregation → response.
4. Frontend: render summary cards, tables, charts.
5. Export: frontend generate Excel/PDF dari data.

---

## 12. Frontend

**File:** `frontend/src/pages/Reports.js`

| Elemen | Detail |
|--------|--------|
| Context | `useOutlet()` (`outletIdForApi`, `outlets`) — line 1907 |
| API Calls | `GET /reports/dashboard`, `GET /reports/sales`, `GET /reports/profit-loss`, `GET /reports/shifts`, `GET /reports/stock`, `GET /reports/payment-reconciliation`, `GET /reports/transfers` |
| State | `activeTab`, per-tab data, date filters, loading |
| UI | 7 report tabs, date filters, summary cards, tables, Excel/PDF export buttons |
| Export | `xlsx` for Excel, `jspdf` + `jspdf-autotable` for PDF |

---

## 13. Backend

**File:** `backend/routes/reports.py`

| Endpoint | Method | Function | Line | Auth |
|----------|--------|----------|------|------|
| `/api/reports/dashboard` | GET | `report_dashboard` | L83 | `require_role("owner","admin","manager","supervisor")` |
| `/api/reports/sales` | GET | `report_sales` | L460 | `require_role(...)` |
| `/api/reports/profit-loss` | GET | `report_profit_loss` | L844 | `require_role(...)` |
| `/api/reports/shifts` | GET | `report_shifts` | L1051 | `require_role(...)` |
| `/api/reports/stock` | GET | `report_stock` | L1132 | `require_role(...)` |
| `/api/reports/payment-reconciliation` | GET | `report_payment_reconciliation` | L1282 | `require_role(...)` |
| `/api/reports/sales-monitor` | GET | `sales_monitor` | L1452 | `require_role(...)` |
| `/api/reports/branch-comparison` | GET | `branch_comparison` | L1511 | `require_role(...)` |
| `/api/reports/transfers` | GET | `transfer_report` | L363 (stock_transfers.py) | `require_role(...)` |

---

## 14. API

```
GET /api/reports/dashboard?period=...&outlet_id=...
GET /api/reports/sales?start_date=...&end_date=...&outlet_id=...
GET /api/reports/profit-loss?start_date=...&end_date=...&outlet_id=...
GET /api/reports/shifts?start_date=...&end_date=...&outlet_id=...
GET /api/reports/stock?start_date=...&end_date=...&outlet_id=...
GET /api/reports/payment-reconciliation?start_date=...&end_date=...&outlet_id=...
GET /api/reports/transfers?start_date=...&end_date=...&outlet_id=...
GET /api/reports/sales-monitor?outlet_id=...
GET /api/reports/branch-comparison?start_date=...&end_date=...&outlet_id=...
```

---

## 15. Database

### Source Tables per Report

| Report | Source Tables |
|--------|--------------|
| Dashboard | `sales`, `products`, `outlet_stocks`, `outlets`, `customers` |
| Sales | `sales` (breakdown by payment, source, channel, price_type, category, product, outlet, cashier) |
| P&L | `sales` (revenue, COGS with paket_items logic), `products` (cost) |
| Shifts | `shifts` (opening, expected, actual, difference) |
| Stock | `stock_movements` (in/out, by reason, by product, low stock) |
| Payment Reconciliation | `sales` (by method, cash/card/transfer/qris details, by day) |
| Transfers | `stock_transfers`, `transfer_items`, `delivery_notes`, `stock_requests` |
| Sales Monitor | `sales` (latest 50) |
| Branch Comparison | `sales` per outlet (revenue, transactions, ranking) |

---

## 16. Data Flow

```
USER PILIH TAB + DATE RANGE + OUTLET
 ↓
API REQUEST (GET /reports/{type})
 ↓
BACKEND: _outlet_filter
 ↓
SQL AGGREGATION (sales, shifts, movements, dll)
 ↓
JSON RESPONSE (summary + breakdown)
 ↓
FRONTEND RENDER (cards + tables + charts)
 ↓
[EXPORT] → Excel (xlsx) / PDF (jspdf)
```

---

## 17. Validation

- Date range: start_date <= end_date.
- Outlet access: `_outlet_filter` untuk non-owner.
- Role: `require_role` memastikan hanya owner/admin/manager/supervisor.

---

## 18. Calculation

### Sales Report
```
revenue = SUM(sales.total)
transactions = COUNT(sales)
items_sold = SUM(item.quantity) from sales.items JSONB
```

### P&L Report
```
revenue = SUM(sales.total)
total_cogs = SUM(product.cost × item.quantity)  — with paket_items logic
gross_profit = revenue - total_cogs
net_profit = gross_profit - expenses (if included)
```

### Shift Report
```
expected_cash = opening_cash + cash_sales
difference = actual_cash - expected_cash
```

### Payment Reconciliation
```
by_method = GROUP BY payment_method
cash_total = SUM(total) WHERE payment_method='cash'
card_total = SUM(total) WHERE payment_method='card'
transfer_total = SUM(total) WHERE payment_method='transfer'
qris_total = SUM(total) WHERE payment_method='qris'
```

### Branch Comparison
```
per_outlet = GROUP BY outlet_id
ranking = ORDER BY revenue DESC
```

---

## 19. Audit Log

Reports adalah read-only module. **Tidak ada audit log yang dicatat** saat user melihat atau export report.

---

## 20. Reports

Reports sendiri adalah output module — tidak menghasilkan report terpisah.

---

## 21. Integration / Dependency

| Dependency | Keterangan |
|------------|------------|
| Sales | Source data untuk Sales, P&L, Payment, Dashboard, Branch |
| Shifts | Source data untuk Shift Report |
| Stock Movements | Source data untuk Stock Report |
| Stock Transfers | Source data untuk Transfer Report |
| Products | COGS untuk P&L |
| Outlets | Outlet scope & branch comparison |
| Expenses | P&L (jika included) |
| Dashboard | Shared endpoint dengan Reports |

---

## 22. Error Handling

| Kondisi | HTTP | Behavior |
|---------|------|----------|
| Unauthorized | 401/403 | Redirect/blocked |
| Invalid date range | 400 | Error |
| No data | 200 | Empty result |
| Server error | 500 | Error message |

---

## 23. Edge Cases

- Date range sangat luas → query lambat (no pagination di beberapa report).
- Outlet tanpa data → empty result.
- "ALL OUTLETS" untuk owner → data gabungan.
- Export dengan data besar → frontend memory issue possible.

---

## 24. Security

| Aspek | Status |
|-------|--------|
| Authentication | YA |
| Authorization | YA — `require_role` |
| Outlet Enforcement | YA — `_outlet_filter` |
| SQL Injection | Aman — parameterized |
| Data Leakage | Aman — outlet scope enforced |

---

## 25. QA / Test Cases

```
TC-RPT-001: Sales report
Given: Manager dengan data penjualan
When: Pilih tab Sales, set date range, klik Terapkan
Then: Summary + breakdown ditampilkan

TC-RPT-002: P&L report
Given: Sales dengan COGS data
When: Pilih tab P&L, set date range
Then: Revenue, COGS, gross profit ditampilkan

TC-RPT-003: Export Excel
Given: Report data loaded
When: Click Export Excel
Then: File .xlsx di-download

TC-RPT-004: Export PDF
Given: Report data loaded
When: Click Export PDF
Then: File .pdf di-download

TC-RPT-005: Outlet scope
Given: Manager outlet A
When: View report outlet B
Then: 403 atau data outlet A saja

TC-RPT-006: Branch comparison (owner)
Given: Owner dengan 3 outlet
When: View branch comparison
Then: Ranking per outlet ditampilkan
```

---

## 26. Current Implementation Status

```
STATUS: IMPLEMENTED
```

7 tab report, date filter, outlet scope, export Excel/PDF berfungsi.

---

## 27. Bugs / Findings

| ID | Severity | Finding |
|----|----------|---------|
| RPT-F-01 | MEDIUM | Beberapa report tidak memiliki pagination — query luas dapat lambat |
| RPT-F-02 | LOW | P&L paket_items logic kompleks — perlu verifikasi COGS calculation untuk paket |
| RPT-F-03 | LOW | Export dilakukan di frontend — data besar dapat menyebabkan memory issue |

---

## 28. Gaps

| Gap | Keterangan |
|-----|------------|
| Scheduled report | Tidak ada report terjadwal (email/cron) |
| Custom report | Tidak ada custom report builder |
| Real-time report | Tidak ada real-time update (harus refresh) |
| Tax report | Tidak ada report pajak tersendiri |
| Customer analytics | Tidak ada analisa perilaku pelanggan |

---

## 29. Dependency Map

```
Reports
 ├── Sales (Sales, P&L, Payment, Dashboard, Branch)
 ├── Shifts (Shift Report)
 ├── Stock Movements (Stock Report)
 ├── Stock Transfers (Transfer Report)
 ├── Products (COGS for P&L)
 ├── Outlets (outlet scope, branch comparison)
 ├── Expenses (P&L if included)
 └── Dashboard (shared endpoint)
```

---

## 30. End-to-End Flow

```
MANAGER BUKA MENU LAPORAN
 ↓
PILIH TAB (Sales/P&L/Shifts/Stock/Payment/Transfers)
 ↓
SET DATE RANGE + OUTLET
 ↓
KLIK "TERAPKAN"
 ↓
GET /reports/{type}?start_date=...&end_date=...&outlet_id=...
 ↓
BACKEND: _outlet_filter + SQL aggregation
 ↓
JSON RESPONSE (summary + breakdown)
 ↓
FRONTEND RENDER (cards + tables + charts)
 ↓
[EXPORT EXCEL] → xlsx
[EXPORT PDF] → jspdf + autotable
```
