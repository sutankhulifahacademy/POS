# SETTINGS (PENGATURAN) — BUSINESS & TECHNICAL DOCUMENTATION

> Dokumentasi AS-IS berdasarkan audit source code.
> Source: `frontend/src/pages/Settings.js`, `backend/routes/business.py`, `backend/routes/categories.py`, `backend/sql/postgres_schema.sql`

---

## 1. Module Overview

Menu Settings mengelola profil bisnis (nama, tipe, currency, tax rate, alamat, logo, warna tema) dan kategori produk. Settings juga menyediakan color theme editor yang mempengaruhi seluruh tampilan aplikasi.

---

## 2. Business Purpose

Mengkonfigurasi identitas bisnis, pengaturan pajak, tampilan visual (tema), dan kategori produk yang digunakan di seluruh sistem.

---

## 3. Business Objective

- Mengatur profil bisnis (nama, tipe, alamat, logo).
- Mengatur tax rate bisnis.
- Mengatur warna tema aplikasi.
- Mengelola kategori produk.

---

## 4. Actors / Roles

| Role | Akses | Keterangan |
|------|-------|------------|
| Owner | YA | Full akses |
| Admin | YA | Full akses |
| Manager | TIDAK | Tidak ada menu Settings |
| Supervisor | TIDAK | Tidak ada menu |
| Kasir | TIDAK | Tidak ada menu |

Berdasarkan `seed_menus.sql`: manager tidak memiliki menu `settings`.

---

## 5. Outlet Scope

**Klasifikasi: GLOBAL**

- `business` table tidak memiliki `outlet_id` — profil bisnis global.
- `categories` table tidak memiliki `outlet_id` — kategori global.
- Settings berlaku untuk seluruh outlet.

---

## 6. Role & Permission

| Aksi | Owner | Admin | Manager | Supervisor | Kasir |
|------|-------|-------|---------|------------|-------|
| View Settings | YA | YA | TIDAK | TIDAK | TIDAK |
| Update Business | YA | YA | TIDAK | TIDAK | TIDAK |
| Manage Categories | YA | YA | TIDAK | TIDAK | TIDAK |

Backend:
- `GET /api/business` → Public (no auth)
- `POST /api/business` → `require_permission("settings", "manage")`
- Category CRUD → `require_permission("categories", "create/update/delete")`

---

## 7. Business Flow

```
OWNER BUKA MENU PENGATURAN
 ↓
LIHAT PROFIL BISNIS + KATEGORI
 ↓
[EDIT PROFIL]
 ↓
ISI: nama, tipe, currency, tax rate, alamat, logo
 ↓
[EDIT TEMA]
 ↓
PILIH WARNA (primary, secondary, bg, card_bg, sidebar_bg)
 ↓
SIMPAN → refreshTheme()
 ↓
[KELOLA KATEGORI]
 ↓
TAMBAH/EDIT/HAPUS KATEGORI
```

---

## 8. Detailed Business Rules

1. `business` table hanya satu record (LIMIT 1).
2. `POST /api/business` melakukan upsert (create or update).
3. Jika belum ada outlet, `setup_business` akan seed main outlet.
4. Color theme: `primary_color`, `secondary_color`, `bg_color`, `card_bg_color`, `sidebar_bg_color`.
5. Theme di-load via `ThemeProvider` dan di-refresh setelah save.
6. Kategori: `name` required, `color` opsional (default `#D4AF37`).

---

## 9. State / Status

Settings tidak memiliki state machine.

---

## 10. Technical Architecture

```
Browser → React (Settings.js) → API → FastAPI (business.py, categories.py) → PostgreSQL (business, categories)
```

---

## 11. Technical Flow

1. `Settings.js` → `GET /api/business` + `GET /api/categories`.
2. Edit profil → `POST /api/business` → upsert.
3. Edit tema → `POST /api/business` dengan color fields → `refreshTheme()`.
4. Upload logo → `POST /api/uploads` → update `logo_url`.
5. Category CRUD → `POST/PUT/DELETE /api/categories`.

---

## 12. Frontend

**File:** `frontend/src/pages/Settings.js`

| Elemen | Detail |
|--------|--------|
| Context | `useTheme()` (`refresh`) — line 17 |
| API Calls | `POST /uploads`, `GET /business`, `GET /categories`, `POST /business`, `POST /categories`, `DELETE /categories/:id` |
| State | `business`, `categories`, `newCat`, `uploadingLogo` |
| UI | Business profile form (name, type, currency, tax rate, address, logo), color theme editor, category list with add/delete |

---

## 13. Backend

**File:** `backend/routes/business.py`

| Endpoint | Method | Function | Line | Auth |
|----------|--------|----------|------|------|
| `/api/business` | GET | `get_business` | L7 | Public |
| `/api/business` | POST | `setup_business` | L13 | `require_permission("settings", "manage")` |

**File:** `backend/routes/categories.py`

| Endpoint | Method | Function | Auth |
|----------|--------|----------|------|
| `/api/categories` | GET | `list_items` | `get_current_user` |
| `/api/categories` | POST | `create_item` | `require_permission("categories", "create")` |
| `/api/categories/{id}` | PUT | `update_item` | `require_permission("categories", "update")` |
| `/api/categories/{id}` | DELETE | `delete_item` | `require_permission("categories", "delete")` |

---

## 14. API

```
GET /api/business (public)
POST /api/business { name, business_type, currency, tax_rate, address, logo_url, colors }
GET /api/categories
POST /api/categories { name, color }
PUT /api/categories/{id} { name, color }
DELETE /api/categories/{id}
```

---

## 15. Database

### Table: `business`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `name` | varchar(255) | — | NOT NULL |
| `business_type` | varchar(20) | — | NOT NULL |
| `currency` | varchar(10) | `'IDR'` | |
| `tax_rate` | numeric(5,2) | 0 | |
| `address` | text | — | |
| `logo_url` | text | — | |
| `primary_color` | varchar(20) | `'#F4C842'` | |
| `secondary_color` | varchar(20) | `'#C4A484'` | |
| `bg_color` | varchar(20) | `'#1A0810'` | |
| `card_bg_color` | varchar(20) | `'#331419'` | |
| `sidebar_bg_color` | varchar(20) | `'#2A1015'` | |

### Table: `categories`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `name` | varchar(255) | — | NOT NULL |
| `color` | varchar(20) | `'#D4AF37'` | |
| `created_at` | timestamptz | `now()` | |

---

## 16. Data Flow

```
USER INPUT → FRONTEND → API → BACKEND → DB → RESPONSE → UI + THEME REFRESH
```

---

## 17. Validation

- `name` NOT NULL (business & categories).
- `business_type` NOT NULL.

---

## 18. Calculation

Tidak ada calculation.

---

## 19. Audit Log

| Action | Entity | Dicatat? |
|--------|--------|----------|
| Update Business | `business` | NOT CONFIRMED FROM SOURCE |
| Create/Update/Delete Category | `category` | NOT CONFIRMED FROM SOURCE |

---

## 20. Reports

- `business.tax_rate` digunakan di P&L dan Sales Report.
- `categories` digunakan di Sales Report (breakdown by category).

---

## 21. Integration / Dependency

| Dependency | Keterangan |
|------------|------------|
| Products | `category_id` reference |
| POS | Tax rate, theme |
| Reports | Tax rate, category breakdown |
| Theme | `ThemeProvider` menggunakan business colors |

---

## 22. Error Handling

| Kondisi | HTTP | Behavior |
|---------|------|----------|
| Name empty | 400 | Validation error |
| Unauthorized | 401/403 | Redirect/blocked |

---

## 23. Edge Cases

- Business belum di-setup → `GET /api/business` returns empty/null.
- Theme color invalid → NOT CONFIRMED (kemungkinan tidak divalidasi).
- Category dihapus saat ada product reference → `products.category_id` SET NULL.

---

## 24. Security

| Aspek | Status |
|-------|--------|
| Authentication | YA (kecuali GET /business yang public) |
| Authorization | YA — `require_permission` |
| SQL Injection | Aman — parameterized |

---

## 25. QA / Test Cases

```
TC-SET-001: Update business profile
Given: Owner login
When: Update name + tax_rate
Then: Business updated, theme refreshed

TC-SET-002: Manage categories
Given: Owner login
When: Add category "Minuman"
Then: Category created, available in Products

TC-SET-003: Public business access
Given: No login
When: GET /business
Then: Business profile returned (for branding)
```

---

## 26. Current Implementation Status

```
STATUS: IMPLEMENTED
```

Business profile, theme editor, category management berfungsi.

---

## 27. Bugs / Findings

| ID | Severity | Finding |
|----|----------|---------|
| SET-F-01 | LOW | `GET /api/business` public tanpa auth — dapat expose business info |
| SET-F-02 | LOW | Audit logging tidak terlihat eksplisit |

---

## 28. Gaps

| Gap | Keterangan |
|-----|------------|
| Per-outlet settings | Settings bisnis global, tidak ada per-outlet (kecuali receipt config) |
| Backup/restore | Tidak ada backup/restore settings |

---

## 29. Dependency Map

```
Settings
 ├── Business (profil bisnis, tema)
 ├── Categories (kategori produk)
 ├── Products (category_id reference)
 ├── POS (tax rate, theme)
 ├── Reports (tax rate, category breakdown)
 └── ThemeProvider (color theme)
```

---

## 30. End-to-End Flow

```
OWNER BUKA MENU PENGATURAN
 ↓
VIEW BUSINESS PROFILE + CATEGORIES
 ↓
[EDIT PROFILE] → POST /business → upsert
 ↓
[EDIT TEMA] → POST /business (colors) → refreshTheme()
 ↓
[UPLOAD LOGO] → POST /uploads → update logo_url
 ↓
[KELOLA KATEGORI] → CRUD /categories
 ↓
PERUBAHAN BERLAKU GLOBAL
```
