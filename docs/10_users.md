# USERS (KARYAWAN) — BUSINESS & TECHNICAL DOCUMENTATION

> Dokumentasi AS-IS berdasarkan audit source code.
> Source: `frontend/src/pages/Karyawan.js`, `backend/routes/users.py`, `backend/sql/postgres_schema.sql`

---

## 1. Module Overview

Menu Users (Karyawan) mengelola master data user/karyawan: email, nama, role, password, telepon, alamat, job title, foto, KTP, outlet assignment, dan primary outlet. Users adalah module global dengan outlet assignment via `user_outlet_access`.

---

## 2. Business Purpose

Mengelola akun pengguna sistem POS, role, dan akses outlet. Setiap karyawan memiliki satu role dan dapat di-assign ke satu atau multiple outlet.

---

## 3. Business Objective

- Mencatat data karyawan.
- Mengatur role (owner, admin, manager, supervisor, kasir).
- Mengatur akses outlet per user.
- Menentukan primary outlet.
- Reset password karyawan.

---

## 4. Actors / Roles

| Role | Akses | Keterangan |
|------|-------|------------|
| Owner | YA | Full CRUD + reset password |
| Admin | YA | Full CRUD (NOT CONFIRMED) |
| Manager | TIDAK | Tidak ada menu Users |
| Supervisor | TIDAK | Tidak ada menu |
| Kasir | TIDAK | Tidak ada menu |

Berdasarkan `seed_menus.sql`: manager tidak memiliki menu `users` (Karyawan). Hanya owner dan admin yang memiliki menu users.

---

## 5. Outlet Scope

**Klasifikasi: HYBRID (Global user + Outlet assignment)**

- `users` table tidak memiliki `outlet_id` — data user global.
- `user_outlet_access` table menghubungkan user ke outlet.
- Frontend `Karyawan.js` mengirim `outlet_id` untuk filter list.
- User dapat di-assign ke multiple outlet dengan satu primary outlet.

---

## 6. Role & Permission

| Aksi | Owner | Admin | Manager | Supervisor | Kasir |
|------|-------|-------|---------|------------|-------|
| View Users | YA | YA | TIDAK | TIDAK | TIDAK |
| Create User | YA | YA | TIDAK | TIDAK | TIDAK |
| Update User | YA | YA | TIDAK | TIDAK | TIDAK |
| Delete User | YA | YA | TIDAK | TIDAK | TIDAK |
| Reset Password | YA | YA | TIDAK | TIDAK | TIDAK |
| Assign Outlets | YA | YA | TIDAK | TIDAK | TIDAK |

> Detail permission per action: NOT CONFIRMED FROM SOURCE (users route tidak diaudit secara detail, tapi berdasarkan pola sistem, owner/admin memiliki akses penuh).

---

## 7. Business Flow

```
OWNER/ADMIN BUKA MENU KARYAWAN
 ↓
LIHAT DAFTAR KARYAWAN
 ↓
[TAMBAH KARYAWAN]
 ↓
ISI: email, nama, role, password, telepon, alamat, job title
 ↓
UPLOAD FOTO + KTP
 ↓
ASSIGN OUTLET (pilih multiple outlet)
 ↓
SET PRIMARY OUTLET
 ↓
SIMPAN
 ↓
[RESET PASSWORD]
 ↓
[EDIT KARYAWAN]
 ↓
[DELETE KARYAWAN]
```

---

## 8. Detailed Business Rules

1. `email` harus unik (DB UNIQUE constraint).
2. `role` harus salah satu dari: `owner`, `admin`, `manager`, `supervisor`, `kasir` (Pydantic `UserRole` Literal).
3. Password di-hash menggunakan bcrypt.
4. User dapat di-assign ke multiple outlet via `user_outlet_access`.
5. Satu outlet dapat di-set sebagai `is_primary`.
6. `is_active` = true/false — user non-aktif tidak bisa login.
7. Reset password: generate new password, hash dengan bcrypt.

---

## 9. State / Status

```
is_active: true  ↔  false
```

---

## 10. Technical Architecture

```
Browser → React (Karyawan.js) → API → FastAPI (users.py) → PostgreSQL (users, user_outlet_access)
```

---

## 11. Technical Flow

### Create User
1. `Karyawan.js` → user isi form + pilih outlet + upload foto/KTP.
2. `POST /api/users?outlet_id={uuid}` dengan `{ email, name, role, password, phone, address, job_title, photo, ktp_image, ktp_number, outlet_ids, primary_outlet_id }`.
3. Backend:
   - Hash password dengan bcrypt.
   - Insert ke `users`.
   - Insert ke `user_outlet_access` untuk setiap outlet_id.
   - Set `is_primary=true` untuk primary_outlet_id.
4. Response → frontend reload.

### Update User
1. `PUT /api/users/{id}?outlet_id={uuid}` dengan field yang diubah.
2. Backend: update `users` + update `user_outlet_access` (delete + insert).

### Reset Password
1. `POST /api/users/{id}/reset-password` dengan `{ new_password }`.
2. Backend: hash new password, update `users.password_hash`.

### Delete User
1. `DELETE /api/users/{id}`.
2. Backend: delete dari `users` (cascade ke `user_outlet_access`? — NOT CONFIRMED).

---

## 12. Frontend

**File:** `frontend/src/pages/Karyawan.js` (mounted at `/users`)

| Elemen | Detail |
|--------|--------|
| Context | `useAuth()` (`currentUser`), `useOutlet()` (`outletIdForApi`) — lines 41-42 |
| API Calls | `GET /users?outlet_id=...`, `GET /outlets`, `GET /users/:id`, `PUT /users/:id`, `POST /users`, `POST /users/:id/reset-password`, `DELETE /users/:id`, `GET /users/:userId` (KTP image) |
| State | `users`, `outlets`, `showForm`, `form`, `editing`, `resetting`, `newPass`, `detail`, `userId` |
| UI | Employee table, add/edit modal (name, email, role, phone, address, job title, photo, KTP image + number, outlet toggles, primary outlet, initial password), reset-password modal, detail/KTP modal |

> **Note:** `frontend/src/pages/Users.js` juga ada tapi **TIDAK** di-route di `App.js`. `Karyawan.js` adalah implementasi aktif untuk `/users`.

---

## 13. Backend

**File:** `backend/routes/users.py`

| Endpoint | Method | Function | Auth |
|----------|--------|----------|------|
| `/api/users` | GET | `list_users` | NOT CONFIRMED (likely `get_current_user` or `require_permission`) |
| `/api/users/{id}` | GET | `get_user` | NOT CONFIRMED |
| `/api/users` | POST | `create_user` | NOT CONFIRMED (likely `require_permission("users", "create")`) |
| `/api/users/{id}` | PUT | `update_user` | NOT CONFIRMED |
| `/api/users/{id}/reset-password` | POST | `reset_password` | NOT CONFIRMED |
| `/api/users/{id}` | DELETE | `delete_user` | NOT CONFIRMED |

> Users route tidak diaudit secara detail oleh subagent. Endpoint dan auth pattern berdasarkan frontend API calls dan pola sistem.

---

## 14. API

```
GET /api/users?outlet_id={uuid}
GET /api/users/{id}
POST /api/users?outlet_id={uuid} { email, name, role, password, ... }
PUT /api/users/{id}?outlet_id={uuid} { ...fields }
POST /api/users/{id}/reset-password { new_password }
DELETE /api/users/{id}
```

---

## 15. Database

### Table: `users`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `email` | varchar(255) | — | UNIQUE, NOT NULL |
| `name` | varchar(255) | — | NOT NULL |
| `role` | varchar(20) | — | NOT NULL — owner/admin/manager/supervisor/kasir |
| `password_hash` | text | — | NOT NULL — bcrypt hash |
| `is_active` | boolean | true | |
| `created_at` | timestamptz | `now()` | |
| `updated_at` | timestamptz | — | |
| `phone` | varchar(50) | — | |
| `address` | text | — | |
| `job_title` | varchar(100) | — | |
| `photo` | text | — | Base64 or URL |
| `ktp_image` | text | — | Base64 or URL |
| `ktp_number` | varchar(100) | — | |

**Index:** `idx_users_email` (`email`)

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
users (1) ─── (many) user_outlet_access ─── (1) outlets
```

---

## 16. Data Flow

```
OWNER INPUT (form karyawan + outlet assignment)
 ↓
FRONTEND STATE
 ↓
[UPLOAD FOTO/KTP] → POST /uploads
 ↓
API: POST /users
 ↓
BACKEND: hash password
 ↓
INSERT users
 ↓
INSERT user_outlet_access (per outlet)
 ↓
SET is_primary untuk primary_outlet_id
 ↓
RESPONSE
 ↓
FRONTEND RELOAD
```

---

## 17. Validation

- `email` unik (DB constraint + backend check).
- `role` harus valid Literal.
- `password` required saat create.
- `name` NOT NULL.

---

## 18. Calculation

Tidak ada calculation di Users module.

---

## 19. Audit Log

| Action | Entity | Dicatat? |
|--------|--------|----------|
| Create User | `user` | NOT CONFIRMED FROM SOURCE |
| Update User | `user` | NOT CONFIRMED FROM SOURCE |
| Delete User | `user` | NOT CONFIRMED FROM SOURCE |
| Reset Password | `user` | NOT CONFIRMED FROM SOURCE |

---

## 20. Reports

- User data masuk ke: Payroll (per employee), Schedules (per employee), Attendance (per employee).
- Tidak ada report user tersendiri.

---

## 21. Integration / Dependency

| Dependency | Keterangan |
|------------|------------|
| Outlets | Outlet assignment via `user_outlet_access` |
| Roles | Role menentukan permission |
| Auth | Login menggunakan `users` table |
| Attendance | `attendance.cashier_id` = `users.id` |
| Shifts | `shifts.cashier_id` = `users.id` |
| Sales | `sales.cashier_id` = `users.id` |
| Payroll | `payroll_items.user_id` = `users.id` |
| Schedules | `employee_schedules.user_id` = `users.id` |
| Leave Requests | `leave_requests.user_id` = `users.id` |
| Audit Logs | `audit_logs.user_id` = `users.id` |

---

## 22. Error Handling

| Kondisi | HTTP | Behavior |
|---------|------|----------|
| Email duplicate | 400 | "Email already exists" |
| Invalid role | 422 | Pydantic validation error |
| User not found | 404 | "User not found" |
| Unauthorized | 401/403 | Redirect/blocked |

---

## 23. Edge Cases

- User tanpa outlet assignment → `outlet_ids = []` → tidak bisa akses data outlet-scoped.
- Owner role → `outlet_ids = []` berarti semua outlet.
- User dihapus → data referensi (attendance, shifts, sales) tetap ada (no FK cascade).
- Multiple user dengan email sama → dicegah oleh UNIQUE constraint.
- Reset password saat user non-aktif → NOT CONFIRMED.

---

## 24. Security

| Aspek | Status |
|-------|--------|
| Authentication | YA |
| Authorization | NOT CONFIRMED — kemungkinan `require_permission("users", ...)` |
| Password Hashing | YA — bcrypt |
| Outlet Enforcement | Outlet assignment via `user_outlet_access` |
| SQL Injection | Aman — parameterized |
| Sensitive Data | `password_hash` di DB, `ktp_image`/`ktp_number` — privacy concern |

---

## 25. QA / Test Cases

```
TC-USR-001: Create karyawan
Given: Owner login
When: Create user dengan role kasir + 2 outlet
Then: User created, outlet access tercatat

TC-USR-002: Email duplicate
Given: User dengan email "a@b.com" exists
When: Create user baru dengan email "a@b.com"
Then: Error 400

TC-USR-003: Reset password
Given: User exists
When: Reset password
Then: password_hash updated

TC-USR-004: Assign multiple outlet
Given: User dengan 1 outlet
When: Update user, tambah outlet B
Then: user_outlet_access updated

TC-USR-005: Set primary outlet
Given: User dengan 2 outlet
When: Set outlet B sebagai primary
Then: is_primary=true untuk outlet B, false untuk outlet A
```

---

## 26. Current Implementation Status

```
STATUS: IMPLEMENTED
```

CRUD user, outlet assignment, reset password berfungsi.

---

## 27. Bugs / Findings

| ID | Severity | Finding |
|----|----------|---------|
| USR-F-01 | LOW | `Users.js` (legacy) masih ada di repo tapi tidak di-route — dapat menyebabkan kebingungan |
| USR-F-02 | LOW | Audit logging untuk user CRUD tidak terlihat eksplisit |
| USR-F-03 | LOW | KTP image disimpan sebagai base64/URL — privacy concern jika base64 |

---

## 28. Gaps

| Gap | Keterangan |
|-----|------------|
| User self-service | User tidak bisa update profil sendiri |
| Password change by user | Tidak ada fitur user ganti password sendiri (hanya admin reset) |
| User activity log | Tidak ada tracking aktivitas per user (selain audit_logs) |
| Email verification | Tidak ada verifikasi email |

---

## 29. Dependency Map

```
Users
 ├── Outlets (outlet assignment via user_outlet_access)
 ├── Roles (role menentukan permission)
 ├── Auth (login)
 ├── Attendance (cashier_id)
 ├── Shifts (cashier_id)
 ├── Sales (cashier_id)
 ├── Payroll (user_id)
 ├── Schedules (user_id)
 ├── Leave Requests (user_id)
 └── Audit Logs (user_id)
```

---

## 30. End-to-End Flow

```
OWNER BUKA MENU KARYAWAN
 ↓
CREATE USER (email, name, role, password)
 ↓
UPLOAD FOTO + KTP
 ↓
ASSIGN OUTLET (multiple)
 ↓
SET PRIMARY OUTLET
 ↓
POST /users
 ↓
HASH PASSWORD (bcrypt)
 ↓
INSERT users + user_outlet_access
 ↓
USER TERSEDIA
 ↓
USER LOGIN → OUTLET CONTEXT LOADED
 ↓
PERMISSION DITERAPKAN BERDASARKAN ROLE
 ↓
OUTLET SCOPE DITERAPKAN BERDASARKAN user_outlet_access
```
