# ATTENDANCE (ABSENSI) — BUSINESS & TECHNICAL DOCUMENTATION

> Dokumentasi AS-IS berdasarkan audit source code.
> Source: `frontend/src/pages/Attendance.js`, `backend/routes/attendance.py`, `backend/sql/postgres_schema.sql`

---

## 1. Module Overview

Menu Attendance (Absensi) mengelola clock-in dan clock-out karyawan per outlet, lengkap dengan foto bukti via webcam, catatan, durasi kerja, dan kaitan dengan shift yang sedang aktif. Data absensi menjadi input untuk perhitungan payroll.

---

## 2. Business Purpose

Mencatat kehadiran karyawan secara digital dengan bukti foto, untuk keperluan operasional, disiplin, dan perhitungan gaji/payroll.

---

## 3. Business Objective

- Mencatat jam masuk dan keluar karyawan.
- Menyimpan bukti foto clock-in/clock-out.
- Menghitung durasi kerja (menit).
- Menghubungkan absensi dengan shift aktif.
- Menyediakan data untuk payroll.

---

## 4. Actors / Roles

| Role | Akses | Keterangan |
|------|-------|------------|
| Owner | YA | Lihat semua outlet |
| Admin | YA | Outlet yang di-assign |
| Manager | YA | Outlet yang di-assign |
| Supervisor | YA | Outlet yang di-assign |
| Kasir | YA | Clock-in/out sendiri, lihat history |

Berdasarkan `seed_roles.sql`: kasir memiliki permission `attendance: view`.

---

## 5. Outlet Scope

**Klasifikasi: OUTLET-SCOPED**

- Setiap absensi terikat ke `attendance.outlet_id`.
- Clock-in menggunakan `body.outlet_id` atau outlet pertama yang di-assign.
- List absensi difilter berdasarkan `outlet_id` atau `filter_outlets_for_user`.
- Owner dapat melihat semua outlet.

Sumber: `backend/routes/attendance.py` lines 8-71, `frontend/src/pages/Attendance.js` lines 89-90.

---

## 6. Role & Permission

| Aksi | Owner | Admin | Manager | Supervisor | Kasir |
|------|-------|-------|---------|------------|-------|
| View Attendance | YA | YA | YA | YA | YA |
| Clock-In | YA | YA | YA | YA | YA |
| Clock-Out | YA | YA | YA | YA | YA |

Backend: semua endpoint menggunakan `get_current_user` (tidak ada `require_permission` khusus untuk attendance).

---

## 7. Business Flow

```
KARYAWAN BUKA MENU ABSENSI
 ↓
CEK ACTIVE ATTENDANCE
 ↓
[Belum clock-in]
 ↓
BUKA WEBCAM
 ↓
AMBIL FOTO
 ↓
TAMBAH CATATAN (opsional)
 ↓
CLOCK-IN
 ↓
STATUS: active
 ↓
[Sudah clock-in, ingin pulang]
 ↓
BUKA WEBCAM
 ↓
AMBIL FOTO
 ↓
TAMBAH CATATAN (opsional)
 ↓
CLOCK-OUT
 ↓
DURASI DIHITUNG
 ↓
STATUS: completed
```

---

## 8. Detailed Business Rules

1. Satu user hanya boleh memiliki satu `active` attendance pada satu waktu.
2. Clock-in memerlukan foto (dari webcam) dan catatan opsional.
3. Clock-out memerlukan foto dan catatan opsional.
4. Saat clock-out, `duration_minutes` dihitung = `clock_out_at - clock_in_at`.
5. Clock-out mencoba link dengan shift yang sedang open (jika ada).
6. `outlet_id` ditentukan dari `body.outlet_id` atau outlet pertama yang di-assign.
7. List absensi menampilkan history dengan join ke `outlets`.

---

## 9. State / Status

```
active  →  completed  (via clock-out)
```

Sumber: `attendance.status` default `'active'` di schema.

---

## 10. Technical Architecture

```
Browser (webcam)
 ↓
React Component (Attendance.js)
 ↓
API Client (lib/api.js)
 ↓
FastAPI Endpoint (routes/attendance.py)
 ↓
Auth (get_current_user)
 ↓
Business Logic
 ↓
SQL Query (raw SQL)
 ↓
PostgreSQL (attendance, shifts)
 ↓
Response
 ↓
UI Update
```

---

## 11. Technical Flow

### Clock-In
1. `Attendance.js` → user klik "Clock In" → buka webcam modal.
2. Foto diambil sebagai base64 → submit dengan `outlet_id` dan `note`.
3. `POST /api/attendance/clock-in` dengan `{ outlet_id, clock_in_photo, clock_in_note }`.
4. Backend `clock_in` (attendance.py L52):
   - Cek apakah user sudah punya active attendance → reject jika ya.
   - Insert `attendance` dengan `clock_in_at = now()`, `status = 'active'`.
5. Response → frontend update state.

### Clock-Out
1. User klik "Clock Out" → buka webcam modal.
2. Foto diambil → submit dengan `note`.
3. `POST /api/attendance/clock-out` dengan `{ clock_out_photo, clock_out_note }`.
4. Backend `clock_out` (attendance.py L71):
   - Cari active attendance untuk user.
   - Set `clock_out_at = now()`.
   - Hitung `duration_minutes = (clock_out_at - clock_in_at) / 60`.
   - Cari open shift untuk user → link `shift_id`.
   - Set `status = 'completed'` (implied).
5. Response → frontend update state.

---

## 12. Frontend

**File:** `frontend/src/pages/Attendance.js`

| Elemen | Detail |
|--------|--------|
| Context | `useAuth()` (`user`), `useOutlet()` (`outletIdForApi`) — lines 89-90 |
| API Calls | `GET /attendance/active`, `GET /attendance?limit=50`, `POST /attendance/clock-in`, `POST /attendance/clock-out` |
| State | `active`, `history`, `cameraMode`, `detail` |
| UI | Clock-in/out button, webcam modal (`useWebcam` hook + `CameraModal`), active attendance card, history table, detail modal |
| Webcam | Local `useWebcam` hook untuk capture foto dari kamera device |

---

## 13. Backend

**File:** `backend/routes/attendance.py`

| Endpoint | Method | Function | Line | Auth |
|----------|--------|----------|------|------|
| `/api/attendance/active` | GET | `active_attendance` | L8 | `get_current_user` |
| `/api/attendance` | GET | `list_attendance` | L14 | `get_current_user` |
| `/api/attendance/clock-in` | POST | `clock_in` | L52 | `get_current_user` |
| `/api/attendance/clock-out` | POST | `clock_out` | L71 | `get_current_user` |

---

## 14. API

```
GET /api/attendance/active?outlet_id={uuid}
GET /api/attendance?limit=50&outlet_id={uuid}
POST /api/attendance/clock-in { outlet_id, clock_in_photo, clock_in_note }
POST /api/attendance/clock-out { clock_out_photo, clock_out_note }
```

---

## 15. Database

### Table: `attendance`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `cashier_id` | uuid | — | User ID |
| `cashier_name` | text | — | |
| `clock_in_at` | timestamptz | — | |
| `clock_in_photo` | text | — | Base64 image |
| `clock_in_note` | text | — | |
| `clock_out_at` | timestamptz | — | |
| `clock_out_photo` | text | — | Base64 image |
| `clock_out_note` | text | — | |
| `duration_minutes` | integer | — | Calculated on clock-out |
| `shift_id` | uuid | — | Link to open shift |
| `status` | text | `'active'` | active / completed |
| `outlet_id` | uuid | — | |

**Index:** `idx_attendance_outlet` (`outlet_id`, `clock_in_at` DESC)

---

## 16. Data Flow

```
USER BUKA WEBCAM
 ↓
CAPTURE FOTO (base64)
 ↓
FRONTEND STATE (photo, note)
 ↓
API: POST /attendance/clock-in
 ↓
BACKEND: cek active attendance
 ↓
INSERT attendance (status=active)
 ↓
[USER CLOCK-OUT]
 ↓
API: POST /attendance/clock-out
 ↓
BACKEND: update clock_out_at, duration_minutes, shift_id
 ↓
STATUS: completed
 ↓
DATA MASUK PAYROLL CALCULATION
```

---

## 17. Validation

- Tidak boleh clock-in jika sudah ada active attendance.
- Tidak boleh clock-out jika tidak ada active attendance.
- Foto: dikirim sebagai base64 string (tidak ada validasi ukuran eksplisit di route).

---

## 18. Calculation

### Duration
```
duration_minutes = (clock_out_at - clock_in_at) in minutes
```

### Payroll Impact
- `attendance_days` di `payroll_items` dihitung dari jumlah attendance records pada periode payroll.
- Sumber: `backend/routes/payroll.py` `process_payroll` (L67).

---

## 19. Audit Log

| Action | Entity | Dicatat? |
|--------|--------|----------|
| Clock-In | `attendance` | NOT CONFIRMED FROM SOURCE |
| Clock-Out | `attendance` | NOT CONFIRMED FROM SOURCE |

> Audit logging untuk attendance tidak terlihat eksplisit di route file.

---

## 20. Reports

- Data absensi masuk ke Payroll calculation (`attendance_days`, `attendance_bonus`).
- Tidak ada report absensi tersendiri di menu Reports.
- AI Assistant dapat query "karyawan terlambat" via `ai_service.py`.

---

## 21. Integration / Dependency

| Dependency | Keterangan |
|------------|------------|
| Users | Karyawan yang clock-in/out |
| Shifts | Clock-out dapat link ke open shift |
| Payroll | `attendance_days` dari data absensi |
| AI Assistant | Query karyawan terlambat |
| Outlets | Absensi per outlet |

---

## 22. Error Handling

| Kondisi | HTTP | Behavior |
|---------|------|----------|
| Sudah active attendance | 400 | "Already clocked in" |
| Tidak ada active attendance | 400 | "No active attendance" |
| Webcam tidak tersedia | — | Frontend error handling |
| 401 | — | Redirect ke login |

---

## 23. Edge Cases

- User clock-in tapi lupa clock-out → attendance tetap `active` tanpa batas waktu.
- Foto base64 besar → bisa membebani database (text column).
- User dengan multiple outlet → clock-in ke outlet pertama atau yang dipilih.
- Clock-out tanpa shift open → `shift_id` = NULL.
- WebRTC/camera permission denied → frontend error.

---

## 24. Security

| Aspek | Status |
|-------|--------|
| Authentication | YA |
| Authorization | `get_current_user` saja — tidak ada `require_permission` |
| Outlet Enforcement | Clock-in menggunakan body.outlet_id, TIDAK divalidasi terhadap `user["outlet_ids"]` — POTENTIAL FINDING |
| SQL Injection | Aman — parameterized |
| Photo Data | Base64 di database — privacy concern |

---

## 25. QA / Test Cases

```
TC-ATT-001: Clock-in normal
Given: User belum punya active attendance
When: Clock-in dengan foto + note
Then: Attendance created, status=active

TC-ATT-002: Double clock-in
Given: User sudah active attendance
When: Clock-in lagi
Then: Error 400

TC-ATT-003: Clock-out
Given: User punya active attendance
When: Clock-out dengan foto + note
Then: duration_minutes calculated, status=completed

TC-ATT-004: Clock-out tanpa active
Given: User tidak punya active attendance
When: Clock-out
Then: Error 400

TC-ATT-005: Clock-out dengan shift open
Given: User punya active attendance + open shift
When: Clock-out
Then: shift_id terlink ke attendance
```

---

## 26. Current Implementation Status

```
STATUS: IMPLEMENTED
```

Clock-in/out dengan webcam, durasi, dan link ke shift berfungsi.

---

## 27. Bugs / Findings

| ID | Severity | Finding |
|----|----------|---------|
| ATT-F-01 | MEDIUM | Clock-in tidak memvalidasi `outlet_id` terhadap `user["outlet_ids"]` — user bisa clock-in ke outlet yang tidak di-assign |
| ATT-F-02 | LOW | Foto disimpan sebagai base64 text di database — dapat membesar dengan cepat |
| ATT-F-03 | LOW | Tidak ada auto-clock-out atau batas waktu — attendance bisa tetap `active` selamanya jika lupa |
| ATT-F-04 | LOW | Audit logging untuk clock-in/out tidak terlihat eksplisit |

---

## 28. Gaps

| Gap | Keterangan |
|-----|------------|
| Geolocation | Tidak ada capture GPS location saat clock-in |
| Late/early detection | Tidak ada perbandingan dengan schedule untuk deteksi terlambat |
| Attendance report | Tidak ada report absensi tersendiri di menu Reports |
| Overtime calculation | Tidak ada perhitungan overtime otomatis dari attendance |

---

## 29. Dependency Map

```
Attendance
 ├── Users (karyawan)
 ├── Shifts (link saat clock-out)
 ├── Payroll (attendance_days input)
 ├── AI Assistant (query keterlambatan)
 └── Outlets (scope)
```

---

## 30. End-to-End Flow

```
KARYAWAN LOGIN
 ↓
BUKA MENU ABSENSI
 ↓
CEK ACTIVE ATTENDANCE (GET /attendance/active)
 ↓
[BELUM CLOCK-IN]
 ↓
BUKA WEBCAM → AMBIL FOTO
 ↓
POST /attendance/clock-in
 ↓
ATTENDANCE: status=active
 ↓
[KERJA]
 ↓
[BUKA ABSENSI LAGI]
 ↓
BUKA WEBCAM → AMBIL FOTO
 ↓
POST /attendance/clock-out
 ↓
DURASI DIHITUNG + SHIFT LINK
 ↓
ATTENDANCE: status=completed
 ↓
DATA MASUK PAYROLL CALCULATION
```
