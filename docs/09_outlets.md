# OUTLETS — BUSINESS & TECHNICAL DOCUMENTATION

> Dokumentasi AS-IS berdasarkan audit source code.
> Source: `frontend/src/pages/Outlets.js`, `backend/routes/outlets.py`, `backend/sql/postgres_schema.sql`

---

## 1. Module Overview

Menu Outlets mengelola master data outlet/cabang: nama, alamat, telepon, status main outlet, dan konfigurasi receipt/tax/service charge. Outlets adalah core dari multi-outlet architecture — semua data outlet-scoped merujuk ke table ini.

---

## 2. Business Purpose

Mendefinisikan outlet/cabang bisnis yang menjadi reference untuk seluruh operasional outlet-scoped (sales, stok, shift, attendance, dll).

---

## 3. Business Objective

- Mengelola master data outlet.
- Menentukan outlet utama (`is_main`).
- Menyimpan konfigurasi receipt, tax, dan service charge per outlet.
- Menjadi reference untuk multi-outlet scope.

---

## 4. Actors / Roles

| Role | Akses | Keterangan |
|------|-------|------------|
| Owner | YA | Full CRUD — satu-satunya yang bisa kelola outlet |
| Admin | TIDAK | NOT CONFIRMED (route menggunakan `require_role("owner")`) |
| Manager | View only | Lihat outlet yang di-assign |
| Supervisor | View only | Lihat outlet yang di-assign |
| Kasir | TIDAK | Tidak ada menu |

Berdasarkan `seed_roles.sql`: outlet management hanya untuk owner. `seed_menus.sql`: manager tidak memiliki menu `outlets`.

---

## 5. Outlet Scope

**Klasifikasi: GLOBAL (master) + OUTLET-SCOPED (view)**

- `outlets` table adalah master data — tidak memiliki `outlet_id` (dirinya adalah outlet).
- Non-owner hanya melihat outlet yang di-assign via `user_outlet_access`.
- Owner melihat semua outlet.

Sumber: `backend/routes/outlets.py` lines 12-60.

---

## 6. Role & Permission

| Aksi | Owner | Admin | Manager | Supervisor | Kasir |
|------|-------|-------|---------|------------|-------|
| View Outlets | YA (all) | YA (assigned) | YA (assigned) | YA (assigned) | TIDAK |
| Create Outlet | YA | TIDAK | TIDAK | TIDAK | TIDAK |
| Update Outlet | YA | TIDAK | TIDAK | TIDAK | TIDAK |
| Delete Outlet | YA | TIDAK | TIDAK | TIDAK | TIDAK |

Backend:
- `GET /api/outlets` → `get_current_user` (non-owner filtered)
- `GET /api/outlets/my` → `get_current_user`
- `POST /api/outlets` → `require_role("owner")`
- `PUT /api/outlets/{id}` → `require_role("owner")`
- `DELETE /api/outlets/{id}` → `require_role("owner")`

---

## 7. Business Flow

```
OWNER BUKA MENU OUTLET
 ↓
LIHAT SEMUA OUTLET
 ↓
[TAMBAH OUTLET]
 ↓
ISI: nama, alamat, telepon, is_main
 ↓
SIMPAN
 ↓
OUTLET BARU TERSEDIA
 ↓
ASSIGN USER KE OUTLET (via Users menu)
```

---

## 8. Detailed Business Rules

1. Hanya owner yang dapat create/update/delete outlet.
2. `is_main` menandai outlet utama — digunakan untuk fallback stok dan transfer source.
3. Non-owner hanya melihat outlet yang di-assign via `user_outlet_access`.
4. `GET /api/outlets/my` mengembalikan outlet yang dapat diakses user + flag `all_access`.
5. Konfigurasi receipt/tax/service charge disimpan per outlet.

---

## 9. State / Status

Outlets tidak memiliki state machine. `is_main` = boolean flag.

---

## 10. Technical Architecture

```
Browser → React (Outlets.js → CrudList) → API → FastAPI (outlets.py) → PostgreSQL (outlets)
```

---

## 11. Technical Flow

### List Outlets
1. `Outlets.js` menggunakan `CrudList`.
2. `GET /api/outlets` → backend filter berdasarkan `user["outlet_ids"]` untuk non-owner.

### My Outlets
1. `GET /api/outlets/my` → digunakan oleh `OutletContext.js`.
2. Returns `{ outlets, all_access }` — owner gets `all_access=true`.

### Create/Update/Delete
1. `POST/PUT/DELETE /api/outlets` → `require_role("owner")`.

---

## 12. Frontend

**File:** `frontend/src/pages/Outlets.js`

| Elemen | Detail |
|--------|--------|
| Component | `CrudList` (generic CRUD) |
| Endpoint | `/outlets` |
| Fields | `name` (required), `address` (textarea), `phone`, `is_main` (checkbox) |
| Context | None (CrudList) |

**File:** `frontend/src/context/OutletContext.js`

| Elemen | Detail |
|--------|--------|
| API | `GET /outlets/my` (line 19) |
| State | `outlets`, `selectedOutlet`, `all_access`, `loading` |
| Exposed | `outletIdForApi` — id untuk query/body param |

---

## 13. Backend

**File:** `backend/routes/outlets.py`

| Endpoint | Method | Function | Line | Auth |
|----------|--------|----------|------|------|
| `/api/outlets` | GET | `list_items` | L12 | `get_current_user` |
| `/api/outlets/my` | GET | `get_my_outlets` | L27 | `get_current_user` |
| `/api/outlets` | POST | `create_item` | L41 | `require_role("owner")` |
| `/api/outlets/{item_id}` | PUT | `update_item` | L50 | `require_role("owner")` |
| `/api/outlets/{item_id}` | DELETE | `delete_item` | L60 | `require_role("owner")` |

---

## 14. API

```
GET /api/outlets
GET /api/outlets/my
POST /api/outlets { name, address, phone, is_main }
PUT /api/outlets/{id} { name, address, phone, is_main }
DELETE /api/outlets/{id}
```

---

## 15. Database

### Table: `outlets`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `name` | varchar(255) | — | NOT NULL |
| `address` | text | — | |
| `phone` | varchar(50) | — | |
| `is_main` | boolean | false | Main outlet flag |
| `created_at` | timestamptz | `now()` | |
| `updated_at` | timestamptz | — | |
| `receipt_header` | text | — | Receipt config |
| `receipt_footer` | text | — | |
| `receipt_logo` | varchar(500) | — | |
| `receipt_show_cashier` | boolean | true | |
| `receipt_show_shift` | boolean | true | |
| `receipt_paper_width` | varchar(10) | `'80mm'` | |
| `receipt_font_size` | varchar(10) | `'small'` | |
| `tax_enabled` | boolean | true | |
| `tax_rate` | numeric(5,2) | 11.00 | |
| `tax_name` | varchar(50) | `'PPN'` | |
| `tax_inclusive` | boolean | false | |
| `service_charge_enabled` | boolean | false | |
| `service_charge_rate` | numeric(5,2) | 5.00 | |

No FK constraints. No indexes (beyond PK).

### Table: `user_outlet_access`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `user_id` | uuid | — | NOT NULL |
| `outlet_id` | uuid | — | NOT NULL |
| `is_primary` | boolean | false | |
| `assigned_at` | timestamptz | `now()` | |
| `created_at` | timestamptz | `now()` | |

**Constraint:** UNIQUE (`user_id`, `outlet_id`)
**Indexes:** `idx_user_outlet_access_user`, `idx_user_outlet_access_outlet`

**Relationship:**
```
outlets (1) ─── (many) user_outlet_access
outlets (1) ─── (many) sales, outlet_stocks, shifts, attendance, dll
```

---

## 16. Data Flow

```
OWNER INPUT → FRONTEND → API → BACKEND → DB (outlets) → RESPONSE → UI
 ↓
OUTLET CONTEXT LOADED VIA OutletContext (GET /outlets/my)
 ↓
DISTRIBUSI KE SEMUA MODULE OUTLET-SCOPED
```

---

## 17. Validation

- `name` NOT NULL.
- `is_main` boolean.

---

## 18. Calculation

Tidak ada calculation di Outlets module (konfigurasi tax/service charge digunakan oleh POS/Sales).

---

## 19. Audit Log

| Action | Entity | Dicatat? |
|--------|--------|----------|
| Create Outlet | `outlet` | NOT CONFIRMED FROM SOURCE |
| Update Outlet | `outlet` | NOT CONFIRMED FROM SOURCE |
| Delete Outlet | `outlet` | NOT CONFIRMED FROM SOURCE |

---

## 20. Reports

- Outlet data masuk ke: Branch Comparison Report, Dashboard (branch comparison), semua report outlet-scoped.
- `outlets.name` ditampilkan di join dengan sales, shifts, dll.

---

## 21. Integration / Dependency

| Dependency | Keterangan |
|------------|------------|
| User Outlet Access | Assign user ke outlet |
| Sales | `sales.outlet_id` |
| Outlet Stocks | `outlet_stocks.outlet_id` |
| Shifts | `shifts.outlet_id` |
| Attendance | `attendance.outlet_id` |
| Tables | `tables.outlet_id` |
| Orders | `orders.outlet_id` |
| Expenses | `expenses.outlet_id` |
| Alerts | `alerts.outlet_id` |
| Audit Logs | `audit_logs.outlet_id` |
| Leave Requests | `leave_requests.outlet_id` |
| All Reports | Outlet filter |
| Dashboard | Branch comparison |
| Receipt Config | Per outlet |

---

## 22. Error Handling

| Kondisi | HTTP | Behavior |
|---------|------|----------|
| Non-owner create/update/delete | 403 | "Forbidden" |
| Unauthorized | 401 | Redirect ke login |

---

## 23. Edge Cases

- Outlet dihapus saat ada data referensi → `outlet_stocks.outlet_id` ON DELETE CASCADE, `payment_accounts.outlet_id` ON DELETE SET NULL, `expenses.outlet_id` ON DELETE SET NULL.
- `is_main` di-set ke false untuk semua → fallback ke outlet pertama (`_get_main_outlet_id` di inventory_service).
- Multiple outlets dengan `is_main=true` → NOT CONFIRMED (tidak ada constraint unique).

---

## 24. Security

| Aspek | Status |
|-------|--------|
| Authentication | YA |
| Authorization | YA — `require_role("owner")` untuk CUD |
| Outlet Enforcement | YA — non-owner filtered |
| SQL Injection | Aman — parameterized |

---

## 25. QA / Test Cases

```
TC-OUT-001: Owner create outlet
Given: Owner login
When: Create outlet "Outlet Baru"
Then: Outlet created

TC-OUT-002: Manager cannot create outlet
Given: Manager login
When: POST /outlets
Then: 403 Forbidden

TC-OUT-003: Manager view assigned outlets
Given: Manager dengan 2 outlet assigned
When: GET /outlets
Then: Hanya 2 outlet yang ditampilkan

TC-OUT-004: Outlet context
Given: User login
When: OutletContext load
Then: GET /outlets/my returns assigned outlets + all_access flag
```

---

## 26. Current Implementation Status

```
STATUS: IMPLEMENTED
```

CRUD outlet, outlet context, dan multi-outlet scope berfungsi.

---

## 27. Bugs / Findings

| ID | Severity | Finding |
|----|----------|---------|
| OUT-F-01 | LOW | Multiple `is_main=true` tidak dicegah — tidak ada constraint unique |
| OUT-F-02 | LOW | Audit logging tidak terlihat eksplisit |
| OUT-F-03 | LOW | Delete outlet dapat menyebabkan data orphaned (sales.outlet_id tidak ada FK constraint) |

---

## 28. Gaps

| Gap | Keterangan |
|-----|------------|
| Outlet status | Tidak ada status active/inactive untuk outlet |
| Outlet grouping | Tidak ada grouping/region untuk outlet |
| Outlet settings | Konfigurasi receipt via menu terpisah (ReceiptConfig) |

---

## 29. Dependency Map

```
Outlets
 ├── User Outlet Access (assign user)
 ├── Sales (outlet_id)
 ├── Outlet Stocks (outlet_id)
 ├── Shifts (outlet_id)
 ├── Attendance (outlet_id)
 ├── Tables (outlet_id)
 ├── Orders (outlet_id)
 ├── Expenses (outlet_id)
 ├── Alerts (outlet_id)
 ├── Audit Logs (outlet_id)
 ├── Leave Requests (outlet_id)
 ├── Customer Memberships (outlet_id)
 ├── Point Transactions (outlet_id)
 ├── Kitchen Orders (outlet_id)
 ├── Coupons (outlet_id)
 ├── Employee Schedules (outlet_id)
 ├── Payroll Periods (outlet_id)
 ├── Payroll Items (outlet_id)
 ├── Platform Fee Configs (outlet_id)
 ├── Online Orders (outlet_id)
 ├── Receipt Config (per outlet)
 └── All Reports (outlet filter)
```

---

## 30. End-to-End Flow

```
OWNER BUKA MENU OUTLET
 ↓
CREATE OUTLET (name, address, phone, is_main)
 ↓
OUTLET TERSEDIA
 ↓
ASSIGN USER KE OUTLET (via Users menu → user_outlet_access)
 ↓
USER LOGIN → OUTLET CONTEXT LOADED
 ↓
SEMUA MODULE OUTLET-SCOPED MENGGUNAKAN OUTLET CONTEXT
 ↓
DATA PER OUTLET TERPISAH
 ↓
OWNER DAPAT BANDINGKAN ANTAR OUTLET (Dashboard, Reports)
```
