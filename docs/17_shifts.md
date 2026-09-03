# SHIFTS — BUSINESS & TECHNICAL DOCUMENTATION

> Dokumentasi AS-IS berdasarkan audit source code.
> Source: `frontend/src/pages/Shifts.js`, `backend/routes/shifts.py`, `backend/sql/postgres_schema.sql`

---

## 1. Module Overview

Menu Shifts mengelola shift kasir per outlet: open shift (opening cash), close shift (actual cash, expected cash, difference), dan history shift. Shift adalah konteks untuk setiap transaksi POS.

---

## 2. Business Purpose

Mengontrol sesi kerja kasir, melacak kas awal dan akhir, dan melakukan rekonsiliasi kas per shift.

---

## 3. Business Objective

- Mencatat pembukaan shift (opening cash).
- Mencatat penutupan shift (actual cash, expected cash, difference).
- Melacak jumlah transaksi dan penjualan per shift.
- Menyediakan data untuk Shift Report.

---

## 4. Actors / Roles

| Role | Akses | Keterangan |
|------|-------|------------|
| Owner | YA | Semua outlet |
| Admin | YA | Outlet yang di-assign |
| Manager | YA | Outlet yang di-assign |
| Supervisor | YA | Outlet yang di-assign |
| Kasir | YA | Outlet yang di-assign — open/close shift sendiri |

Berdasarkan `seed_roles.sql`: kasir memiliki `shifts: view, manage`.

---

## 5. Outlet Scope

**Klasifikasi: OUTLET-SCOPED**

- `shifts.outlet_id` menentukan outlet shift.
- Frontend mengirim `outlet_id` via query param.
- Backend memfilter berdasarkan `outlet_id` atau `filter_outlets_for_user`.

Sumber: `backend/routes/shifts.py` lines 8-91.

---

## 6. Role & Permission

| Aksi | Owner | Admin | Manager | Supervisor | Kasir |
|------|-------|-------|---------|------------|-------|
| View Shifts | YA | YA | YA | YA | YA |
| Open Shift | YA | YA | YA | YA | YA |
| Close Shift | YA | YA | YA | YA | YA |

Backend: semua endpoint menggunakan `get_current_user`.

---

## 7. Business Flow

```
KASIR BUKA POS
 ↓
CEK SHIFT AKTIF
 ↓
[BELUM ADA]
 ↓
BUKA SHIFT (opening cash + note)
 ↓
STATUS: open
 ↓
[BUAT TRANSAKSI]
 ↓
[AKHIR HARI]
 ↓
TUTUP SHIFT (actual cash + note)
 ↓
EXPECTED CASH = opening + cash_sales
 ↓
DIFFERENCE = actual - expected
 ↓
STATUS: closed
```

---

## 8. Detailed Business Rules

1. Satu user hanya boleh memiliki satu `open` shift per outlet pada satu waktu.
2. Opening cash wajib diisi saat open.
3. Saat close:
   - `cash_sales` = SUM(sales.total) WHERE shift_id=this AND payment_method='cash'.
   - `non_cash_sales` = SUM(sales.total) WHERE shift_id=this AND payment_method!='cash'.
   - `transaction_count` = COUNT(sales) WHERE shift_id=this.
   - `expected_cash = opening_cash + cash_sales`.
   - `difference = actual_cash - expected_cash`.
4. Close shift set `closed_at = now()`, `status = 'closed'`.

---

## 9. State / Status

```
open  →  closed  (via close_shift)
```

---

## 10. Technical Architecture

```
Browser → React (Shifts.js / POS.js) → API → FastAPI (shifts.py) → PostgreSQL (shifts, sales)
```

---

## 11. Technical Flow

### Open Shift
1. `POST /api/shifts/open` dengan `{ outlet_id, opening_cash, note }`.
2. Backend `open_shift` (shifts.py L8):
   - Cek apakah user sudah punya open shift di outlet → reject.
   - Insert `shifts` dengan `status='open'`, `opened_at=now()`.
3. Response → frontend update.

### Close Shift
1. `POST /api/shifts/close` dengan `{ actual_cash, note }`.
2. Backend `close_shift` (shifts.py L31):
   - Cari open shift untuk user.
   - Calculate `cash_sales`, `non_cash_sales`, `transaction_count`.
   - Calculate `expected_cash`, `difference`.
   - Update shift: `status='closed'`, `closed_at=now()`, `actual_cash`, `expected_cash`, `difference`.
3. Response → frontend update.

### Active Shift
1. `GET /api/shifts/active?outlet_id={uuid}`.
2. Backend: cari open shift untuk user di outlet.

### List Shifts
1. `GET /api/shifts?outlet_id={uuid}`.
2. Backend: filter by outlet, ordered by `opened_at` DESC.

---

## 12. Frontend

**File:** `frontend/src/pages/Shifts.js`

| Elemen | Detail |
|--------|--------|
| Context | `useOutlet()` — `outletIdForApi` (line 9) |
| API Calls | `GET /shifts?outlet_id=...`, `GET /shifts/active?outlet_id=...` |
| State | `shifts`, `active` |
| UI | Active shift card, history table |

> POS.js juga memiliki shift open/close modal.

---

## 13. Backend

**File:** `backend/routes/shifts.py`

| Endpoint | Method | Function | Line | Auth |
|----------|--------|----------|------|------|
| `/api/shifts/active` | GET | `active_shift` | L8 | `get_current_user` |
| `/api/shifts` | GET | `list_shifts` | L14 | `get_current_user` |
| `/api/shifts/open` | POST | `open_shift` | L31 | `get_current_user` |
| `/api/shifts/close` | POST | `close_shift` | L62 | `get_current_user` |

---

## 14. API

```
GET /api/shifts/active?outlet_id={uuid}
GET /api/shifts?outlet_id={uuid}
POST /api/shifts/open { outlet_id, opening_cash, note }
POST /api/shifts/close { actual_cash, note }
```

---

## 15. Database

### Table: `shifts`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `cashier_id` | uuid | — | NOT NULL |
| `cashier_name` | varchar(255) | — | |
| `outlet_id` | uuid | — | |
| `opening_cash` | numeric(14,2) | 0 | |
| `status` | varchar(20) | `'open'` | open / closed |
| `opened_at` | timestamptz | `now()` | |
| `closed_at` | timestamptz | — | |
| `actual_cash` | numeric(14,2) | — | Input saat close |
| `expected_cash` | numeric(14,2) | — | Calculated |
| `difference` | numeric(14,2) | — | actual - expected |
| `cash_sales` | numeric(14,2) | 0 | |
| `non_cash_sales` | numeric(14,2) | 0 | |
| `transaction_count` | integer | 0 | |
| `note` | text | — | |
| `close_note` | text | — | |

**Index:** `idx_shifts_cashier_status`

**Relationship:**
```
users (1) ─── (many) shifts  (via cashier_id)
outlets (1) ─── (many) shifts  (via outlet_id)
shifts (1) ─── (many) sales  (via shift_id)
```

---

## 16. Data Flow

```
KASIR OPEN SHIFT
 ↓
POST /shifts/open
 ↓
INSERT shifts (status=open)
 ↓
[TRANSAKSI POS] → sales.shift_id = this shift
 ↓
KASIR CLOSE SHIFT
 ↓
POST /shifts/close
 ↓
CALCULATE cash_sales, non_cash_sales, transaction_count
 ↓
CALCULATE expected_cash = opening + cash_sales
 ↓
CALCULATE difference = actual - expected
 ↓
UPDATE shifts SET status=closed
 ↓
DATA MASUK SHIFT REPORT
```

---

## 17. Validation

- Tidak boleh open shift jika sudah ada open shift (per user per outlet).
- Tidak boleh close jika tidak ada open shift.

---

## 18. Calculation

```
cash_sales = SUM(sales.total) WHERE shift_id=this AND payment_method='cash'
non_cash_sales = SUM(sales.total) WHERE shift_id=this AND payment_method!='cash'
transaction_count = COUNT(sales) WHERE shift_id=this
expected_cash = opening_cash + cash_sales
difference = actual_cash - expected_cash
```

---

## 19. Audit Log

| Action | Entity | Dicatat? |
|--------|--------|----------|
| Open Shift | `shift` | NOT CONFIRMED FROM SOURCE |
| Close Shift | `shift` | NOT CONFIRMED FROM SOURCE |

---

## 20. Reports

- Shift Report (`GET /api/reports/shifts`): opening, expected, actual, difference, transaction count, cash/non-cash sales per shift.
- Dashboard: tidak langsung menggunakan shift data.

---

## 21. Integration / Dependency

| Dependency | Keterangan |
|------------|------------|
| Users | `cashier_id` |
| Outlets | `outlet_id` |
| Sales | `sales.shift_id` |
| POS | Shift context untuk transaksi |
| Reports | Shift report |

---

## 22. Error Handling

| Kondisi | HTTP | Behavior |
|---------|------|----------|
| Already open | 400 | "Shift already open" |
| No active shift | 400 | "No active shift" |
| Unauthorized | 401 | Redirect ke login |

---

## 23. Edge Cases

- Lupa close shift → shift tetap `open` selamanya.
- Close shift tanpa transaksi → `cash_sales=0`, `expected=opening_cash`.
- `difference` negatif → kas kurang.
- `difference` positif → kas lebih.
- Concurrent open → dicegah oleh check.

---

## 24. Security

| Aspek | Status |
|-------|--------|
| Authentication | YA |
| Authorization | `get_current_user` saja — semua authenticated user bisa open/close |
| Outlet Enforcement | YA — `filter_outlets_for_user` untuk list |
| SQL Injection | Aman — parameterized |

---

## 25. QA / Test Cases

```
TC-SHF-001: Open shift
Given: Kasir belum punya shift
When: Open shift (cash=100000)
Then: Shift created, status=open

TC-SHF-002: Double open
Given: Kasir sudah open shift
When: Open shift lagi
Then: Error 400

TC-SHF-003: Close shift
Given: Open shift + 3 sales (2 cash, 1 card)
When: Close shift (actual=150000)
Then: expected=100000+cash_sales, difference calculated

TC-SHF-004: Close tanpa transaksi
Given: Open shift tanpa sales
When: Close (actual=100000)
Then: expected=100000, difference=0
```

---

## 26. Current Implementation Status

```
STATUS: IMPLEMENTED
```

Open/close shift, reconciliation, history berfungsi.

---

## 27. Bugs / Findings

| ID | Severity | Finding |
|----|----------|---------|
| SHF-F-01 | LOW | Tidak ada auto-close shift — bisa tetap open selamanya |
| SHF-F-02 | LOW | Audit logging tidak terlihat eksplisit |

---

## 28. Gaps

| Gap | Keterangan |
|-----|------------|
| Shift handover | Tidak ada handover antar kasir |
| Multi-cashier shift | Tidak ada shift untuk multiple kasir |
| Shift schedule | Tidak ada jadwal shift |

---

## 29. Dependency Map

```
Shifts
 ├── Users (cashier_id)
 ├── Outlets (outlet_id)
 ├── Sales (shift_id)
 ├── POS (shift context)
 └── Reports (shift report)
```

---

## 30. End-to-End Flow

```
KASIR BUKA POS
 ↓
CEK SHIFT AKTIF (GET /shifts/active)
 ↓
[BUKA SHIFT] → POST /shifts/open
 ↓
SHIFT: status=open
 ↓
[TRANSAKSI POS] → sales.shift_id = this
 ↓
[AKHIR HARI]
 ↓
TUTUP SHIFT → POST /shifts/close
 ↓
CALCULATE: cash_sales, expected_cash, difference
 ↓
SHIFT: status=closed
 ↓
DATA MASUK SHIFT REPORT
```
