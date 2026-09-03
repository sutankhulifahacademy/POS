# LEAVE REQUESTS (CUTI) — BUSINESS & TECHNICAL DOCUMENTATION

> Dokumentasi AS-IS berdasarkan audit source code.
> Source: `frontend/src/pages/LeaveRequests.js`, `backend/routes/leave_requests.py`, `backend/sql/postgres_schema.sql`

---

## 1. Module Overview

Menu Leave Requests mengelola pengajuan cuti karyawan: tanggal mulai/selesai, alasan, status (pending/approved/rejected), dan approval flow. Data cuti dapat mempengaruhi payroll calculation.

---

## 2. Business Purpose

Mengelola pengajuan cuti karyawan secara digital dengan approval flow.

---

## 3. Business Objective

- Mencatat pengajuan cuti karyawan.
- Mengelola approval/rejection cuti.
- Melacak history cuti per karyawan.
- Menyediakan data untuk payroll (cuti dapat mengurangi attendance days).

---

## 4. Actors / Roles

| Role | Akses | Keterangan |
|------|-------|------------|
| Owner | YA | Semua outlet, approve/reject |
| Admin | YA | Outlet yang di-assign, approve/reject |
| Manager | YA | Outlet yang di-assign, approve/reject |
| Supervisor | TIDAK | NOT CONFIRMED |
| Kasir | TIDAK | Tidak ada menu (NOT CONFIRMED — mungkin bisa ajukan sendiri) |

Berdasarkan `seed_roles.sql`: manager memiliki `leave_requests: view, approve`.

---

## 5. Outlet Scope

**Klasifikasi: OUTLET-SCOPED**

- `leave_requests.outlet_id` menentukan outlet.
- Backend memfilter berdasarkan `outlet_id` atau `filter_outlets_for_user`.

Sumber: `backend/routes/leave_requests.py` lines 8-100.

---

## 6. Role & Permission

| Aksi | Owner | Admin | Manager | Supervisor | Kasir |
|------|-------|-------|---------|------------|-------|
| View | YA | YA | YA | TIDAK | TIDAK |
| Create | YA | YA | YA | TIDAK | TIDAK |
| Approve/Reject | YA | YA | YA | TIDAK | TIDAK |

Backend:
- `GET /api/leave-requests` → `get_current_user`
- `POST /api/leave-requests` → `require_permission("leave_requests", "create")`
- `POST /api/leave-requests/{id}/approve` → `require_permission("leave_requests", "approve")`
- `POST /api/leave-requests/{id}/reject` → `require_permission("leave_requests", "approve")`

---

## 7. Business Flow

```
KARYAWAN/MANAGER AJUKAN CUTI
 ↓
ISI: start_date, end_date, reason
 ↓
SUBMIT (status: pending)
 ↓
NOTIFIKASI KE APPROVER
 ↓
APPROVER REVIEW
 ↓
[APPROVE]
 ↓
STATUS: approved
 ↓
[REJECT]
 ↓
STATUS: rejected + reason
 ↓
DATA MASUK PAYROLL (jika approved)
```

---

## 8. Detailed Business Rules

1. `start_date`, `end_date`, `reason` required.
2. `end_date >= start_date`.
3. Status: `pending` → `approved`/`rejected`.
4. Approve/reject mencatat `approved_by`, `approved_at`, `rejection_reason`.
5. Cuti approved dapat mengurangi `attendance_days` di payroll.

---

## 9. State / Status

```
pending  →  approved  (via approve)
pending  →  rejected  (via reject)
```

---

## 10. Technical Architecture

```
Browser → React (LeaveRequests.js) → API → FastAPI (leave_requests.py) → PostgreSQL (leave_requests)
```

---

## 11. Technical Flow

### Create Leave Request
1. `POST /api/leave-requests` dengan `{ user_id, start_date, end_date, reason, outlet_id }`.
2. Backend: insert dengan status `pending`.

### Approve
1. `POST /api/leave-requests/{id}/approve` dengan `{ note }`.
2. Backend: update status=`approved`, `approved_by`, `approved_at`.

### Reject
1. `POST /api/leave-requests/{id}/reject` dengan `{ rejection_reason }`.
2. Backend: update status=`rejected`, `approved_by`, `approved_at`, `rejection_reason`.

### List
1. `GET /api/leave-requests?outlet_id={uuid}` → filter by outlet scope.

---

## 12. Frontend

**File:** `frontend/src/pages/LeaveRequests.js`

| Elemen | Detail |
|--------|--------|
| Context | `useOutlet()` — `outletIdForApi` |
| API Calls | `GET /leave-requests`, `POST /leave-requests`, `POST /leave-requests/:id/approve`, `POST /leave-requests/:id/reject` |
| State | `requests`, `showForm`, `form`, `detail` |
| UI | Request list with status badges, create modal, approve/reject actions |

---

## 13. Backend

**File:** `backend/routes/leave_requests.py`

| Endpoint | Method | Function | Line | Auth |
|----------|--------|----------|------|------|
| `/api/leave-requests` | GET | `list_requests` | L8 | `get_current_user` |
| `/api/leave-requests` | POST | `create_request` | L40 | `require_permission("leave_requests", "create")` |
| `/api/leave-requests/{id}/approve` | POST | `approve_request` | L65 | `require_permission("leave_requests", "approve")` |
| `/api/leave-requests/{id}/reject` | POST | `reject_request` | L85 | `require_permission("leave_requests", "approve")` |

---

## 14. API

```
GET /api/leave-requests?outlet_id={uuid}
POST /api/leave-requests { user_id, start_date, end_date, reason, outlet_id }
POST /api/leave-requests/{id}/approve { note }
POST /api/leave-requests/{id}/reject { rejection_reason }
```

---

## 15. Database

### Table: `leave_requests`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `user_id` | uuid | — | NOT NULL |
| `user_name` | varchar(255) | — | |
| `start_date` | date | — | NOT NULL |
| `end_date` | date | — | NOT NULL |
| `reason` | text | — | NOT NULL |
| `status` | varchar(20) | `'pending'` | pending/approved/rejected |
| `outlet_id` | uuid | — | |
| `approved_by` | uuid | — | |
| `approved_by_name` | varchar(255) | — | |
| `approved_at` | timestamptz | — | |
| `rejection_reason` | text | — | |
| `note` | text | — | |
| `created_at` | timestamptz | `now()` | |

**Index:** `idx_leave_requests_outlet` (`outlet_id`, `created_at` DESC)

---

## 16. Data Flow

```
USER INPUT → FRONTEND → API → BACKEND → DB (leave_requests, status=pending)
 ↓
[APPROVER REVIEW]
 ↓
APPROVE/REJECT → UPDATE status
 ↓
DATA MASUK PAYROLL (jika approved)
```

---

## 17. Validation

- `start_date`, `end_date`, `reason` NOT NULL.
- `end_date >= start_date` (NOT CONFIRMED).

---

## 18. Calculation

### Payroll Impact
```
leave_days = COUNT(leave_requests WHERE status='approved' AND date IN payroll period)
attendance_days = total_workdays - leave_days
```

Sumber: `backend/routes/payroll.py` `process_payroll` (NOT CONFIRMED — kemungkinan dihitung).

---

## 19. Audit Log

| Action | Entity | Dicatat? |
|--------|--------|----------|
| Create Leave Request | `leave_request` | NOT CONFIRMED FROM SOURCE |
| Approve Leave Request | `leave_request` | NOT CONFIRMED FROM SOURCE |
| Reject Leave Request | `leave_request` | NOT CONFIRMED FROM SOURCE |

---

## 20. Reports

- Tidak ada report leave requests tersendiri.
- Data masuk ke Payroll calculation.

---

## 21. Integration / Dependency

| Dependency | Keterangan |
|------------|------------|
| Users | `user_id` |
| Outlets | `outlet_id` scope |
| Payroll | Leave days impact attendance |
| Attendance | Cuti dapat mengurangi attendance days |

---

## 22. Error Handling

| Kondisi | HTTP | Behavior |
|---------|------|----------|
| Missing required field | 400 | Validation error |
| Unauthorized | 401/403 | Redirect/blocked |

---

## 23. Edge Cases

- Cuti bersama multiple karyawan → masing-masing ajukan sendiri.
- Cuti yang overlap dengan periode payroll → dapat mempengaruhi payroll periode tersebut.
- Reject tanpa reason → NOT CONFIRMED (kemungkinan diperbolehkan).

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
TC-LV-001: Create leave request
Given: Manager dengan permission create
When: Ajukan cuti 3 hari
Then: Request created, status=pending

TC-LV-002: Approve
Given: Pending request
When: Owner approve
Then: Status=approved, approved_by set

TC-LV-003: Reject
Given: Pending request
When: Owner reject dengan reason
Then: Status=rejected, rejection_reason set
```

---

## 26. Current Implementation Status

```
STATUS: IMPLEMENTED
```

Create, approve, reject, list berfungsi.

---

## 27. Bugs / Findings

| ID | Severity | Finding |
|----|----------|---------|
| LV-F-01 | LOW | Audit logging tidak terlihat eksplisit |
| LV-F-02 | LOW | Tidak ada notifikasi ke karyawan saat approve/reject |

---

## 28. Gaps

| Gap | Keterangan |
|-----|------------|
| Leave balance | Tidak ada tracking sisa cuti per karyawan |
| Leave types | Tidak ada tipe cuti (tahunan, sakit, dll) |
| Calendar view | Tidak ada kalender cuti |
| Auto-notification | Tidak ada notifikasi otomatis |

---

## 29. Dependency Map

```
Leave Requests
 ├── Users (user_id)
 ├── Outlets (outlet_id scope)
 ├── Payroll (leave_days impact)
 └── Attendance (cuti vs hadir)
```

---

## 30. End-to-End Flow

```
KARYAWAN/MANAGER AJUKAN CUTI
 ↓
CREATE REQUEST (start_date, end_date, reason)
 ↓
STATUS: pending
 ↓
NOTIFIKASI KE APPROVER
 ↓
APPROVER REVIEW
 ↓
[APPROVE] → status=approved
[REJECT] → status=rejected + reason
 ↓
DATA MASUK PAYROLL (leave_days calculation)
```
