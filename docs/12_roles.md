# ROLES (ROLE & AKSES) — BUSINESS & TECHNICAL DOCUMENTATION

> Dokumentasi AS-IS berdasarkan audit source code.
> Source: `frontend/src/pages/Roles.js`, `backend/routes/roles.py`, `backend/routes/menus.py`, `backend/sql/seed_roles.sql`, `backend/sql/seed_menus.sql`, `backend/sql/postgres_schema.sql`

---

## 1. Module Overview

Menu Roles mengelola role, permission, dan menu visibility. Sistem menggunakan dual-layer access control: `role_permissions` (module/action authorization) dan `role_menus` (sidebar visibility). Owner dapat membuat custom role, mengatur permission per module/action, dan mengatur menu visibility per role.

---

## 2. Business Purpose

Mengontrol akses pengguna ke module dan menu sistem berdasarkan role. Memastikan setiap role hanya dapat mengakses fitur yang sesuai dengan tanggung jawabnya.

---

## 3. Business Objective

- Mengelola role (system & custom).
- Mengatur permission per module/action per role.
- Mengatur menu visibility per role.
- Menyediakan permission tree dinamis dari `menus` table.
- Mencegah unauthorized access.

---

## 4. Actors / Roles

| Role | Akses | Keterangan |
|------|-------|------------|
| Owner | YA | Full management — satu-satunya yang bisa kelola role |
| Admin | TIDAK | Tidak bisa kelola role (route: `require_role("owner")`) |
| Manager | TIDAK | Tidak ada menu Roles |
| Supervisor | TIDAK | Tidak ada menu |
| Kasir | TIDAK | Tidak ada menu |

Berdasarkan `seed_menus.sql`: hanya owner dan admin yang memiliki menu `roles`. Backend: `require_role("owner")` untuk semua CUD.

---

## 5. Outlet Scope

**Klasifikasi: GLOBAL**

- `roles`, `role_permissions`, `menus`, `role_menus` tidak memiliki `outlet_id`.
- Role dan permission bersifat global — berlaku untuk semua outlet.
- Outlet access diatur terpisah via `user_outlet_access` (di Users module).

---

## 6. Role & Permission

| Aksi | Owner | Admin | Manager | Supervisor | Kasir |
|------|-------|-------|---------|------------|-------|
| View Roles | YA | TIDAK | TIDAK | TIDAK | TIDAK |
| Create Role | YA | TIDAK | TIDAK | TIDAK | TIDAK |
| Update Role | YA | TIDAK | TIDAK | TIDAK | TIDAK |
| Delete Role | YA | TIDAK | TIDAK | TIDAK | TIDAK |
| Update Permissions | YA | TIDAK | TIDAK | TIDAK | TIDAK |
| Update Menu Visibility | YA | TIDAK | TIDAK | TIDAK | TIDAK |
| Manage Menus | YA | TIDAK | TIDAK | TIDAK | TIDAK |

Backend: semua CUD menggunakan `require_role("owner")`.

---

## 7. Business Flow

```
OWNER BUKA MENU ROLE & AKSES
 ↓
LIHAT DAFTAR ROLE
 ↓
[PILIH ROLE]
 ↓
LIHAT PERMISSION TREE
 ↓
[EDIT PERMISSION]
 ↓
CHECK/UNCHECK MODULE.ACTION
 ↓
SIMPAN
 ↓
[EDIT MENU VISIBILITY]
 ↓
CHECK/UNCHECK MENU
 ↓
SIMPAN
 ↓
[CREATE CUSTOM ROLE]
 ↓
[DELETE CUSTOM ROLE]
```

---

## 8. Detailed Business Rules

1. System roles (`is_system=true`) tidak dapat dihapus atau dinonaktifkan.
2. Custom roles dapat dibuat oleh owner.
3. Role tidak dapat dihapus jika masih ada user yang menggunakan role tersebut.
4. Permission tree diambil dinamis dari `menus` table (`menus.actions` JSONB).
5. `role_permissions` menyimpan `{role_id, module, action, granted}`.
6. `role_menus` menyimpan `{role_id, menu_id, is_visible}`.
7. Update permissions: delete all existing + insert new (replace strategy).
8. Update menu visibility: delete all existing + insert new (replace strategy).
9. Owner bypasses all `require_permission` checks di backend.
10. Role name di-normalize: `strip().lower().replace(" ", "_")`.

---

## 9. State / Status

```
is_active: true  ↔  false  (system role tidak bisa false)
is_system: true (immutable) / false (custom)
```

---

## 10. Technical Architecture

```
Browser → React (Roles.js) → API → FastAPI (roles.py, menus.py) → PostgreSQL (roles, role_permissions, menus, role_menus)
```

---

## 11. Technical Flow

### List Roles
1. `Roles.js` → `GET /api/roles` → backend `list_roles` (roles.py).
2. Returns roles dengan permissions grouped by module.

### Permission Tree
1. `GET /api/roles/permission-tree` → backend `get_permission_tree`.
2. Query `menus` table untuk module/action definitions.
3. Returns `[{ module, label, actions }]`.

### Update Permissions
1. `PUT /api/roles/{role_id}/permissions` dengan `{ permissions: [{module, action, granted}] }`.
2. Backend `update_role_permissions`:
   - Delete existing `role_permissions` for role.
   - Insert new permissions.
3. Response → updated role.

### Update Menu Visibility
1. `PUT /api/menus/role/{role_id}` dengan `{ menus: [{menu_id, is_visible}] }`.
2. Backend `update_role_menus`:
   - Delete existing `role_menus` for role.
   - Insert new menu visibility.
3. Response → updated role menus.

### Create Custom Role
1. `POST /api/roles` dengan `{ name, label, description }`.
2. Backend `create_role`:
   - Normalize name.
   - Check uniqueness.
   - Insert ke `roles` dengan `is_system=false`.

### Delete Custom Role
1. `DELETE /api/roles/{role_id}`.
2. Backend `delete_role`:
   - Check `is_system` → reject if true.
   - Check users count → reject if >0.
   - Delete `role_permissions` + `roles`.

---

## 12. Frontend

**File:** `frontend/src/pages/Roles.js`

| Elemen | Detail |
|--------|--------|
| Context | `useAuth()` (`user`) — line 319 |
| API Calls | `GET /roles`, `GET /roles/permission-tree`, `GET /menus/role/:roleId`, `GET /menus`, `PUT /roles/:id/permissions`, `PUT /menus/role/:id`, `POST /menus`, `PUT /menus/:id`, `DELETE /menus/:id`, `POST /roles`, `PUT /roles/:id`, `DELETE /roles/:id` |
| State | `roles`, `selected`, `permissionTree`, `menuItems`, `menuEditor`, `roleForm` |
| UI | Role list, permission checkbox tree (module → action), menu visibility editor, create/edit/delete role dialog, menu management dialog |

---

## 13. Backend

**File:** `backend/routes/roles.py`

| Endpoint | Method | Function | Auth |
|----------|--------|----------|------|
| `/api/roles/permission-tree` | GET | `get_permission_tree` | `get_current_user` |
| `/api/roles` | GET | `list_roles` | `require_role("owner")` |
| `/api/roles/my-permissions` | GET | `get_my_permissions` | `get_current_user` |
| `/api/roles/{role_id}` | GET | `get_role` | `get_current_user` |
| `/api/roles` | POST | `create_role` | `require_role("owner")` |
| `/api/roles/{role_id}` | PUT | `update_role` | `require_role("owner")` |
| `/api/roles/{role_id}/permissions` | PUT | `update_role_permissions` | `require_role("owner")` |
| `/api/roles/{role_id}` | DELETE | `delete_role` | `require_role("owner")` |

**File:** `backend/routes/menus.py`

| Endpoint | Method | Function | Auth |
|----------|--------|----------|------|
| `/api/menus` | GET | `list_menus` | `get_current_user` |
| `/api/menus` | POST | `create_menu` | `require_permission("roles", "manage")` |
| `/api/menus/{menu_id}` | PUT | `update_menu` | `require_permission("roles", "manage")` |
| `/api/menus/{menu_id}` | DELETE | `delete_menu` | `require_permission("roles", "manage")` |
| `/api/menus/my-menus` | GET | `get_my_menus` | `get_current_user` |
| `/api/menus/role/{role_id}` | GET | `get_role_menus` | `require_permission("roles", "manage")` |
| `/api/menus/role/{role_id}` | PUT | `update_role_menus` | `require_permission("roles", "manage")` |

---

## 14. API

```
GET /api/roles/permission-tree
GET /api/roles
GET /api/roles/my-permissions
GET /api/roles/{id}
POST /api/roles { name, label, description }
PUT /api/roles/{id} { label, description, is_active }
PUT /api/roles/{id}/permissions { permissions: [{module, action, granted}] }
DELETE /api/roles/{id}

GET /api/menus
POST /api/menus { name, label, route, icon, sort_order, actions }
PUT /api/menus/{id}
DELETE /api/menus/{id}
GET /api/menus/my-menus
GET /api/menus/role/{role_id}
PUT /api/menus/role/{role_id} { menus: [{menu_id, is_visible}] }
```

---

## 15. Database

### Table: `roles`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `name` | varchar(50) | — | UNIQUE, NOT NULL |
| `label` | varchar(100) | — | NOT NULL |
| `description` | text | — | |
| `is_system` | boolean | false | System role = immutable |
| `is_active` | boolean | true | |
| `created_at` | timestamptz | `now()` | |
| `updated_at` | timestamptz | `now()` | |

### Table: `role_permissions`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `role_id` | uuid FK | — | → `roles(id)` ON DELETE CASCADE |
| `module` | varchar(50) | — | NOT NULL |
| `action` | varchar(20) | — | NOT NULL |
| `granted` | boolean | true | |
| `created_at` | timestamptz | `now()` | |

**Constraint:** UNIQUE (`role_id`, `module`, `action`)

### Table: `menus`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `name` | varchar(50) | — | UNIQUE, NOT NULL |
| `label` | varchar(100) | — | NOT NULL |
| `description` | text | — | |
| `route` | varchar(100) | — | NOT NULL |
| `icon` | varchar(50) | `'Circle'` | |
| `sort_order` | integer | 0 | |
| `parent_id` | uuid FK | — | → `menus(id)` ON DELETE SET NULL |
| `is_active` | boolean | true | |
| `actions` | jsonb | `'["view"]'` | Array of action names |
| `created_at` | timestamptz | `now()` | |
| `updated_at` | timestamptz | `now()` | |

### Table: `role_menus`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `role_id` | uuid FK | — | → `roles(id)` ON DELETE CASCADE |
| `menu_id` | uuid FK | — | → `menus(id)` ON DELETE CASCADE |
| `is_visible` | boolean | true | |
| `created_at` | timestamptz | `now()` | |

**Constraint:** UNIQUE (`role_id`, `menu_id`)

**Relationship:**
```
roles (1) ─── (many) role_permissions
roles (1) ─── (many) role_menus ─── (1) menus
menus (1) ─── (0..1) menus (parent_id self-reference)
```

---

## 16. Data Flow

```
OWNER PILIH ROLE
 ↓
GET /roles/{id} → role detail + permissions
 ↓
GET /roles/permission-tree → available modules/actions
 ↓
[EDIT PERMISSIONS]
 ↓
PUT /roles/{id}/permissions
 ↓
DELETE existing role_permissions + INSERT new
 ↓
[EDIT MENU VISIBILITY]
 ↓
GET /menus/role/{id} → current visibility
 ↓
PUT /menus/role/{id}
 ↓
DELETE existing role_menus + INSERT new
 ↓
PERMISSION & VISIBILITY UPDATED
 ↓
USER DENGAN ROLE TERSEBUT AKAN MELIHAT PERUBAHAN SAAT RELOAD
```

---

## 17. Validation

- Role name unik (DB + backend check).
- System role tidak bisa dihapus/dinonaktifkan.
- Role dengan user aktif tidak bisa dihapus.
- Menu name unik.

---

## 18. Calculation

Tidak ada calculation.

---

## 19. Audit Log

| Action | Entity | Dicatat? |
|--------|--------|----------|
| Create Role | `role` | NOT CONFIRMED FROM SOURCE |
| Update Role | `role` | NOT CONFIRMED FROM SOURCE |
| Delete Role | `role` | NOT CONFIRMED FROM SOURCE |
| Update Permissions | `role_permission` | NOT CONFIRMED FROM SOURCE |
| Update Menu Visibility | `role_menu` | NOT CONFIRMED FROM SOURCE |
| Create/Update/Delete Menu | `menu` | NOT CONFIRMED FROM SOURCE |

---

## 20. Reports

- Role dan permission tidak masuk ke report bisnis.
- Audit log dapat melacak perubahan role/permission (jika dicatat).

---

## 21. Integration / Dependency

| Dependency | Keterangan |
|------------|------------|
| Users | `users.role` = `roles.name` |
| Auth | `require_permission` query `role_permissions` |
| Menus | `role_menus` untuk sidebar visibility |
| All Modules | Permission check via `require_permission(module, action)` |

---

## 22. Error Handling

| Kondisi | HTTP | Behavior |
|---------|------|----------|
| Non-owner access | 403 | "Forbidden" |
| Role name exists | 400 | "Role name already exists" |
| Delete system role | 400 | "Cannot delete system role" |
| Delete role with users | 400 | "Cannot delete: N user(s) still assigned" |
| Role not found | 404 | "Role not found" |

---

## 23. Edge Cases

- Owner bypasses all permission checks — owner tidak terpengaruh `role_permissions`.
- Custom role tanpa permission → user tidak bisa akses apa pun (kecuali `/pos` yang tidak di-guard `canAccess`).
- Menu dihapus → `role_menus` CASCADE delete.
- Role dihapus → `role_permissions` dan `role_menus` CASCADE delete.
- User dengan role yang dihapus → NOT CONFIRMED (dicegah oleh user count check).

---

## 24. Security

| Aspek | Status |
|-------|--------|
| Authentication | YA |
| Authorization | YA — `require_role("owner")` |
| Outlet Enforcement | TIDAK — global |
| SQL Injection | Aman — parameterized |
| Privilege Escalation | Owner bypass adalah by design |

---

## 25. QA / Test Cases

```
TC-ROL-001: Owner view roles
Given: Owner login
When: GET /roles
Then: Semua roles ditampilkan dengan permissions

TC-ROL-002: Non-owner cannot manage roles
Given: Admin login
When: POST /roles
Then: 403 Forbidden

TC-ROL-003: Create custom role
Given: Owner login
When: Create role "custom_role"
Then: Role created with is_system=false

TC-ROL-004: Delete system role
Given: Owner login
When: Delete role "admin" (is_system=true)
Then: Error 400 "Cannot delete system role"

TC-ROL-005: Delete role with users
Given: Role "manager" dengan 5 users
When: Delete role
Then: Error 400 "Cannot delete: 5 user(s) still assigned"

TC-ROL-006: Update permissions
Given: Owner pilih role kasir
When: Grant "products.view"
Then: role_permissions updated, kasir dapat view products

TC-ROL-007: Update menu visibility
Given: Owner pilih role manager
When: Hide menu "outlets"
Then: role_menus updated, manager tidak lihat menu outlets
```

---

## 26. Current Implementation Status

```
STATUS: IMPLEMENTED
```

Role management, permission tree, menu visibility, dan custom role creation berfungsi.

---

## 27. Bugs / Findings

| ID | Severity | Finding |
|----|----------|---------|
| ROL-F-01 | MEDIUM | `seed_ai_menu.sql` menggunakan role ID `a00` (owner) yang tidak di-seed di `seed_menus.sql` (hanya `a01`/`a02`/`a03`) — owner menu visibility mungkin tidak ter-seed dengan benar |
| ROL-F-02 | LOW | Audit logging untuk role/permission/menu changes tidak terlihat eksplisit |
| ROL-F-03 | LOW | Update permissions menggunakan delete-all + insert strategy — dapat menyebabkan brief inconsistency jika concurrent |

---

## 28. Gaps

| Gap | Keterangan |
|-----|------------|
| Permission audit trail | Tidak ada history perubahan permission |
| Role template | Tidak ada template untuk membuat role baru |
| Permission testing | Tidak ada UI untuk test permission per role |

---

## 29. Dependency Map

```
Roles
 ├── role_permissions (module/action authorization)
 ├── role_menus (sidebar visibility)
 ├── menus (module/action definitions)
 ├── Users (users.role = roles.name)
 ├── Auth (require_permission query role_permissions)
 └── All Modules (permission check)
```

---

## 30. End-to-End Flow

```
OWNER BUKA MENU ROLE & AKSES
 ↓
VIEW ROLES (GET /roles)
 ↓
PILIH ROLE → VIEW PERMISSIONS
 ↓
[EDIT PERMISSIONS]
 ↓
PUT /roles/{id}/permissions
 ↓
DELETE + INSERT role_permissions
 ↓
[EDIT MENU VISIBILITY]
 ↓
PUT /menus/role/{id}
 ↓
DELETE + INSERT role_menus
 ↓
PERMISSION & VISIBILITY UPDATED
 ↓
USER DENGAN ROLE TERSEBUT:
 ├── require_permission() → check role_permissions
 ├── GET /menus/my-menus → check role_menus
 └── canAccess() → check menu visibility
```
