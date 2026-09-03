# KDS (KITCHEN DISPLAY SYSTEM) — BUSINESS & TECHNICAL DOCUMENTATION

> Dokumentasi AS-IS berdasarkan audit source code.
> Source: `frontend/src/pages/KDS.js`, `backend/routes/kds.py`, `backend/sql/postgres_schema.sql`

---

## 1. Module Overview

Menu KDS (Kitchen Display System) menampilkan order/antrian masak dari dine-in dan POS ke layar dapur. KDS mengelola status item: `new` → `preparing` → `ready` → `served`, dengan filter by outlet, priority setting, dan elapsed time tracking.

Kitchen order ticket dibuat secara otomatis saat sale (POS takeaway) atau checkout (dine-in) berhasil dibuat.

---

## 2. Business Purpose

Mengkoordinasikan dapur dengan kasir/pelayan dengan menampilkan antrian masak secara digital.

---

## 3. Business Objective

- Menampilkan antrian masak real-time.
- Mengelola status item (new, preparing, ready, served).
- Mengurangi mis komunikasi dapur-kasir.
- Melacak waktu masak per item.

---

## 4. Actors / Roles

| Role | Akses | Keterangan |
|------|-------|------------|
| Owner | YA | Semua outlet |
| Admin | YA | Outlet yang di-assign |
| Manager | YA | Outlet yang di-assign |
| Supervisor | YA | Outlet yang di-assign |
| Kasir | TIDAK | Tidak ada menu KDS untuk kasir |

Berdasarkan `seed_roles.sql`: KDS memerlukan permission `kds: view` dan `kds: update`. Update status memerlukan `require_permission("kds", "update")`.

---

## 5. Outlet Scope

**Klasifikasi: OUTLET-SCOPED**

- `kitchen_orders.outlet_id` menentukan outlet.
- Frontend mengirim `outlet_id` via query param.
- Backend memfilter berdasarkan `outlet_id` atau `filter_outlets_for_user`.

Sumber: `backend/routes/kds.py` lines 8-100.

---

## 6. Role & Permission

| Aksi | Owner | Admin | Manager | Supervisor | Kasir |
|------|-------|-------|---------|------------|-------|
| View KDS | YA | YA | YA | YA | TIDAK |
| Update Status | YA | YA | YA | YA | TIDAK |
| Update Priority | YA | YA | YA | YA | TIDAK |

Backend: `get_current_user` untuk list/stats; `require_permission("kds", "update")` untuk status/priority update.

---

## 7. Business Flow

```
[SALE DIBUAT DI POS / CHECKOUT DINE-IN]
 ↓
KITCHEN_ORDER AUTO-CREATED (status: new)
  ├── sale_id, invoice_no, outlet_id terisi
  ├── items: [{name, quantity, note, variant_name}]
  └── dine-in: table_no terisi
 ↓
KDS TAMPILKAN ANTRIAN (GET /kds/orders — default: new + preparing)
 ↓
[DAPUR PILIH ITEM]
 ↓
STATUS: preparing (started_at = NOW())
 ↓
[SELESAI MASAK]
 ↓
STATUS: ready (completed_at = NOW(), elapsed_seconds dihitung)
 ↓
[KASIR/PELAYAN AMBIL]
 ↓
STATUS: served
 ↓
AUDIT LOG: KDS_STATUS_UPDATE
```

---

## 8. Detailed Business Rules

1. Kitchen order dibuat secara otomatis saat sale (POS takeaway) atau checkout (dine-in) berhasil — di-insert ke `kitchen_orders` dengan `status='new'`.
2. Items snapshot berisi: `name`, `quantity`, `note`, `variant_name` per item.
3. Status: `new` → `preparing` → `ready` → `served` (juga: `cancelled`).
4. `started_at` di-set saat status berubah ke `preparing` (hanya jika belum terisi).
5. `completed_at` di-set saat status berubah ke `ready` atau `served`.
6. `elapsed_seconds` dihitung saat status berubah ke `ready`/`served`: `EXTRACT(EPOCH FROM (NOW() - created_at))`.
7. Untuk status `new` dan `preparing`, `elapsed_seconds` dihitung real-time di endpoint list (tidak disimpan ke DB).
8. KDS menampilkan item grouped by order, dengan priority sorting (`priority DESC, created_at ASC`).
9. Default filter: status IN (`new`, `preparing`) — untuk melihat `ready`/`served`, perlu filter eksplisit.
10. Audit log `KDS_STATUS_UPDATE` dicatat setiap perubahan status.

---

## 9. State / Status

```
new  →  preparing  →  ready  →  served
                         ↘ cancelled
```

Valid status values: `new`, `preparing`, `ready`, `served`, `cancelled`.

---

## 10. Technical Architecture

```
Browser → React (KDS.js) → API → FastAPI (kds.py) → PostgreSQL (kitchen_orders)
 ↓
Realtime update (NOT CONFIRMED — polling atau websocket)
```

---

## 11. Technical Flow

### List Kitchen Orders
1. `GET /api/kds/orders?outlet_id={uuid}&status=...`.
2. Backend: filter by outlet + status, order by created_at.

### Update Status
1. `PUT /api/kds/orders/{id}/status` dengan `{ status }`.
2. Backend: update `kitchen_orders.status`, set timestamp fields.

---

## 12. Frontend

**File:** `frontend/src/pages/KDS.js`

| Elemen | Detail |
|--------|--------|
| Context | `useOutlet()` — `outletIdForApi` |
| API Calls | `GET /kds/orders`, `PUT /kds/orders/:id/status` |
| State | `orders`, `filter` (status) |
| UI | Kanban-style board (new, in_progress, ready, served columns), order cards with items, status update buttons |

---

## 13. Backend

**File:** `backend/routes/kds.py`

| Endpoint | Method | Function | Line | Auth |
|----------|--------|----------|------|------|
| `/api/kds/orders` | GET | `list_kds_orders` | L9 | `get_current_user` |
| `/api/kds/orders/{id}/status` | PUT | `update_kds_status` | L58 | `require_permission("kds", "update")` |
| `/api/kds/orders/{id}/priority` | PUT | `update_kds_priority` | L111 | `require_permission("kds", "update")` |
| `/api/kds/stats` | GET | `kds_stats` | L127 | `get_current_user` |

**Auto-creation endpoints (di module lain):**
- `backend/routes/sales.py` `create_sale` → insert `kitchen_orders` setelah sale berhasil
- `backend/routes/orders.py` `checkout_order` → insert `kitchen_orders` setelah dine-in checkout berhasil

---

## 14. API

```
GET /api/kds/orders?outlet_id={uuid}&status={new|preparing|ready|served|cancelled}&limit={int}
PUT /api/kds/orders/{id}/status { status: new|preparing|ready|served|cancelled }
PUT /api/kds/orders/{id}/priority { priority: int }
GET /api/kds/stats?outlet_id={uuid}
```

---

## 15. Database

### Table: `kitchen_orders`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `outlet_id` | uuid | — | Outlet scope |
| `sale_id` | uuid | — | Link to sales |
| `invoice_no` | varchar(100) | — | Invoice reference |
| `table_no` | varchar(50) | — | For dine-in |
| `items` | jsonb | `'[]'` | NOT NULL — items to cook: [{name, quantity, note, variant_name}] |
| `status` | varchar(20) | `'new'` | new/preparing/ready/served/cancelled |
| `priority` | integer | 0 | Sorting priority (higher = first) |
| `assigned_to` | uuid | — | Assigned kitchen staff |
| `created_at` | timestamptz | `NOW()` | |
| `started_at` | timestamptz | — | Set saat preparing |
| `completed_at` | timestamptz | — | Set saat ready/served |
| `elapsed_seconds` | integer | 0 | Dihitung saat ready/served |

**Indexes:** `idx_ko_outlet_status` (`outlet_id`, `status`, `created_at`), `idx_ko_sale` (`sale_id`)

---

## 16. Data Flow

```
[SALE DIBUAT (POS) / CHECKOUT (DINE-IN)]
 ↓
INSERT kitchen_orders (status=new, sale_id, invoice_no, items, outlet_id, table_no)
 ↓
KDS DISPLAY (GET /kds/orders — default: new + preparing)
  ├── elapsed_seconds dihitung real-time untuk new/preparing
  └── sorted by priority DESC, created_at ASC
 ↓
[DAPUR UPDATE STATUS]
 ↓
PUT /kds/orders/{id}/status
  ├── preparing → started_at = NOW()
  ├── ready/served → completed_at = NOW(), elapsed_seconds = EXTRACT(EPOCH FROM (NOW() - created_at))
  └── audit_log: KDS_STATUS_UPDATE
 ↓
[STATS]
 ↓
GET /kds/stats → {new, preparing, ready, served, cancelled, avg_wait}
```

---

## 17. Validation

- `status` valid value (new/in_progress/ready/served).
- Outlet access enforced.

---

## 18. Calculation

### Cooking Time
```
elapsed_seconds = EXTRACT(EPOCH FROM (NOW() - created_at))::int
```
- Untuk status `new`/`preparing`: dihitung real-time di endpoint list (tidak disimpan).
- Untuk status `ready`/`served`: disimpan ke `kitchen_orders.elapsed_seconds` saat status berubah.

### Average Wait Time (stats)
```
avg_wait = AVG(elapsed_seconds) WHERE completed_at IS NOT NULL AND created_at >= CURRENT_DATE
```

---

## 19. Audit Log

| Action | Entity | Dicatat? |
|--------|--------|----------|
| Status Update | `kitchen_order` | YA — `audit_logs` action=`KDS_STATUS_UPDATE` (old_status, new_status, updated_by) |
| Priority Update | `kitchen_order` | Tidak ada audit log eksplisit |
| Auto-creation | `kitchen_order` | Tidak ada audit log eksplisit (kitchen_orders row itu sendiri sebagai record) |

---

## 20. Reports

- Tidak ada report KDS tersendiri (NOT CONFIRMED).
- Cooking time dapat dianalisa (NOT CONFIRMED).

---

## 21. Integration / Dependency

| Dependency | Keterangan |
|------------|------------|
| Sales | `sale_id` + `invoice_no` link; auto-created on sale creation (POS takeaway) |
| Orders/Tables | `table_no` for dine-in; auto-created on dine-in checkout |
| Outlets | `outlet_id` scope |
| Audit Logs | `KDS_STATUS_UPDATE` action dicatat pada status change |

---

## 22. Error Handling

| Kondisi | HTTP | Behavior |
|---------|------|----------|
| Order not found | 404 | "Kitchen order not found" |
| Invalid status | 400 | Validation error |
| Unauthorized | 401/403 | Redirect/blocked |

---

## 23. Edge Cases

- Order dengan banyak item → semua item dalam satu kitchen_order (items JSONB array).
- Status skip (new → ready tanpa preparing) → diperbolehkan; `started_at` tidak di-set jika skip.
- Status skip (new → served) → diperbolehkan; `completed_at` dan `elapsed_seconds` di-set.
- KDS creation gagal → tidak memblokir sale/checkout (try/except pass).
- Priority 0 = normal, priority > 0 = higher priority (sorted first).
- Default list hanya menampilkan `new` + `preparing`; `ready`/`served` perlu filter eksplisit.
- Stats endpoint mengembalikan count per status + avg_wait untuk completed orders hari ini.

---

## 24. Security

| Aspek | Status |
|-------|--------|
| Authentication | YA |
| Authorization | `get_current_user` untuk view; `require_permission("kds", "update")` untuk status/priority update |
| Outlet Enforcement | YA — `outlet_id` filter + per-order outlet check pada status update |
| SQL Injection | Aman — parameterized |
| Audit Trail | YA — `KDS_STATUS_UPDATE` action dicatat ke `audit_logs` |

---

## 25. QA / Test Cases

```
TC-KDS-001: View orders
Given: Outlet dengan kitchen orders
When: GET /kds/orders
Then: Orders ditampilkan per status

TC-KDS-002: Update status
Given: Order dengan status=new
When: Update to in_progress
Then: Status updated, started_at set

TC-KDS-003: Complete flow
Given: Order new
When: new → in_progress → ready → served
Then: Semua timestamp tercatat
```

---

## 26. Current Implementation Status

```
STATUS: IMPLEMENTED
```

KDS display, status update, priority update, stats, auto-creation dari POS/dine-in, elapsed_seconds tracking, audit logging berfungsi. Realtime NOT CONFIRMED.

---

## 27. Bugs / Findings

| ID | Severity | Finding |
|----|----------|---------|
| KDS-F-01 | MEDIUM | Realtime update NOT CONFIRMED — kemungkinan polling manual |
| KDS-F-02 | RESOLVED | Audit logging sekarang aktif — `KDS_STATUS_UPDATE` dicatat ke `audit_logs` |
| KDS-F-03 | LOW | Tidak ada cooking time analytics report tersendiri (stats endpoint ada tapi basic) |
| KDS-F-04 | LOW | Priority update tidak dicatat ke audit log |

---

## 28. Gaps

| Gap | Keterangan |
|-----|------------|
| Realtime update | NOT CONFIRMED — perlu verifikasi websocket/polling |
| Cooking analytics | Stats endpoint ada (avg_wait) tapi tidak ada report historis |
| Item-level status | Status per item (bukan per order) — semua item dalam satu kitchen_order |
| Audio alert | Tidak ada audio alert untuk order baru |

---

## 29. Dependency Map

```
KDS
 ├── Orders/Sales (source)
 ├── Outlets (outlet_id scope)
 ├── Tables (table_id for dine-in)
 └── Dine-In/POS (trigger)
```

---

## 30. End-to-End Flow

```
[SALE/ORDER DIBUAT DI POS/DINE-IN]
 ↓
KITCHEN_ORDER AUTO-CREATED (status=new)
  ├── sale_id, invoice_no, outlet_id
  ├── items: [{name, quantity, note, variant_name}]
  └── table_no (dine-in only)
 ↓
KDS DISPLAY (GET /kds/orders — new + preparing)
 ↓
DAPUR: new → preparing (started_at = NOW())
 ↓
DAPUR: preparing → ready (completed_at = NOW(), elapsed_seconds dihitung)
 ↓
KASIR/PELAYAN: ready → served
 ↓
AUDIT LOG: KDS_STATUS_UPDATE (old_status, new_status, updated_by)
 ↓
STATS: GET /kds/stats (count per status + avg_wait)
```
