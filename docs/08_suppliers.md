# SUPPLIERS (SUPPLIER) — BUSINESS & TECHNICAL DOCUMENTATION

> Dokumentasi AS-IS berdasarkan audit source code.
> Source: `frontend/src/pages/Suppliers.js`, `backend/routes/suppliers.py`, `backend/sql/postgres_schema.sql`

---

## 1. Module Overview

Menu Suppliers mengelola master data supplier: nama, contact person, telepon, email, alamat. Suppliers adalah data global yang digunakan oleh Purchase Orders.

---

## 2. Business Purpose

Menyimpan data supplier untuk pencatatan pembelian barang dan komunikasi bisnis.

---

## 3. Business Objective

- Mencatat data supplier.
- Menghubungkan supplier dengan Purchase Orders.
- Menyediakan kontak supplier untuk operasional pembelian.

---

## 4. Actors / Roles

| Role | Akses | Keterangan |
|------|-------|------------|
| Owner | YA | Full CRUD |
| Admin | YA | Full CRUD |
| Manager | YA | View + Create + Update (no delete) |
| Supervisor | TIDAK | NOT CONFIRMED |
| Kasir | TIDAK | Tidak ada menu |

Berdasarkan `seed_roles.sql`: manager memiliki `suppliers: view, create, update` (no delete).

---

## 5. Outlet Scope

**Klasifikasi: GLOBAL**

- `suppliers` table tidak memiliki `outlet_id`.
- Data supplier bersifat global untuk semua outlet.
- Frontend `Suppliers.js` menggunakan `CrudList` tanpa outlet context.

---

## 6. Role & Permission

| Aksi | Owner | Admin | Manager | Supervisor | Kasir |
|------|-------|-------|---------|------------|-------|
| View | YA | YA | YA | TIDAK | TIDAK |
| Create | YA | YA | YA | TIDAK | TIDAK |
| Update | YA | YA | YA | TIDAK | TIDAK |
| Delete | YA | YA | TIDAK | TIDAK | TIDAK |

Backend:
- `GET /api/suppliers` → `get_current_user`
- `POST /api/suppliers` → `require_permission("suppliers", "create")`
- `PUT /api/suppliers/{id}` → `require_permission("suppliers", "update")`
- `DELETE /api/suppliers/{id}` → `require_permission("suppliers", "delete")`

---

## 7. Business Flow

```
MANAGER BUKA MENU SUPPLIER
 ↓
LIHAT DAFTAR SUPPLIER
 ↓
[TAMBAH SUPPLIER]
 ↓
ISI: nama, contact person, telepon, email, alamat
 ↓
SIMPAN
 ↓
SUPPLIER TERSEDIA DI PURCHASE ORDERS
```

---

## 8. Detailed Business Rules

1. `name` required, NOT NULL.
2. `contact_person`, `phone`, `email`, `address` opsional.
3. Data supplier global — tidak terikat outlet.

---

## 9. State / Status

Suppliers tidak memiliki state machine.

---

## 10. Technical Architecture

```
Browser → React (Suppliers.js → CrudList) → API → FastAPI (suppliers.py) → PostgreSQL (suppliers)
```

---

## 11. Technical Flow

1. `Suppliers.js` menggunakan `CrudList`.
2. `GET /api/suppliers` untuk list.
3. Create: `POST /api/suppliers` dengan `{ name, contact_person, phone, email, address }`.
4. Update: `PUT /api/suppliers/{id}` — update `name, contact_person, phone, email, address`.
5. Delete: `DELETE /api/suppliers/{id}`.

---

## 12. Frontend

**File:** `frontend/src/pages/Suppliers.js`

| Elemen | Detail |
|--------|--------|
| Component | `CrudList` (generic CRUD) |
| Endpoint | `/suppliers` |
| Fields | `name` (required), `contact_person`, `phone`, `email`, `address` (textarea) |
| Context | None |

---

## 13. Backend

**File:** `backend/routes/suppliers.py`

| Endpoint | Method | Function | Line | Auth |
|----------|--------|----------|------|------|
| `/api/suppliers` | GET | `list_items` | L12 | `get_current_user` |
| `/api/suppliers` | POST | `create_item` | L18 | `require_permission("suppliers", "create")` |
| `/api/suppliers/{item_id}` | PUT | `update_item` | L28 | `require_permission("suppliers", "update")` |
| `/api/suppliers/{item_id}` | DELETE | `delete_item` | L38 | `require_permission("suppliers", "delete")` |

---

## 14. API

```
GET /api/suppliers
POST /api/suppliers { name, contact_person, phone, email, address }
PUT /api/suppliers/{id} { name, contact_person, phone, email, address }
DELETE /api/suppliers/{id}
```

---

## 15. Database

### Table: `suppliers`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `name` | varchar(255) | — | NOT NULL |
| `contact_person` | varchar(255) | — | |
| `phone` | varchar(50) | — | |
| `email` | varchar(255) | — | |
| `address` | text | — | |
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

---

## 18. Calculation

Tidak ada calculation di Suppliers module.

---

## 19. Audit Log

| Action | Entity | Dicatat? |
|--------|--------|----------|
| Create Supplier | `supplier` | NOT CONFIRMED FROM SOURCE |
| Update Supplier | `supplier` | NOT CONFIRMED FROM SOURCE |
| Delete Supplier | `supplier` | NOT CONFIRMED FROM SOURCE |

---

## 20. Reports

- Supplier data masuk ke: Purchase Orders (supplier_name di PO).
- Tidak ada report supplier tersendiri.

---

## 21. Integration / Dependency

| Dependency | Keterangan |
|------------|------------|
| Purchase Orders | `supplier_id` dan `supplier_name` di PO |

---

## 22. Error Handling

| Kondisi | HTTP | Behavior |
|---------|------|----------|
| Name empty | 400 | Validation error |
| Unauthorized | 401/403 | Redirect/blocked |

---

## 23. Edge Cases

- Supplier dihapus saat ada PO reference → `purchase_orders.supplier_id` tetap ada (no FK constraint).
- Duplicate name → NOT CONFIRMED (no unique constraint).

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
TC-SUP-001: Create supplier
Given: Manager dengan permission create
When: Isi name + contact + phone
Then: Supplier created

TC-SUP-002: Delete supplier (manager)
Given: Supplier exists
When: Manager delete
Then: Error 403 (no delete permission)
```

---

## 26. Current Implementation Status

```
STATUS: IMPLEMENTED
```

CRUD supplier berfungsi via CrudList.

---

## 27. Bugs / Findings

| ID | Severity | Finding |
|----|----------|---------|
| SUP-F-01 | LOW | Audit logging tidak terlihat eksplisit |
| SUP-F-02 | LOW | Supplier dihapus tidak ada soft delete — PO reference bisa orphaned |

---

## 28. Gaps

| Gap | Keterangan |
|-----|------------|
| Supplier import/export | Tidak ada bulk import |
| Supplier performance | Tidak ada tracking performa supplier |
| Payment terms | Tidak ada terms pembayaran per supplier |

---

## 29. Dependency Map

```
Suppliers
 └── Purchase Orders (supplier_id, supplier_name)
```

---

## 30. End-to-End Flow

```
MANAGER BUKA MENU SUPPLIER
 ↓
CREATE/EDIT/DELETE SUPPLIER
 ↓
DATA GLOBAL
 ↓
DIGUNAKAN OLEH:
 └── PURCHASE ORDERS (pilih supplier saat create PO)
```
