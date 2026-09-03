# EXPENSES (PENGELUARAN) — BUSINESS & TECHNICAL DOCUMENTATION

> Dokumentasi AS-IS berdasarkan audit source code.
> Source: `frontend/src/pages/Expenses.js`, `backend/routes/expenses.py`, `backend/sql/postgres_schema.sql`

---

## 1. Module Overview

Menu Expenses mengelola pencatatan pengeluaran operasional per outlet: kategori, amount, tanggal, catatan. Data expenses masuk ke P&L Report untuk perhitungan net profit.

---

## 2. Business Purpose

Mencatat pengeluaran operasional untuk perhitungan profit/loss yang akurat.

---

## 3. Business Objective

- Mencatat pengeluaran per outlet.
- Mengkategorikan pengeluaran.
- Menyediakan data untuk P&L Report.
- Melacak pengeluaran over time.

---

## 4. Actors / Roles

| Role | Akses | Keterangan |
|------|-------|------------|
| Owner | YA | Semua outlet |
| Admin | YA | Outlet yang di-assign |
| Manager | YA | Outlet yang di-assign |
| Supervisor | TIDAK | NOT CONFIRMED |
| Kasir | TIDAK | Tidak ada menu Expenses |

Berdasarkan `seed_roles.sql`: manager memiliki `expenses: view, create, update` (no delete).

---

## 5. Outlet Scope

**Klasifikasi: OUTLET-SCOPED**

- `expenses.outlet_id` menentukan outlet pengeluaran.
- Frontend mengirim `outlet_id` via query/body.
- Backend memfilter berdasarkan `outlet_id` atau `filter_outlets_for_user`.

Sumber: `backend/routes/expenses.py` lines 8-71.

---

## 6. Role & Permission

| Aksi | Owner | Admin | Manager | Supervisor | Kasir |
|------|-------|-------|---------|------------|-------|
| View | YA | YA | YA | TIDAK | TIDAK |
| Create | YA | YA | YA | TIDAK | TIDAK |
| Update | YA | YA | YA | TIDAK | TIDAK |
| Delete | YA | YA | TIDAK | TIDAK | TIDAK |

Backend:
- `GET /api/expenses` → `get_current_user`
- `POST /api/expenses` → `require_permission("expenses", "create")`
- `PUT /api/expenses/{id}` → `require_permission("expenses", "update")`
- `DELETE /api/expenses/{id}` → `require_permission("expenses", "delete")`

---

## 7. Business Flow

```
MANAGER BUKA MENU PENGELUARAN
 ↓
PILIH OUTLET
 ↓
LIHAT DAFTAR PENGELUARAN
 ↓
[TAMBAH PENGELUARAN]
 ↓
ISI: kategori, amount, tanggal, catatan
 ↓
SIMPAN
 ↓
DATA MASUK P&L REPORT
```

---

## 8. Detailed Business Rules

1. `category`, `amount`, `expense_date` required.
2. `amount` > 0.
3. `outlet_id` menentukan outlet pengeluaran.
4. Data expenses masuk ke P&L sebagai komponen pengurang net profit.

---

## 9. State / Status

Expenses tidak memiliki state machine.

---

## 10. Technical Architecture

```
Browser → React (Expenses.js → CrudList) → API → FastAPI (expenses.py) → PostgreSQL (expenses)
```

---

## 11. Technical Flow

1. `Expenses.js` menggunakan `CrudList` dengan outlet context.
2. `GET /api/expenses?outlet_id={uuid}` untuk list.
3. Create: `POST /api/expenses` dengan `{ category, amount, expense_date, note, outlet_id }`.
4. Update: `PUT /api/expenses/{id}`.
5. Delete: `DELETE /api/expenses/{id}`.

---

## 12. Frontend

**File:** `frontend/src/pages/Expenses.js`

| Elemen | Detail |
|--------|--------|
| Component | `CrudList` (generic CRUD) |
| Endpoint | `/expenses` |
| Fields | `category` (required), `amount` (number, required), `expense_date` (date, required), `note` (textarea) |
| Context | `useOutlet()` — `outletIdForApi` |

---

## 13. Backend

**File:** `backend/routes/expenses.py`

| Endpoint | Method | Function | Line | Auth |
|----------|--------|----------|------|------|
| `/api/expenses` | GET | `list_expenses` | L8 | `get_current_user` |
| `/api/expenses` | POST | `create_expense` | L38 | `require_permission("expenses", "create")` |
| `/api/expenses/{expense_id}` | PUT | `update_expense` | L54 | `require_permission("expenses", "update")` |
| `/api/expenses/{expense_id}` | DELETE | `delete_expense` | L71 | `require_permission("expenses", "delete")` |

---

## 14. API

```
GET /api/expenses?outlet_id={uuid}
POST /api/expenses { category, amount, expense_date, note, outlet_id }
PUT /api/expenses/{id} { ...fields }
DELETE /api/expenses/{id}
```

---

## 15. Database

### Table: `expenses`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `category` | varchar(100) | — | NOT NULL |
| `amount` | numeric(14,2) | — | NOT NULL |
| `expense_date` | date | — | NOT NULL |
| `note` | text | — | |
| `outlet_id` | uuid FK | — | → `outlets(id)` ON DELETE SET NULL |
| `created_by` | uuid | — | |
| `created_at` | timestamptz | `now()` | |
| `updated_at` | timestamptz | `now()` | |

**Index:** `idx_expenses_outlet` (`outlet_id`, `expense_date` DESC)

---

## 16. Data Flow

```
USER INPUT → FRONTEND → API → BACKEND → DB → RESPONSE → UI
 ↓
DATA MASUK P&L REPORT
```

---

## 17. Validation

- `category`, `amount`, `expense_date` NOT NULL.
- `amount` > 0 (NOT CONFIRMED — kemungkinan divalidasi).

---

## 18. Calculation

### P&L Impact
```
net_profit = gross_profit - total_expenses
total_expenses = SUM(expenses.amount) WHERE outlet_id AND expense_date IN range
```

---

## 19. Audit Log

| Action | Entity | Dicatat? |
|--------|--------|----------|
| Create Expense | `expense` | NOT CONFIRMED FROM SOURCE |
| Update Expense | `expense` | NOT CONFIRMED FROM SOURCE |
| Delete Expense | `expense` | NOT CONFIRMED FROM SOURCE |

---

## 20. Reports

- P&L Report: expenses sebagai komponen pengurang net profit.
- Tidak ada report expenses tersendiri (NOT CONFIRMED).

---

## 21. Integration / Dependency

| Dependency | Keterangan |
|------------|------------|
| Outlets | `outlet_id` scope |
| Reports | P&L calculation |
| Users | `created_by` |

---

## 22. Error Handling

| Kondisi | HTTP | Behavior |
|---------|------|----------|
| Missing required field | 400 | Validation error |
| Unauthorized | 401/403 | Redirect/blocked |

---

## 23. Edge Cases

- Expense tanpa outlet (`outlet_id=NULL`) → tidak masuk P&L per outlet.
- Outlet dihapus → `outlet_id` SET NULL.
- Expense dihapus → P&L berubah untuk periode tersebut.

---

## 24. Security

| Aspek | Status |
|-------|--------|
| Authentication | YA |
| Authorization | YA — `require_permission` |
| Outlet Enforcement | YA — `filter_outlets_for_user` |
| SQL Injection | Aman — parameterized |

---

## 25. QA / Test Cases

```
TC-EXP-001: Create expense
Given: Manager dengan permission create
When: Isi category + amount + date
Then: Expense created

TC-EXP-002: Delete (manager)
Given: Expense exists
When: Manager delete
Then: Error 403 (no delete permission)

TC-EXP-003: P&L impact
Given: Outlet dengan revenue 100000, COGS 40000, expenses 10000
When: View P&L
Then: gross=60000, net=50000
```

---

## 26. Current Implementation Status

```
STATUS: IMPLEMENTED
```

CRUD expenses berfungsi via CrudList dengan outlet scope.

---

## 27. Bugs / Findings

| ID | Severity | Finding |
|----|----------|---------|
| EXP-F-01 | LOW | Audit logging tidak terlihat eksplisit |
| EXP-F-02 | LOW | Tidak ada expense category master — kategori free text |

---

## 28. Gaps

| Gap | Keterangan |
|-----|------------|
| Expense category master | Tidak ada master kategori pengeluaran |
| Recurring expenses | Tidak ada pengeluaran berulang |
| Expense approval | Tidak ada approval untuk expense besar |

---

## 29. Dependency Map

```
Expenses
 ├── Outlets (outlet_id scope)
 ├── Users (created_by)
 └── Reports (P&L calculation)
```

---

## 30. End-to-End Flow

```
MANAGER BUKA MENU PENGELUARAN
 ↓
PILIH OUTLET
 ↓
CREATE EXPENSE (category, amount, date, note)
 ↓
DATA TERCATAT
 ↓
MASUK P&L REPORT (net profit calculation)
```
