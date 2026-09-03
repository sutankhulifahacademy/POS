# CUSTOMERS (PELANGGAN) — BUSINESS & TECHNICAL DOCUMENTATION

> Dokumentasi AS-IS berdasarkan audit source code.
> Source: `frontend/src/pages/Customers.js`, `backend/routes/customers.py`, `backend/sql/postgres_schema.sql`

---

## 1. Module Overview

Menu Customers mengelola master data pelanggan: nama, telepon, email, alamat, loyalty points, total spent, dan visit count. Customers adalah data global yang digunakan oleh POS, Dine-In, Loyalty, dan Reports.

---

## 2. Business Purpose

Menyimpan data pelanggan untuk identifikasi transaksi, tracking loyalty points, dan analisa perilaku pembelian.

---

## 3. Business Objective

- Mencatat data pelanggan.
- Menghubungkan pelanggan dengan transaksi penjualan.
- Menyediakan data untuk Loyalty module.
- Melacak total spent dan visit count.

---

## 4. Actors / Roles

| Role | Akses | Keterangan |
|------|-------|------------|
| Owner | YA | Full CRUD |
| Admin | YA | Full CRUD |
| Manager | YA | View + Create + Update (no delete) |
| Supervisor | TIDAK | NOT CONFIRMED |
| Kasir | TIDAK | Tidak ada menu (tapi bisa pilih customer di POS) |

Berdasarkan `seed_roles.sql`: manager memiliki `customers: view, create, update` (no delete).

---

## 5. Outlet Scope

**Klasifikasi: GLOBAL**

- `customers` table tidak memiliki `outlet_id`.
- Data pelanggan bersifat global untuk semua outlet.
- Frontend `Customers.js` menggunakan `CrudList` tanpa outlet context.

Sumber: `frontend/src/pages/Customers.js`, `backend/routes/customers.py`.

---

## 6. Role & Permission

| Aksi | Owner | Admin | Manager | Supervisor | Kasir |
|------|-------|-------|---------|------------|-------|
| View | YA | YA | YA | TIDAK | TIDAK |
| Create | YA | YA | YA | TIDAK | TIDAK |
| Update | YA | YA | YA | TIDAK | TIDAK |
| Delete | YA | YA | TIDAK | TIDAK | TIDAK |

Backend:
- `GET /api/customers` → `get_current_user`
- `POST /api/customers` → `require_permission("customers", "create")`
- `PUT /api/customers/{id}` → `require_permission("customers", "update")`
- `DELETE /api/customers/{id}` → `require_permission("customers", "delete")`

---

## 7. Business Flow

```
MANAGER BUKA MENU PELANGGAN
 ↓
LIHAT DAFTAR PELANGGAN
 ↓
[TAMBAH PELANGGAN]
 ↓
ISI: nama, telepon, email, alamat
 ↓
SIMPAN
 ↓
PELANGGAN TERSEDIA DI POS & LOYALTY
```

---

## 8. Detailed Business Rules

1. `name` required, NOT NULL.
2. `phone`, `email`, `address` opsional.
3. `loyalty_points`, `total_spent`, `visit_count` di-maintain oleh sistem (bukan input user).
4. Data pelanggan global — tidak terikat outlet.

---

## 9. State / Status

Customers tidak memiliki state machine.

---

## 10. Technical Architecture

```
Browser → React (Customers.js → CrudList) → API → FastAPI (customers.py) → PostgreSQL (customers)
```

---

## 11. Technical Flow

1. `Customers.js` menggunakan `CrudList` component.
2. `CrudList` melakukan `GET /api/customers` untuk list.
3. Create: `POST /api/customers` dengan `{ name, phone, email, address }`.
4. Update: `PUT /api/customers/{id}`.
5. Delete: `DELETE /api/customers/{id}`.

---

## 12. Frontend

**File:** `frontend/src/pages/Customers.js`

| Elemen | Detail |
|--------|--------|
| Component | `CrudList` (generic CRUD) |
| Endpoint | `/customers` |
| Fields | `name` (required), `phone`, `email`, `address` (textarea, hidden in list) |
| Context | None (no outlet context) |

---

## 13. Backend

**File:** `backend/routes/customers.py`

| Endpoint | Method | Function | Line | Auth |
|----------|--------|----------|------|------|
| `/api/customers` | GET | `list_items` | L12 | `get_current_user` |
| `/api/customers` | POST | `create_item` | L18 | `require_permission("customers", "create")` |
| `/api/customers/{item_id}` | PUT | `update_item` | L28 | `require_permission("customers", "update")` |
| `/api/customers/{item_id}` | DELETE | `delete_item` | L38 | `require_permission("customers", "delete")` |

---

## 14. API

```
GET /api/customers
POST /api/customers { name, phone, email, address }
PUT /api/customers/{id} { name, phone, email, address }
DELETE /api/customers/{id}
```

---

## 15. Database

### Table: `customers`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `name` | varchar(255) | — | NOT NULL |
| `phone` | varchar(50) | — | |
| `email` | varchar(255) | — | |
| `address` | text | — | |
| `loyalty_points` | integer | 0 | Maintained by system |
| `total_spent` | numeric(14,2) | 0 | Maintained by system |
| `visit_count` | integer | 0 | Maintained by system |
| `created_at` | timestamptz | `now()` | |
| `updated_at` | timestamptz | — | |

No FK constraints. No indexes (beyond PK).

---

## 16. Data Flow

```
USER INPUT → FRONTEND → API → BACKEND → DB → RESPONSE → UI
```

---

## 17. Validation

- `name` NOT NULL.
- Email format: NOT CONFIRMED (no explicit validation in route).

---

## 18. Calculation

- `loyalty_points`: di-update oleh Loyalty module (`adjust_points`).
- `total_spent` dan `visit_count`: NOT CONFIRMED FROM SOURCE — kemungkinan di-update saat sale, tapi tidak terlihat eksplisit di customers route.

---

## 19. Audit Log

| Action | Entity | Dicatat? |
|--------|--------|----------|
| Create Customer | `customer` | NOT CONFIRMED FROM SOURCE |
| Update Customer | `customer` | NOT CONFIRMED FROM SOURCE |
| Delete Customer | `customer` | NOT CONFIRMED FROM SOURCE |

---

## 20. Reports

- Customer data masuk ke: Sales Report (by customer), Loyalty module.
- Tidak ada report customer tersendiri.

---

## 21. Integration / Dependency

| Dependency | Keterangan |
|------------|------------|
| POS | Pilih customer saat checkout |
| Dine-In | Pilih customer saat order |
| Loyalty | Membership & points per outlet |
| Sales | `customer_id` reference |
| Reports | Sales by customer |

---

## 22. Error Handling

| Kondisi | HTTP | Behavior |
|---------|------|----------|
| Name empty | 400 | Validation error |
| Unauthorized | 401/403 | Redirect/blocked |

---

## 23. Edge Cases

- Customer dihapus saat ada sales reference → `sales.customer_id` tetap ada (no FK constraint).
- Duplicate phone/email → NOT CONFIRMED (no unique constraint).

---

## 24. Security

| Aspek | Status |
|-------|--------|
| Authentication | YA |
| Authorization | YA — `require_permission` |
| Outlet Enforcement | TIDAK — global data |
| SQL Injection | Aman — parameterized |

---

## 25. QA / Test Cases

```
TC-CUS-001: Create customer
Given: Manager dengan permission create
When: Isi name + phone + email
Then: Customer created

TC-CUS-002: Update customer
Given: Customer exists
When: Update phone
Then: Customer updated

TC-CUS-003: Delete customer (manager)
Given: Customer exists
When: Manager delete
Then: Error 403 (no delete permission)
```

---

## 26. Current Implementation Status

```
STATUS: IMPLEMENTED
```

CRUD customer berfungsi via CrudList.

---

## 27. Bugs / Findings

| ID | Severity | Finding |
|----|----------|---------|
| CUS-F-01 | LOW | `total_spent` dan `visit_count` tidak terlihat di-update di customers route |
| CUS-F-02 | LOW | Audit logging tidak terlihat eksplisit |

---

## 28. Gaps

| Gap | Keterangan |
|-----|------------|
| Customer import/export | Tidak ada bulk import |
| Customer segmentation | Tidak ada segmentasi pelanggan |
| Duplicate detection | Tidak ada deteksi duplikat phone/email |

---

## 29. Dependency Map

```
Customers
 ├── POS (customer selection)
 ├── Dine-In (customer selection)
 ├── Loyalty (membership & points)
 ├── Sales (customer_id reference)
 └── Reports (sales by customer)
```

---

## 30. End-to-End Flow

```
MANAGER BUKA MENU PELANGGAN
 ↓
CREATE/EDIT/DELETE CUSTOMER
 ↓
DATA GLOBAL (semua outlet)
 ↓
DIGUNAKAN OLEH:
 ├── POS (pilih customer)
 ├── DINE-IN (pilih customer)
 ├── LOYALTY (membership)
 └── REPORTS (sales by customer)
```
