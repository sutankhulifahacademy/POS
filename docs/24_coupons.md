# COUPONS — BUSINESS & TECHNICAL DOCUMENTATION

> Dokumentasi AS-IS berdasarkan audit source code.
> Source: `frontend/src/pages/Coupons.js`, `backend/routes/coupons.py`, `backend/sql/postgres_schema.sql`

---

## 1. Module Overview

Menu Coupons mengelola kupon diskon: kode, tipe (percentage/fixed), nilai, tanggal mulai/berakhir, status aktif, dan batas penggunaan. Coupons dapat di-apply di POS checkout.

---

## 2. Business Purpose

Menyediakan promosi/diskon via kupon untuk meningkatkan penjualan dan loyalitas pelanggan.

---

## 3. Business Objective

- Membuat kupon diskon (percentage/fixed).
- Mengatur periode berlaku kupon.
- Membatasi penggunaan kupon.
- Meng-apply kupon di POS checkout.

---

## 4. Actors / Roles

| Role | Akses | Keterangan |
|------|-------|------------|
| Owner | YA | Full CRUD |
| Admin | YA | Full CRUD |
| Manager | YA | View + Create + Update (no delete) |
| Supervisor | TIDAK | NOT CONFIRMED |
| Kasir | TIDAK | Tidak ada menu (tapi apply di POS) |

Berdasarkan `seed_roles.sql`: NOT CONFIRMED — coupons mungkin tidak ada di seed roles.

---

## 5. Outlet Scope

**Klasifikasi: OUTLET-SCOPED**

- `coupons.outlet_id` menentukan outlet kupon.
- Frontend mengirim `outlet_id` via query param.
- Backend memfilter berdasarkan `outlet_id` atau `filter_outlets_for_user`.

Sumber: `backend/routes/coupons.py` lines 8-80.

---

## 6. Role & Permission

| Aksi | Owner | Admin | Manager | Supervisor | Kasir |
|------|-------|-------|---------|------------|-------|
| View | YA | YA | YA | TIDAK | TIDAK |
| Create | YA | YA | YA | TIDAK | TIDAK |
| Update | YA | YA | YA | TIDAK | TIDAK |
| Delete | YA | YA | TIDAK | TIDAK | TIDAK |
| Apply (POS) | YA | YA | YA | YA | YA |

Backend:
- `GET /api/coupons` → `get_current_user`
- `POST /api/coupons` → `require_permission("coupons", "create")`
- `PUT /api/coupons/{id}` → `require_permission("coupons", "update")`
- `DELETE /api/coupons/{id}` → `require_permission("coupons", "delete")`
- `POST /api/coupons/validate` → `get_current_user` (untuk POS)

---

## 7. Business Flow

```
MANAGER BUKA MENU COUPONS
 ↓
PILIH OUTLET
 ↓
LIHAT DAFTAR KUPON
 ↓
[TAMBAH KUPON]
 ↓
ISI: code, type, value, start_date, end_date, max_usage, is_active
 ↓
SIMPAN
 ↓
KUPON TERSEDIA DI POS
 ↓
[KASIR APPLY KUPON DI POS]
 ↓
VALIDATE KUPON
 ↓
DISCOUNT DITERAPKAN
```

---

## 8. Detailed Business Rules

1. `code` unik per outlet.
2. `type`: `percentage` atau `fixed`.
3. `value`: persentase (0-100) atau nominal fixed.
4. `start_date`, `end_date` menentukan periode berlaku.
5. `max_usage`: batas penggunaan (NULL = unlimited).
6. `usage_count`: counter penggunaan (increment saat apply).
7. `is_active`: kupon non-aktif tidak dapat di-apply.
8. Validate kupon di POS: cek code, active, date range, max_usage.

---

## 9. State / Status

```
is_active: true  ↔  false
```

Kupon dianggap valid jika:
- `is_active = true`
- `start_date <= today <= end_date`
- `usage_count < max_usage` (atau max_usage NULL)

---

## 10. Technical Architecture

```
Browser → React (Coupons.js → CrudList) → API → FastAPI (coupons.py) → PostgreSQL (coupons)
 ↓
POS → POST /coupons/validate → discount applied
```

---

## 11. Technical Flow

### CRUD
1. `Coupons.js` menggunakan `CrudList` dengan outlet context.
2. `GET /api/coupons?outlet_id={uuid}` untuk list.
3. Create/Update/Delete via standard CRUD.

### Validate (POS)
1. POS checkout → user input coupon code.
2. `POST /api/coupons/validate` dengan `{ code, outlet_id, subtotal }`.
3. Backend `validate_coupon`:
   - Find coupon by code + outlet_id.
   - Check `is_active`, date range, `max_usage`.
   - Calculate discount: `percentage` → `subtotal × value/100`, `fixed` → `value`.
4. Response → frontend apply discount.

---

## 12. Frontend

**File:** `frontend/src/pages/Coupons.js`

| Elemen | Detail |
|--------|--------|
| Component | `CrudList` (generic CRUD) |
| Endpoint | `/coupons` |
| Fields | `code` (required), `type` (percentage/fixed), `value` (number), `start_date`, `end_date`, `max_usage`, `is_active` (checkbox) |
| Context | `useOutlet()` — `outletIdForApi` |

> POS.js juga memiliki coupon input di checkout (NOT CONFIRMED — kemungkinan).

---

## 13. Backend

**File:** `backend/routes/coupons.py`

| Endpoint | Method | Function | Line | Auth |
|----------|--------|----------|------|------|
| `/api/coupons` | GET | `list_coupons` | L8 | `get_current_user` |
| `/api/coupons` | POST | `create_coupon` | L38 | `require_permission("coupons", "create")` |
| `/api/coupons/{id}` | PUT | `update_coupon` | L54 | `require_permission("coupons", "update")` |
| `/api/coupons/{id}` | DELETE | `delete_coupon` | L70 | `require_permission("coupons", "delete")` |
| `/api/coupons/validate` | POST | `validate_coupon` | L80 | `get_current_user` |

---

## 14. API

```
GET /api/coupons?outlet_id={uuid}
POST /api/coupons { code, type, value, start_date, end_date, max_usage, is_active, outlet_id }
PUT /api/coupons/{id} { ...fields }
DELETE /api/coupons/{id}
POST /api/coupons/validate { code, outlet_id, subtotal }
```

---

## 15. Database

### Table: `coupons`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `code` | varchar(50) | — | NOT NULL |
| `type` | varchar(20) | — | NOT NULL — percentage/fixed |
| `value` | numeric(14,2) | — | NOT NULL |
| `start_date` | date | — | |
| `end_date` | date | — | |
| `max_usage` | integer | — | NULL = unlimited |
| `usage_count` | integer | 0 | |
| `is_active` | boolean | true | NOT NULL |
| `outlet_id` | uuid | — | |
| `created_at` | timestamptz | `now()` | |
| `updated_at` | timestamptz | `now()` | |

**Index:** `idx_coupons_outlet` (`outlet_id`, `is_active`)

---

## 16. Data Flow

```
USER INPUT → FRONTEND → API → BACKEND → DB → RESPONSE → UI
 ↓
[POS CHECKOUT]
 ↓
INPUT COUPON CODE
 ↓
POST /coupons/validate
 ↓
BACKEND: validate + calculate discount
 ↓
RESPONSE: discount amount
 ↓
APPLY TO SALE
 ↓
INCREMENT usage_count
```

---

## 17. Validation

- `code`, `type`, `value` NOT NULL.
- `type` valid (percentage/fixed).
- Validate: `is_active`, date range, `max_usage`.

---

## 18. Calculation

### Discount
```
percentage: discount = subtotal × (value / 100)
fixed: discount = value
```

---

## 19. Audit Log

| Action | Entity | Dicatat? |
|--------|--------|----------|
| Create Coupon | `coupon` | NOT CONFIRMED FROM SOURCE |
| Update Coupon | `coupon` | NOT CONFIRMED FROM SOURCE |
| Delete Coupon | `coupon` | NOT CONFIRMED FROM SOURCE |
| Apply Coupon | `coupon` | NOT CONFIRMED — usage_count increment |

---

## 20. Reports

- Tidak ada report coupons tersendiri (NOT CONFIRMED).
- Coupon discount masuk ke Sales Report (sebagai discount).

---

## 21. Integration / Dependency

| Dependency | Keterangan |
|------------|------------|
| Outlets | `outlet_id` scope |
| POS | Validate & apply coupon |
| Sales | `sales.discount` includes coupon |

---

## 22. Error Handling

| Kondisi | HTTP | Behavior |
|---------|------|----------|
| Coupon not found | 404 | "Coupon not found" |
| Coupon inactive | 400 | "Coupon inactive" |
| Coupon expired | 400 | "Coupon expired" |
| Max usage reached | 400 | "Coupon usage limit reached" |
| Unauthorized | 401/403 | Redirect/blocked |

---

## 23. Edge Cases

- Coupon tanpa outlet (`outlet_id=NULL`) → NOT CONFIRMED (kemungkinan global).
- Coupon dengan `max_usage=0` → tidak bisa di-apply.
- Coupon expired → validate gagal.
- Concurrent apply → race condition pada `usage_count` (POTENTIAL FINDING).

---

## 24. Security

| Aspek | Status |
|-------|--------|
| Authentication | YA |
| Authorization | YA — `require_permission` |
| Outlet Enforcement | YA — `outlet_id` filter |
| SQL Injection | Aman — parameterized |
| Race Condition | POTENTIAL FINDING — usage_count increment tidak atomic |

---

## 25. QA / Test Cases

```
TC-COP-001: Create coupon percentage
Given: Manager dengan permission create
When: Create coupon "DISC10" type=percentage, value=10
Then: Coupon created

TC-COP-002: Validate coupon
Given: Active coupon "DISC10" percentage 10%
When: Validate with subtotal=100000
Then: discount=10000

TC-COP-003: Expired coupon
Given: Coupon dengan end_date < today
When: Validate
Then: Error "Coupon expired"

TC-COP-004: Max usage reached
Given: Coupon max_usage=5, usage_count=5
When: Validate
Then: Error "Coupon usage limit reached"
```

---

## 26. Current Implementation Status

```
STATUS: IMPLEMENTED
```

CRUD coupons, validate, apply di POS berfungsi.

---

## 27. Bugs / Findings

| ID | Severity | Finding |
|----|----------|---------|
| COP-F-01 | MEDIUM | `usage_count` increment tidak atomic — race condition pada concurrent apply |
| COP-F-02 | LOW | Audit logging tidak terlihat eksplisit |
| COP-F-03 | LOW | Coupon integration dengan POS checkout NOT CONFIRMED dari source |

---

## 28. Gaps

| Gap | Keterangan |
|-----|------------|
| Coupon per product | Tidak ada kupon per produk tertentu |
| Coupon per category | Tidak ada kupon per kategori |
| Coupon report | Tidak ada report penggunaan kupon |
| Customer-specific coupon | Tidak ada kupon per pelanggan |

---

## 29. Dependency Map

```
Coupons
 ├── Outlets (outlet_id scope)
 ├── POS (validate & apply)
 └── Sales (discount)
```

---

## 30. End-to-End Flow

```
MANAGER BUKA MENU COUPONS
 ↓
CREATE COUPON (code, type, value, dates, max_usage)
 ↓
KUPON TERSEDIA
 ↓
[KASIR DI POS]
 ↓
INPUT COUPON CODE
 ↓
POST /coupons/validate
 ↓
VALIDATE: active, date, max_usage
 ↓
CALCULATE DISCOUNT
 ↓
APPLY TO SALE
 ↓
INCREMENT usage_count
 ↓
SALE DENGAN DISCOUNT
```
