# AUDIT LOGS — BUSINESS & TECHNICAL DOCUMENTATION

> Dokumentasi AS-IS berdasarkan audit source code.
> Source: `frontend/src/pages/AuditLogs.js`, `backend/routes/audit_logs.py`, `backend/utils.py`, `backend/sql/postgres_schema.sql`

---

## 1. Module Overview

Menu Audit Logs menampilkan history aktivitas pengguna: siapa melakukan apa, kapan, di outlet mana, dengan detail perubahan. Audit logs adalah module read-only yang menyediakan traceability untuk keperluan keamanan dan compliance.

---

## 2. Business Purpose

Menyediakan audit trail untuk semua aksi penting di sistem, sehingga dapat dilacak siapa melakukan apa dan kapan.

---

## 3. Business Objective

- Mencatat aktivitas user (create/update/delete/approve/reject).
- Melacak perubahan data dengan old/new values.
- Menyediakan filter by user, action, entity, outlet, date.
- Menyediakan traceability untuk compliance.

---

## 4. Actors / Roles

| Role | Akses | Keterangan |
|------|-------|------------|
| Owner | YA | Semua outlet |
| Admin | YA | Outlet yang di-assign |
| Manager | TIDAK | Tidak ada menu Audit Logs |
| Supervisor | TIDAK | Tidak ada menu |
| Kasir | TIDAK | Tidak ada menu |

Berdasarkan `seed_menus.sql`: hanya owner dan admin yang memiliki menu `audit_logs`.

---

## 5. Outlet Scope

**Klasifikasi: OUTLET-SCOPED**

- `audit_logs.outlet_id` menentukan outlet aktivitas.
- Backend memfilter berdasarkan `outlet_id` atau `filter_outlets_for_user`.
- Owner dapat melihat semua outlet.

Sumber: `backend/routes/audit_logs.py` lines 8-50.

---

## 6. Role & Permission

| Aksi | Owner | Admin | Manager | Supervisor | Kasir |
|------|-------|-------|---------|------------|-------|
| View Audit Logs | YA | YA | TIDAK | TIDAK | TIDAK |
| Export | YA | YA | TIDAK | TIDAK | TIDAK |

Backend: `GET /api/audit-logs` → `require_role("owner", "admin")`.

---

## 7. Business Flow

```
OWNER BUKA MENU AUDIT LOGS
 ↓
PILIH OUTLET
 ↓
SET FILTER (user, action, entity, date range)
 ↓
LIHAT DAFTAR AUDIT LOGS
 ↓
[KLIK DETAIL]
 ↓
LIHAT OLD/NEW VALUES
```

---

## 8. Detailed Business Rules

1. Audit logs dicatat oleh `log_action` helper di `backend/routes/audit_logs.py`.
2. Setiap log memiliki: `user_id`, `user_name`, `action`, `entity_type`, `entity_id`, `old_values`, `new_values`, `outlet_id`, `created_at`.
3. Audit logs adalah **read-only** — tidak ada edit/delete.
4. Filter tersedia: by user, action, entity_type, outlet, date range.
5. Pagination: NOT CONFIRMED (kemungkinan limit + offset).
6. **Action values yang tercatat dalam implementasi saat ini**:
   - `SALE_VOIDED` — void sale (entity_type=`sales`, new_value: invoice_no, reason, voided_by)
   - `RECEIPT_REPRINTED` — reprint receipt (entity_type=`sales`, new_value: invoice_no, reprinted_by)
   - `ORDER_CANCELLED` — cancel dine-in order (entity_type=`orders`)
   - `TABLE_MOVED` — move table (entity_type=`orders`, new_value: from_table, to_table, moved_by)
   - `TABLE_MERGED` — merge table (entity_type=`orders`, new_value: source_order, target_order, merged_by)
   - `KDS_STATUS_UPDATE` — KDS status change (entity_type=`kitchen_orders`, new_value: old_status, new_status, updated_by)
   - Plus action values dari module lain: `create`, `update`, `delete`, `approve`, `reject`, dll.

---

## 9. State / Status

Audit logs tidak memiliki state machine.

---

## 10. Technical Architecture

```
[AKSI USER DI MODULE LAIN]
 ↓
log_audit() helper
 ↓
INSERT audit_logs
 ↓
[OWNER/ADMIN VIEW]
 ↓
GET /audit-logs → filter → response
 ↓
UI DISPLAY
```

---

## 11. Technical Flow

### Logging (di module lain)
1. Saat user melakukan aksi (create/update/delete/approve/reject), route handler memanggil `log_audit(db, user, action, entity_type, entity_id, old_values, new_values, outlet_id)`.
2. `log_audit` insert ke `audit_logs` table.

### Viewing
1. `AuditLogs.js` → `GET /api/audit-logs?outlet_id={uuid}&user_id=...&action=...&entity_type=...&start_date=...&end_date=...`.
2. Backend `list_audit_logs` (audit_logs.py L8):
   - Filter by outlet scope.
   - Filter by query params.
   - Order by `created_at` DESC.
3. Response → frontend render table.

---

## 12. Frontend

**File:** `frontend/src/pages/AuditLogs.js`

| Elemen | Detail |
|--------|--------|
| Context | `useOutlet()` — `outletIdForApi` |
| API Calls | `GET /audit-logs?outlet_id=...&...filters` |
| State | `logs`, `filters`, `detail` |
| UI | Filter bar (user, action, entity, date range), log table, detail modal with old/new values JSON |

---

## 13. Backend

**File:** `backend/routes/audit_logs.py`

| Endpoint | Method | Function | Line | Auth |
|----------|--------|----------|------|------|
| `/api/audit-logs` | GET | `list_audit_logs` | L8 | `require_role("owner", "admin")` |

**File:** `backend/utils.py`

| Function | Purpose |
|----------|---------|
| `log_audit` | Helper untuk insert audit log |

---

## 14. API

```
GET /api/audit-logs?outlet_id={uuid}&user_id={uuid}&action={string}&entity_type={string}&start_date={date}&end_date={date}
```

---

## 15. Database

### Table: `audit_logs`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `user_id` | uuid | — | NOT NULL |
| `user_name` | varchar(255) | — | |
| `action` | varchar(50) | — | NOT NULL — create/update/delete/approve/reject/SALE_VOIDED/RECEIPT_REPRINTED/ORDER_CANCELLED/TABLE_MOVED/TABLE_MERGED/KDS_STATUS_UPDATE |
| `entity_type` | varchar(50) | — | NOT NULL — product/sale/orders/kitchen_orders/transfer/etc |
| `entity_id` | varchar(100) | — | |
| `old_values` | jsonb | — | |
| `new_values` | jsonb | — | |
| `outlet_id` | uuid | — | |
| `ip_address` | varchar(50) | — | |
| `user_agent` | text | — | |
| `created_at` | timestamptz | `now()` | |

**Indexes:** `idx_audit_logs_outlet`, `idx_audit_logs_user`, `idx_audit_logs_entity`, `idx_audit_logs_created`

---

## 16. Data Flow

```
USER ACTION (di module lain)
 ↓
log_audit(db, user, action, entity, old, new, outlet_id)
 ↓
INSERT audit_logs
 ↓
[OWNER/ADMIN VIEW]
 ↓
GET /audit-logs?filters
 ↓
BACKEND: filter + paginate
 ↓
RESPONSE
 ↓
UI DISPLAY (table + detail)
```

---

## 17. Validation

- Filter by outlet scope (non-owner).
- `action`, `entity_type` valid values.

---

## 18. Calculation

Tidak ada calculation.

---

## 19. Audit Log

Audit Logs module sendiri adalah audit trail — tidak ada audit log untuk viewing audit logs.

---

## 20. Reports

- Tidak ada report audit logs tersendiri.
- Data dapat di-export via frontend (NOT CONFIRMED).

---

## 21. Integration / Dependency

| Dependency | Keterangan |
|------------|------------|
| Users | `user_id`, `user_name` |
| Outlets | `outlet_id` scope |
| All Modules | Memanggil `log_audit` untuk mencatat aktivitas |

---

## 22. Error Handling

| Kondisi | HTTP | Behavior |
|---------|------|----------|
| Unauthorized | 401/403 | Redirect/blocked |
| No data | 200 | Empty result |

---

## 23. Edge Cases

- Log dengan `old_values`/`new_values` besar → JSONB dapat membesar.
- Log tanpa outlet_id → tidak tampil untuk non-owner.
- Retention policy → NOT CONFIRMED (tidak ada auto-purge).

---

## 24. Security

| Aspek | Status |
|-------|--------|
| Authentication | YA |
| Authorization | YA — `require_role("owner", "admin")` |
| Outlet Enforcement | YA — `filter_outlets_for_user` |
| SQL Injection | Aman — parameterized |
| Immutability | YA — read-only |

---

## 25. QA / Test Cases

```
TC-AUD-001: View audit logs
Given: Owner dengan aktivitas di sistem
When: GET /audit-logs
Then: Semua logs ditampilkan

TC-AUD-002: Filter by action
Given: Logs dengan berbagai action
When: Filter action=create
Then: Hanya log create yang ditampilkan

TC-AUD-003: Outlet scope
Given: Admin outlet A
When: View audit logs
Then: Hanya logs outlet A

TC-AUD-004: Manager cannot view
Given: Manager login
When: GET /audit-logs
Then: 403 Forbidden
```

---

## 26. Current Implementation Status

```
STATUS: IMPLEMENTED
```

Audit log viewing, filter, dan detail berfungsi. `log_audit` helper tersedia.

---

## 27. Bugs / Findings

| ID | Severity | Finding |
|----|----------|---------|
| AUD-F-01 | MEDIUM | Tidak semua module memanggil `log_audit` — beberapa route tidak mencatat audit log (lihat findings di module lain) |
| AUD-F-02 | LOW | Tidak ada retention policy — audit logs dapat membesar tanpa batas |
| AUD-F-03 | LOW | Tidak ada export audit logs feature |

---

## 28. Gaps

| Gap | Keterangan |
|-----|------------|
| Retention policy | Tidak ada auto-purge old logs |
| Export | Tidak ada export audit logs |
| Real-time alert | Tidak ada alert untuk suspicious activity |
| Log integrity | Tidak ada hash/signature untuk tamper detection |

---

## 29. Dependency Map

```
Audit Logs
 ├── Users (user_id, user_name)
 ├── Outlets (outlet_id scope)
 └── All Modules (log_audit helper)
```

---

## 30. End-to-End Flow

```
USER ACTION (di module lain, misal Products)
 ↓
log_audit(db, user, "create", "product", product_id, null, new_values, outlet_id)
 ↓
INSERT audit_logs
 ↓
[OWNER BUKA MENU AUDIT LOGS]
 ↓
GET /audit-logs?outlet_id=...&filters
 ↓
BACKEND: filter + outlet scope
 ↓
RESPONSE (logs list)
 ↓
UI DISPLAY (table + detail modal)
```
