# SCHEDULES (JADWAL KARYAWAN) — BUSINESS & TECHNICAL DOCUMENTATION

> Dokumentasi AS-IS berdasarkan audit source code.
> Source: `frontend/src/pages/Schedules.js`, `backend/routes/schedules.py`, `backend/sql/postgres_schema.sql`

---

## 1. Module Overview

Menu Schedules mengelola jadwal kerja karyawan per outlet: hari, jam masuk, jam keluar, per role. Schedule dapat digunakan untuk deteksi keterlambatan (dengan attendance) dan planning shift.

---

## 2. Business Purpose

Mengatur jadwal kerja karyawan untuk memastikan coverage operasional yang cukup.

---

## 3. Business Objective

- Mencatat jadwal kerja per karyawan per outlet.
- Mengatur jam masuk/keluar per hari.
- Menyediakan data untuk deteksi keterlambatan.
- Menyediakan data untuk planning shift.

---

## 4. Actors / Roles

| Role | Akses | Keterangan |
|------|-------|------------|
| Owner | YA | Semua outlet |
| Admin | YA | Outlet yang di-assign |
| Manager | YA | Outlet yang di-assign |
| Supervisor | TIDAK | NOT CONFIRMED |
| Kasir | TIDAK | Tidak ada menu Schedules |

Berdasarkan `seed_roles.sql`: NOT CONFIRMED — schedules mungkin tidak ada di seed roles.

---

## 5. Outlet Scope

**Klasifikasi: OUTLET-SCOPED**

- `employee_schedules.outlet_id` menentukan outlet.
- Frontend mengirim `outlet_id` via query param.
- Backend memfilter berdasarkan `outlet_id` atau `filter_outlets_for_user`.

Sumber: `backend/routes/schedules.py` lines 8-80.

---

## 6. Role & Permission

| Aksi | Owner | Admin | Manager | Supervisor | Kasir |
|------|-------|-------|---------|------------|-------|
| View | YA | YA | YA | TIDAK | TIDAK |
| Create | YA | YA | YA | TIDAK | TIDAK |
| Update | YA | YA | YA | TIDAK | TIDAK |
| Delete | YA | YA | TIDAK | TIDAK | TIDAK |

Backend: `require_permission("schedules", ...)` (NOT CONFIRMED).

---

## 7. Business Flow

```
MANAGER BUKA MENU SCHEDULES
 ↓
PILIH OUTLET
 ↓
LIHAT JADWAL KARYAWAN
 ↓
[TAMBAH JADWAL]
 ↓
PILIH KARYAWAN + HARI + JAM MASUK + JAM KELUAR
 ↓
SIMPAN
 ↓
JADWAL TERSEDIA
 ↓
[DIGUNAKAN UNTUK DETEKSI KETERLAMBATAN]
```

---

## 8. Detailed Business Rules

1. Schedule per karyawan per hari per outlet.
2. `day_of_week`: 0-6 (Senin-Minggu) atau NOT CONFIRMED format.
3. `start_time`, `end_time`: jam kerja.
4. Satu karyawan dapat memiliki multiple schedule (per hari).
5. Schedule dapat dibandingkan dengan attendance untuk deteksi keterlambatan (NOT CONFIRMED — implementasi).

---

## 9. State / Status

Schedules tidak memiliki state machine.

---

## 10. Technical Architecture

```
Browser → React (Schedules.js) → API → FastAPI (schedules.py) → PostgreSQL (employee_schedules)
```

---

## 11. Technical Flow

1. `Schedules.js` → `GET /api/schedules?outlet_id={uuid}`.
2. Create: `POST /api/schedules` dengan `{ user_id, day_of_week, start_time, end_time, outlet_id }`.
3. Update: `PUT /api/schedules/{id}`.
4. Delete: `DELETE /api/schedules/{id}`.

---

## 12. Frontend

**File:** `frontend/src/pages/Schedules.js`

| Elemen | Detail |
|--------|--------|
| Context | `useOutlet()` — `outletIdForApi` |
| API Calls | `GET /schedules`, `GET /users`, `POST /schedules`, `PUT /schedules/:id`, `DELETE /schedules/:id` |
| State | `schedules`, `users`, `form`, `showForm` |
| UI | Schedule table (karyawan × hari), add/edit modal (user, day, start_time, end_time) |

---

## 13. Backend

**File:** `backend/routes/schedules.py`

| Endpoint | Method | Function | Line | Auth |
|----------|--------|----------|------|------|
| `/api/schedules` | GET | `list_schedules` | L8 | `get_current_user` |
| `/api/schedules` | POST | `create_schedule` | L38 | `require_permission("schedules", "create")` |
| `/api/schedules/{id}` | PUT | `update_schedule` | L54 | `require_permission("schedules", "update")` |
| `/api/schedules/{id}` | DELETE | `delete_schedule` | L70 | `require_permission("schedules", "delete")` |

---

## 14. API

```
GET /api/schedules?outlet_id={uuid}
POST /api/schedules { user_id, day_of_week, start_time, end_time, outlet_id }
PUT /api/schedules/{id} { ...fields }
DELETE /api/schedules/{id}
```

---

## 15. Database

### Table: `employee_schedules`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `user_id` | uuid | — | NOT NULL |
| `user_name` | varchar(255) | — | |
| `outlet_id` | uuid | — | NOT NULL |
| `day_of_week` | integer | — | NOT NULL — 0-6 |
| `start_time` | time | — | NOT NULL |
| `end_time` | time | — | NOT NULL |
| `is_active` | boolean | true | |
| `created_at` | timestamptz | `now()` | |
| `updated_at` | timestamptz | `now()` | |

**Index:** `idx_employee_schedules_outlet` (`outlet_id`, `user_id`)

---

## 16. Data Flow

```
USER INPUT → FRONTEND → API → BACKEND → DB → RESPONSE → UI
 ↓
[DIGUNAKAN OLEH ATTENDANCE] → deteksi keterlambatan (NOT CONFIRMED)
```

---

## 17. Validation

- `user_id`, `day_of_week`, `start_time`, `end_time` NOT NULL.
- `end_time > start_time` (NOT CONFIRMED).

---

## 18. Calculation

### Late Detection (NOT CONFIRMED)
```
if attendance.clock_in_at > schedule.start_time:
    late_minutes = attendance.clock_in_at - schedule.start_time
```

---

## 19. Audit Log

| Action | Entity | Dicatat? |
|--------|--------|----------|
| Create Schedule | `schedule` | NOT CONFIRMED FROM SOURCE |
| Update Schedule | `schedule` | NOT CONFIRMED FROM SOURCE |
| Delete Schedule | `schedule` | NOT CONFIRMED FROM SOURCE |

---

## 20. Reports

- Tidak ada report schedules tersendiri (NOT CONFIRMED).
- Schedule data dapat dianalisa via AI Assistant.

---

## 21. Integration / Dependency

| Dependency | Keterangan |
|------------|------------|
| Users | `user_id` |
| Outlets | `outlet_id` scope |
| Attendance | Late detection (NOT CONFIRMED) |
| Payroll | NOT CONFIRMED — mungkin tidak langsung |

---

## 22. Error Handling

| Kondisi | HTTP | Behavior |
|---------|------|----------|
| Missing required field | 400 | Validation error |
| Unauthorized | 401/403 | Redirect/blocked |

---

## 23. Edge Cases

- Schedule overlap (satu karyawan, satu hari, dua schedule) → NOT CONFIRMED (kemungkinan diperbolehkan).
- Schedule tanpa karyawan → dicegah oleh NOT NULL.
- Schedule untuk hari yang sama dengan jam berbeda → NOT CONFIRMED.

---

## 24. Security

| Aspek | Status |
|-------|--------|
| Authentication | YA |
| Authorization | YA — `require_permission` |
| Outlet Enforcement | YA — `outlet_id` filter |
| SQL Injection | Aman — parameterized |

---

## 25. QA / Test Cases

```
TC-SCH-001: Create schedule
Given: Manager dengan permission create
When: Create schedule (user, day=1, 09:00-17:00)
Then: Schedule created

TC-SCH-002: View per outlet
Given: Outlet A punya 5 schedule, Outlet B punya 3
When: GET /schedules?outlet_id=A
Then: Hanya 5 schedule outlet A
```

---

## 26. Current Implementation Status

```
STATUS: IMPLEMENTED
```

CRUD schedules berfungsi. Late detection NOT CONFIRMED.

---

## 27. Bugs / Findings

| ID | Severity | Finding |
|----|----------|---------|
| SCH-F-01 | MEDIUM | Late detection dengan attendance NOT CONFIRMED — integrasi tidak terlihat eksplisit |
| SCH-F-02 | LOW | Audit logging tidak terlihat eksplisit |

---

## 28. Gaps

| Gap | Keterangan |
|-----|------------|
| Late detection | NOT CONFIRMED — integrasi dengan attendance tidak terlihat |
| Schedule template | Tidak ada template jadwal |
| Auto-generate schedule | Tidak ada auto-generate weekly schedule |
| Schedule report | Tidak ada report jadwal |

---

## 29. Dependency Map

```
Schedules
 ├── Users (user_id)
 ├── Outlets (outlet_id scope)
 ├── Attendance (late detection — NOT CONFIRMED)
 └── Payroll (NOT CONFIRMED)
```

---

## 30. End-to-End Flow

```
MANAGER BUKA MENU SCHEDULES
 ↓
PILIH OUTLET
 ↓
CREATE SCHEDULE (user, day, start_time, end_time)
 ↓
JADWAL TERCATAT
 ↓
[DIGUNAKAN OLEH ATTENDANCE]
 ↓
DETEKSI KETERLAMBATAN (NOT CONFIRMED)
```
