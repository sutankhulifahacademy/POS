# PAYMENT ACCOUNTS (REKENING BANK) — BUSINESS & TECHNICAL DOCUMENTATION

> Dokumentasi AS-IS berdasarkan audit source code.
> Source: `frontend/src/pages/PaymentAccounts.js`, `backend/routes/payment_accounts.py`, `backend/sql/postgres_schema.sql`

---

## 1. Module Overview

Menu Payment Accounts mengelola master data rekening bank per outlet: nama bank, nama pemilik rekening, nomor rekening, dan status aktif. Data ini digunakan oleh POS/Dine-In saat pembayaran via transfer bank.

---

## 2. Business Purpose

Menyediakan daftar rekening bank tujuan transfer untuk pembayaran customer, sehingga kasir dapat menampilkan rekening yang tepat saat customer memilih transfer bank.

---

## 3. Business Objective

- Mencatat rekening bank per outlet.
- Mengaktifkan/menonaktifkan rekening.
- Menyediakan rekening aktif untuk POS checkout (transfer payment).

---

## 4. Actors / Roles

| Role | Akses | Keterangan |
|------|-------|------------|
| Owner | YA | Full CRUD, semua outlet |
| Admin | YA | Full CRUD, outlet yang di-assign |
| Manager | YA | View + Create + Update (no delete) |
| Supervisor | TIDAK | NOT CONFIRMED |
| Kasir | TIDAK | Tidak ada menu (tapi rekening digunakan di POS) |

Berdasarkan `seed_roles.sql`: manager memiliki `payment_accounts: view, create, update` (no delete).

---

## 5. Outlet Scope

**Klasifikasi: OUTLET-SCOPED**

- `payment_accounts.outlet_id` menentukan outlet pemilik rekening.
- Frontend mengirim `outlet_id` via query param.
- Backend memfilter berdasarkan `outlet_id` atau `filter_outlets_for_user`.

Sumber: `backend/routes/payment_accounts.py` lines 8-81.

---

## 6. Role & Permission

| Aksi | Owner | Admin | Manager | Supervisor | Kasir |
|------|-------|-------|---------|------------|-------|
| View | YA | YA | YA | TIDAK | TIDAK |
| Create | YA | YA | YA | TIDAK | TIDAK |
| Update | YA | YA | YA | TIDAK | TIDAK |
| Delete | YA | YA | TIDAK | TIDAK | TIDAK |

Backend:
- `GET /api/payment-accounts` → `get_current_user`
- `POST /api/payment-accounts` → `require_permission("payment_accounts", "create")`
- `PUT /api/payment-accounts/{id}` → `require_permission("payment_accounts", "update")`
- `DELETE /api/payment-accounts/{id}` → `require_permission("payment_accounts", "delete")`

---

## 7. Business Flow

```
MANAGER BUKA MENU REKENING BANK
 ↓
PILIH OUTLET
 ↓
LIHAT DAFTAR REKENING
 ↓
[TAMBAH REKENING]
 ↓
ISI: nama bank, nama pemilik, nomor rekening
 ↓
SET ACTIVE/INACTIVE
 ↓
SIMPAN
 ↓
REKENING TERSEDIA DI POS (transfer payment)
```

---

## 8. Detailed Business Rules

1. `bank_name`, `account_name`, `account_no` required, NOT NULL.
2. `is_active` default true.
3. Rekening per outlet — `outlet_id` menentukan outlet.
4. POS hanya menampilkan rekening aktif untuk outlet yang dipilih.

---

## 9. State / Status

```
is_active: true  ↔  false
```

---

## 10. Technical Architecture

```
Browser → React (PaymentAccounts.js → CrudList) → API → FastAPI (payment_accounts.py) → PostgreSQL (payment_accounts)
```

---

## 11. Technical Flow

1. `PaymentAccounts.js` menggunakan `CrudList` dengan `outlet_id` context.
2. `GET /api/payment-accounts?outlet_id={uuid}` untuk list.
3. Create: `POST /api/payment-accounts` dengan `{ bank_name, account_name, account_no, outlet_id, is_active }`.
4. Update: `PUT /api/payment-accounts/{id}`.
5. Delete: `DELETE /api/payment-accounts/{id}`.

---

## 12. Frontend

**File:** `frontend/src/pages/PaymentAccounts.js`

| Elemen | Detail |
|--------|--------|
| Component | `CrudList` (generic CRUD) |
| Endpoint | `/payment-accounts` |
| Fields | `bank_name` (required), `account_name` (required), `account_no` (required), `is_active` (checkbox) |
| Context | `useOutlet()` — `outletIdForApi` (line 4) |

---

## 13. Backend

**File:** `backend/routes/payment_accounts.py`

| Endpoint | Method | Function | Line | Auth |
|----------|--------|----------|------|------|
| `/api/payment-accounts` | GET | `list_payment_accounts` | L8 | `get_current_user` |
| `/api/payment-accounts` | POST | `create_payment_account` | L38 | `require_permission("payment_accounts", "create")` |
| `/api/payment-accounts/{account_id}` | PUT | `update_payment_account` | L58 | `require_permission("payment_accounts", "update")` |
| `/api/payment-accounts/{account_id}` | DELETE | `delete_payment_account` | L81 | `require_permission("payment_accounts", "delete")` |

---

## 14. API

```
GET /api/payment-accounts?outlet_id={uuid}
POST /api/payment-accounts { bank_name, account_name, account_no, outlet_id, is_active }
PUT /api/payment-accounts/{id} { ...fields }
DELETE /api/payment-accounts/{id}
```

---

## 15. Database

### Table: `payment_accounts`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `bank_name` | varchar(100) | — | NOT NULL |
| `account_name` | varchar(255) | — | NOT NULL |
| `account_no` | varchar(100) | — | NOT NULL |
| `outlet_id` | uuid FK | — | → `outlets(id)` ON DELETE SET NULL |
| `is_active` | boolean | true | NOT NULL |
| `created_at` | timestamptz | `now()` | |
| `updated_at` | timestamptz | `now()` | |

**Index:** `idx_payment_accounts_outlet` (`outlet_id`)

---

## 16. Data Flow

```
USER INPUT → FRONTEND → API → BACKEND → DB → RESPONSE → UI
 ↓
REKENING TERSEDIA DI POS (transfer payment)
```

---

## 17. Validation

- `bank_name`, `account_name`, `account_no` NOT NULL.
- `outlet_id` divalidasi via `filter_outlets_for_user`.

---

## 18. Calculation

Tidak ada calculation.

---

## 19. Audit Log

| Action | Entity | Dicatat? |
|--------|--------|----------|
| Create Account | `payment_account` | NOT CONFIRMED FROM SOURCE |
| Update Account | `payment_account` | NOT CONFIRMED FROM SOURCE |
| Delete Account | `payment_account` | NOT CONFIRMED FROM SOURCE |

---

## 20. Reports

- Rekening data masuk ke: Payment Reconciliation Report (transfer payments).
- POS menggunakan rekening saat customer pilih transfer.

---

## 21. Integration / Dependency

| Dependency | Keterangan |
|------------|------------|
| Outlets | `outlet_id` scope |
| POS | Rekening untuk transfer payment |
| Dine-In | Rekening untuk transfer payment |
| Sales | `sales.transfer_bank`, `transfer_account_name`, `transfer_account_no` |
| Reports | Payment reconciliation |

---

## 22. Error Handling

| Kondisi | HTTP | Behavior |
|---------|------|----------|
| Missing required field | 400 | Validation error |
| Unauthorized | 401/403 | Redirect/blocked |

---

## 23. Edge Cases

- Rekening tanpa outlet (`outlet_id=NULL`) → tidak tampil di POS (POS filter by outlet).
- Outlet dihapus → `outlet_id` SET NULL.
- Multiple rekening aktif untuk outlet sama → POS menampilkan semua.

---

## 24. Security

| Aspek | Status |
|-------|--------|
| Authentication | YA |
| Authorization | YA — `require_permission` |
| Outlet Enforcement | YA — `filter_outlets_for_user` |
| SQL Injection | Aman — parameterized |
| Sensitive Data | `account_no` — informasi finansial |

---

## 25. QA / Test Cases

```
TC-PAY-001: Create rekening
Given: Manager dengan permission create
When: Isi bank_name + account_name + account_no
Then: Rekening created

TC-PAY-002: View per outlet
Given: Outlet A punya 3 rekening, Outlet B punya 2
When: GET /payment-accounts?outlet_id=A
Then: Hanya 3 rekening outlet A

TC-PAY-003: Delete (manager)
Given: Rekening exists
When: Manager delete
Then: Error 403 (no delete permission)
```

---

## 26. Current Implementation Status

```
STATUS: IMPLEMENTED
```

CRUD rekening bank berfungsi via CrudList dengan outlet scope.

---

## 27. Bugs / Findings

| ID | Severity | Finding |
|----|----------|---------|
| PAY-F-01 | LOW | Audit logging tidak terlihat eksplisit |
| PAY-F-02 | LOW | Tidak ada validasi format nomor rekening |

---

## 28. Gaps

| Gap | Keterangan |
|-----|------------|
| E-wallet accounts | Tidak ada rekening e-wallet (GoPay, OVO, dll) |
| QRIS static | Tidak ada QRIS static code per outlet |

---

## 29. Dependency Map

```
Payment Accounts
 ├── Outlets (outlet_id scope)
 ├── POS (transfer payment selection)
 ├── Dine-In (transfer payment selection)
 ├── Sales (transfer_bank, transfer_account_name, transfer_account_no)
 └── Reports (payment reconciliation)
```

---

## 30. End-to-End Flow

```
MANAGER BUKA MENU REKENING BANK
 ↓
PILIH OUTLET
 ↓
CREATE REKENING (bank_name, account_name, account_no)
 ↓
REKENING TERSEDIA
 ↓
DIGUNAKAN OLEH:
 ├── POS (customer pilih transfer → pilih rekening)
 ├── DINE-IN (customer pilih transfer → pilih rekening)
 └── REPORTS (payment reconciliation)
```
