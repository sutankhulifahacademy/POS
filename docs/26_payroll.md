# PAYROLL (PENGGAJIAN) — BUSINESS & TECHNICAL DOCUMENTATION

> Dokumentasi AS-IS berdasarkan audit source code.
> Source: `frontend/src/pages/Payroll.js`, `backend/routes/payroll.py`, `backend/sql/postgres_schema.sql`

---

## 1. Module Overview

Menu Payroll mengelola periode penggajian dan perhitungan gaji per karyawan per outlet. Payroll menghitung gaji pokok, tunjangan, bonus kehadiran, potongan, overtime, dan take-home pay berdasarkan attendance, leave requests, dan konfigurasi karyawan.

---

## 2. Business Purpose

Mengotomatisasi perhitungan gaji karyawan berdasarkan kehadiran, cuti, dan konfigurasi payroll.

---

## 3. Business Objective

- Mengelola periode payroll per outlet.
- Menghitung gaji per karyawan.
- Mengintegrasikan data attendance, leave requests.
- Menghasilkan slip gaji.
- Melacak status payroll (draft → processed → paid).

---

## 4. Actors / Roles

| Role | Akses | Keterangan |
|------|-------|------------|
| Owner | YA | Semua outlet, process payroll |
| Admin | YA | Outlet yang di-assign, process payroll |
| Manager | TIDAK | NOT CONFIRMED — mungkin view only |
| Supervisor | TIDAK | Tidak ada menu |
| Kasir | TIDAK | Tidak ada menu |

Berdasarkan `seed_roles.sql`: NOT CONFIRMED — payroll mungkin tidak ada di seed roles.

---

## 5. Outlet Scope

**Klasifikasi: OUTLET-SCOPED**

- `payroll_periods.outlet_id` menentukan outlet.
- `payroll_items.outlet_id` menentukan outlet.
- Backend memfilter berdasarkan `outlet_id` atau `filter_outlets_for_user`.

Sumber: `backend/routes/payroll.py` lines 8-200.

---

## 6. Role & Permission

| Aksi | Owner | Admin | Manager | Supervisor | Kasir |
|------|-------|-------|---------|------------|-------|
| View Payroll | YA | YA | TIDAK | TIDAK | TIDAK |
| Create Period | YA | YA | TIDAK | TIDAK | TIDAK |
| Process Payroll | YA | YA | TIDAK | TIDAK | TIDAK |
| Mark Paid | YA | YA | TIDAK | TIDAK | TIDAK |

Backend: `require_permission("payroll", ...)` atau `require_role("owner", "admin")` (NOT CONFIRMED).

---

## 7. Business Flow

```
OWNER/ADMIN BUKA MENU PAYROLL
 ↓
PILIH OUTLET
 ↓
[CREATE PAYROLL PERIOD]
 ↓
ISI: start_date, end_date, pay_date
 ↓
SIMPAN (status: draft)
 ↓
[PROCESS PAYROLL]
 ↓
SISTEM HITUNG PER KARYAWAN:
 ├── Gaji pokok (dari user config)
 ├── Tunjangan
 ├── Bonus kehadiran (dari attendance)
 ├── Potongan (dari leave)
 ├── Overtime (jika ada)
 └── Take-home pay
 ↓
PAYROLL_ITEMS DIBUAT
 ↓
STATUS: processed
 ↓
[MARK PAID]
 ↓
STATUS: paid
```

---

## 8. Detailed Business Rules

1. Payroll period per outlet dengan `start_date`, `end_date`, `pay_date`.
2. Status: `draft` → `processed` → `paid`.
3. Process payroll menghitung gaji per karyawan:
   - `base_salary`: dari user config (NOT CONFIRMED — field source).
   - `attendance_days`: dari `attendance` records pada periode.
   - `attendance_bonus`: bonus berdasarkan attendance_days.
   - `leave_days`: dari `leave_requests` approved pada periode.
   - `deductions`: potongan (NOT CONFIRMED — source).
   - `overtime`: NOT CONFIRMED.
   - `net_salary = base_salary + allowances + attendance_bonus - deductions`.
4. Payroll items dibuat per karyawan.
5. Mark paid: update status → `paid`, set `paid_at`.

---

## 9. State / Status

### Payroll Period
```
draft  →  processed  →  paid
```

### Payroll Item
```
calculated  →  paid  (via mark paid)
```

---

## 10. Technical Architecture

```
Browser → React (Payroll.js) → API → FastAPI (payroll.py) → PostgreSQL (payroll_periods, payroll_items, attendance, leave_requests, users)
```

---

## 11. Technical Flow

### Create Period
1. `POST /api/payroll/periods` dengan `{ start_date, end_date, pay_date, outlet_id }`.
2. Backend: insert `payroll_periods` dengan status `draft`.

### Process Payroll
1. `POST /api/payroll/periods/{id}/process`.
2. Backend `process_payroll` (payroll.py L67):
   - Loop karyawan di outlet.
   - Calculate per karyawan:
     - `attendance_days` = COUNT(attendance WHERE status='completed' AND date IN period).
     - `attendance_bonus` = attendance_days × bonus_per_day (NOT CONFIRMED).
     - `leave_days` = COUNT(leave_requests WHERE status='approved' AND date IN period).
     - `base_salary` = user config (NOT CONFIRMED field).
     - `net_salary` = base_salary + allowances + attendance_bonus - deductions.
   - Insert `payroll_items`.
   - Update period status → `processed`.
3. Response → frontend reload.

### Mark Paid
1. `POST /api/payroll/periods/{id}/mark-paid`.
2. Backend: update period status → `paid`, set `paid_at`.

### List/Detail
1. `GET /api/payroll/periods?outlet_id={uuid}`.
2. `GET /api/payroll/periods/{id}` → period + items.

---

## 12. Frontend

**File:** `frontend/src/pages/Payroll.js`

| Elemen | Detail |
|--------|--------|
| Context | `useOutlet()` — `outletIdForApi` |
| API Calls | `GET /payroll/periods`, `POST /payroll/periods`, `POST /payroll/periods/:id/process`, `POST /payroll/periods/:id/mark-paid`, `GET /payroll/periods/:id` |
| State | `periods`, `showForm`, `detail`, `items` |
| UI | Period list with status badges, create modal, process button, detail with payroll items table, mark-paid button |

---

## 13. Backend

**File:** `backend/routes/payroll.py`

| Endpoint | Method | Function | Line | Auth |
|----------|--------|----------|------|------|
| `/api/payroll/periods` | GET | `list_periods` | L8 | `get_current_user` |
| `/api/payroll/periods` | POST | `create_period` | L40 | `require_role("owner", "admin")` |
| `/api/payroll/periods/{id}` | GET | `get_period` | L55 | `get_current_user` |
| `/api/payroll/periods/{id}/process` | POST | `process_payroll` | L67 | `require_role("owner", "admin")` |
| `/api/payroll/periods/{id}/mark-paid` | POST | `mark_paid` | L150 | `require_role("owner", "admin")` |

---

## 14. API

```
GET /api/payroll/periods?outlet_id={uuid}
POST /api/payroll/periods { start_date, end_date, pay_date, outlet_id }
GET /api/payroll/periods/{id}
POST /api/payroll/periods/{id}/process
POST /api/payroll/periods/{id}/mark-paid
```

---

## 15. Database

### Table: `payroll_periods`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `outlet_id` | uuid | — | NOT NULL |
| `start_date` | date | — | NOT NULL |
| `end_date` | date | — | NOT NULL |
| `pay_date` | date | — | |
| `status` | varchar(20) | `'draft'` | draft/processed/paid |
| `created_by` | uuid | — | |
| `created_at` | timestamptz | `now()` | |
| `processed_at` | timestamptz | — | |
| `paid_at` | timestamptz | — | |
| `note` | text | — | |

**Index:** `idx_payroll_periods_outlet` (`outlet_id`, `start_date` DESC)

### Table: `payroll_items`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `period_id` | uuid FK | — | → `payroll_periods(id)` CASCADE |
| `user_id` | uuid | — | NOT NULL |
| `user_name` | varchar(255) | — | |
| `outlet_id` | uuid | — | NOT NULL |
| `base_salary` | numeric(14,2) | 0 | |
| `allowances` | numeric(14,2) | 0 | |
| `attendance_days` | integer | 0 | |
| `attendance_bonus` | numeric(14,2) | 0 | |
| `leave_days` | integer | 0 | |
| `overtime_hours` | numeric(5,2) | 0 | |
| `overtime_pay` | numeric(14,2) | 0 | |
| `deductions` | numeric(14,2) | 0 | |
| `net_salary` | numeric(14,2) | 0 | |
| `status` | varchar(20) | `'calculated'` | calculated/paid |
| `created_at` | timestamptz | `now()` | |

**Index:** `idx_payroll_items_period` (`period_id`, `user_id`)

**Relationship:**
```
payroll_periods (1) ─── (many) payroll_items
outlets (1) ─── (many) payroll_periods
users (1) ─── (many) payroll_items
```

---

## 16. Data Flow

```
USER CREATE PERIOD
 ↓
INSERT payroll_periods (status=draft)
 ↓
[PROCESS PAYROLL]
 ↓
LOOP KARYAWAN:
 ├── COUNT attendance (period)
 ├── COUNT leave_requests approved (period)
 ├── CALCULATE base_salary, allowances, bonus, deductions
 └── CALCULATE net_salary
 ↓
INSERT payroll_items
 ↓
UPDATE period status=processed
 ↓
[MARK PAID]
 ↓
UPDATE period status=paid, paid_at=now()
 ↓
UPDATE items status=paid
```

---

## 17. Validation

- `start_date`, `end_date`, `outlet_id` NOT NULL.
- `end_date >= start_date`.
- Process: hanya period dengan status `draft` (NOT CONFIRMED).
- Mark paid: hanya period dengan status `processed` (NOT CONFIRMED).

---

## 18. Calculation

### Net Salary
```
net_salary = base_salary + allowances + attendance_bonus + overtime_pay - deductions
```

### Attendance Days
```
attendance_days = COUNT(attendance WHERE user_id=this AND status='completed' AND clock_in_at::date BETWEEN start_date AND end_date)
```

### Attendance Bonus
```
attendance_bonus = attendance_days × bonus_per_day
```
NOT CONFIRMED — `bonus_per_day` source.

### Leave Days
```
leave_days = COUNT(leave_requests WHERE user_id=this AND status='approved' AND date BETWEEN start_date AND end_date)
```

---

## 19. Audit Log

| Action | Entity | Dicatat? |
|--------|--------|----------|
| Create Period | `payroll_period` | NOT CONFIRMED FROM SOURCE |
| Process Payroll | `payroll_period` | NOT CONFIRMED FROM SOURCE |
| Mark Paid | `payroll_period` | NOT CONFIRMED FROM SOURCE |

---

## 20. Reports

- Tidak ada report payroll tersendiri (NOT CONFIRMED).
- Payroll data dapat dianalisa via AI Assistant.

---

## 21. Integration / Dependency

| Dependency | Keterangan |
|------------|------------|
| Users | Karyawan + base_salary config |
| Outlets | `outlet_id` scope |
| Attendance | `attendance_days` calculation |
| Leave Requests | `leave_days` calculation |
| Schedules | NOT CONFIRMED — overtime calculation |

---

## 22. Error Handling

| Kondisi | HTTP | Behavior |
|---------|------|----------|
| Period not found | 404 | "Payroll period not found" |
| Already processed | 400 | "Period already processed" (NOT CONFIRMED) |
| Unauthorized | 401/403 | Redirect/blocked |

---

## 23. Edge Cases

- Karyawan tanpa attendance → `attendance_days=0`, `attendance_bonus=0`.
- Karyawan baru di tengah periode → gaji prorata (NOT CONFIRMED).
- Double process → NOT CONFIRMED (kemungkinan dicegah oleh status check).
- Period overlap → NOT CONFIRMED (kemungkinan tidak dicegah).

---

## 24. Security

| Aspek | Status |
|-------|--------|
| Authentication | YA |
| Authorization | YA — `require_role("owner", "admin")` |
| Outlet Enforcement | YA — `outlet_id` filter |
| SQL Injection | Aman — parameterized |
| Sensitive Data | `base_salary`, `net_salary` — financial data |

---

## 25. QA / Test Cases

```
TC-PAY-001: Create payroll period
Given: Owner login
When: Create period (01-31 Jan, pay 05 Feb)
Then: Period created, status=draft

TC-PAY-002: Process payroll
Given: Draft period dengan karyawan + attendance
When: Process payroll
Then: payroll_items created, status=processed

TC-PAY-003: Mark paid
Given: Processed period
When: Mark paid
Then: status=paid, paid_at set

TC-PAY-004: Attendance impact
Given: Karyawan dengan 20 attendance days
When: Process payroll
Then: attendance_days=20, attendance_bonus calculated
```

---

## 26. Current Implementation Status

```
STATUS: IMPLEMENTED
```

Period CRUD, process payroll, mark paid berfungsi. Detail calculation NOT CONFIRMED untuk beberapa field.

---

## 27. Bugs / Findings

| ID | Severity | Finding |
|----|----------|---------|
| PAY-F-01 | MEDIUM | `base_salary` source NOT CONFIRMED — tidak terlihat dari users table secara eksplisit |
| PAY-F-02 | MEDIUM | Overtime calculation NOT CONFIRMED — integrasi dengan attendance/schedules tidak terlihat |
| PAY-F-03 | LOW | Audit logging tidak terlihat eksplisit |
| PAY-F-04 | LOW | Tidak ada slip gaji printable (NOT CONFIRMED) |

---

## 28. Gaps

| Gap | Keterangan |
|-----|------------|
| Salary slip | Tidak ada slip gaji printable (NOT CONFIRMED) |
| Overtime | NOT CONFIRMED — calculation tidak terlihat |
| Tax (PPh) | Tidak ada perhitungan pajak penghasilan |
| BPJS | Tidak ada perhitungan BPJS |
| Bank transfer | Tidak ada integrasi bank transfer untuk pembayaran gaji |

---

## 29. Dependency Map

```
Payroll
 ├── Users (karyawan + base_salary)
 ├── Outlets (outlet_id scope)
 ├── Attendance (attendance_days)
 ├── Leave Requests (leave_days)
 ├── Schedules (overtime — NOT CONFIRMED)
 └── AI Assistant (query)
```

---

## 30. End-to-End Flow

```
OWNER BUKA MENU PAYROLL
 ↓
PILIH OUTLET
 ↓
CREATE PERIOD (start_date, end_date, pay_date)
 ↓
STATUS: draft
 ↓
[PROCESS PAYROLL]
 ↓
LOOP KARYAWAN:
 ├── COUNT attendance (period)
 ├── COUNT leave_requests approved (period)
 ├── CALCULATE base_salary + allowances + bonus - deductions
 └── CALCULATE net_salary
 ↓
INSERT payroll_items
 ↓
STATUS: processed
 ↓
[MARK PAID]
 ↓
STATUS: paid, paid_at=now()
 ↓
PAYROLL SELESAI
```
