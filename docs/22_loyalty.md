# LOYALTY — BUSINESS & TECHNICAL DOCUMENTATION

> Dokumentasi AS-IS berdasarkan audit source code.
> Source: `frontend/src/pages/Loyalty.js`, `backend/routes/loyalty.py`, `backend/sql/postgres_schema.sql`

---

## 1. Module Overview

Menu Loyalty mengelola program membership pelanggan per outlet: tier membership, point accumulation, point redemption, dan point transactions history. Loyalty adalah module outlet-scoped yang terhubung dengan Customers dan Sales.

---

## 2. Business Purpose

Membangun loyalitas pelanggan melalui program membership dengan point reward.

---

## 3. Business Objective

- Mengelola membership pelanggan per outlet.
- Mengatur tier membership (Silver, Gold, Platinum).
- Melacak point accumulation dari pembelian.
- Melacak point redemption untuk reward.
- Menyediakan history point transactions.

---

## 4. Actors / Roles

| Role | Akses | Keterangan |
|------|-------|------------|
| Owner | YA | Semua outlet |
| Admin | YA | Outlet yang di-assign |
| Manager | YA | Outlet yang di-assign |
| Supervisor | TIDAK | NOT CONFIRMED |
| Kasir | TIDAK | Tidak ada menu Loyalty |

Berdasarkan `seed_roles.sql`: NOT CONFIRMED — loyalty mungkin tidak ada di seed roles.

---

## 5. Outlet Scope

**Klasifikasi: OUTLET-SCOPED**

- `customer_memberships.outlet_id` menentukan outlet membership.
- `point_transactions.outlet_id` menentukan outlet transaksi point.
- Pelanggan dapat memiliki membership terpisah di setiap outlet.

Sumber: `backend/routes/loyalty.py` lines 8-150.

---

## 6. Role & Permission

| Aksi | Owner | Admin | Manager | Supervisor | Kasir |
|------|-------|-------|---------|------------|-------|
| View Memberships | YA | YA | YA | TIDAK | TIDAK |
| Adjust Points | YA | YA | YA | TIDAK | TIDAK |
| View Tiers | YA | YA | YA | TIDAK | TIDAK |

Backend: `get_current_user` + `require_permission("loyalty", ...)` (NOT CONFIRMED).

---

## 7. Business Flow

```
MANAGER BUKA MENU LOYALTY
 ↓
PILIH OUTLET
 ↓
LIHAT DAFTAR MEMBERSHIP
 ↓
[PILIH PELANGGAN]
 ↓
LIHAT TIER + POINT BALANCE + HISTORY
 ↓
[ADJUST POINTS]
 ↓
PILIH TIPE (add/deduct)
 ↓
INPUT AMOUNT + REASON
 ↓
SIMPAN
 ↓
POINT BALANCE UPDATE + TRANSACTION DICATAT
```

---

## 8. Detailed Business Rules

1. Membership per outlet — satu pelanggan dapat memiliki membership terpisah di setiap outlet.
2. Tier: Silver, Gold, Platinum (NOT CONFIRMED — berdasarkan threshold points).
3. Point accumulation: dari pembelian (NOT CONFIRMED — kemungkinan 1 point per X rupiah).
4. Point redemption: untuk reward (NOT CONFIRMED).
5. Adjust points: manual add/deduct dengan reason.
6. Setiap adjust mencatat `point_transactions`.

---

## 9. State / Status

Membership tidak memiliki state machine. Tier berdasarkan point balance:
```
Silver (0 - threshold1)
Gold (threshold1 - threshold2)
Platinum (threshold2+)
```
NOT CONFIRMED FROM SOURCE — threshold values.

---

## 10. Technical Architecture

```
Browser → React (Loyalty.js) → API → FastAPI (loyalty.py) → PostgreSQL (customer_memberships, point_transactions, customers)
```

---

## 11. Technical Flow

### List Memberships
1. `GET /api/loyalty/memberships?outlet_id={uuid}`.
2. Backend: join `customer_memberships` dengan `customers`, filter by outlet.

### Adjust Points
1. `POST /api/loyalty/adjust-points` dengan `{ customer_id, outlet_id, type, amount, reason }`.
2. Backend `adjust_points` (loyalty.py):
   - Update `customer_memberships.points`.
   - Insert `point_transactions`.
   - Update tier if needed.

### View History
1. `GET /api/loyalty/transactions?customer_id={uuid}&outlet_id={uuid}`.
2. Backend: list `point_transactions` per customer per outlet.

---

## 12. Frontend

**File:** `frontend/src/pages/Loyalty.js`

| Elemen | Detail |
|--------|--------|
| Context | `useOutlet()` — `outletIdForApi` |
| API Calls | `GET /loyalty/memberships`, `GET /loyalty/transactions`, `POST /loyalty/adjust-points`, `GET /customers` |
| State | `memberships`, `transactions`, `selected`, `adjustForm` |
| UI | Membership list, detail with point balance + tier + transaction history, adjust points modal |

---

## 13. Backend

**File:** `backend/routes/loyalty.py`

| Endpoint | Method | Function | Line | Auth |
|----------|--------|----------|------|------|
| `/api/loyalty/memberships` | GET | `list_memberships` | L8 | `get_current_user` |
| `/api/loyalty/transactions` | GET | `list_transactions` | L40 | `get_current_user` |
| `/api/loyalty/adjust-points` | POST | `adjust_points` | L80 | `require_permission("loyalty", "manage")` |

---

## 14. API

```
GET /api/loyalty/memberships?outlet_id={uuid}
GET /api/loyalty/transactions?customer_id={uuid}&outlet_id={uuid}
POST /api/loyalty/adjust-points { customer_id, outlet_id, type, amount, reason }
```

---

## 15. Database

### Table: `customer_memberships`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `customer_id` | uuid | — | NOT NULL |
| `outlet_id` | uuid | — | NOT NULL |
| `tier` | varchar(20) | `'silver'` | silver/gold/platinum |
| `points` | integer | 0 | |
| `total_earned` | integer | 0 | |
| `total_redeemed` | integer | 0 | |
| `joined_at` | timestamptz | `now()` | |
| `updated_at` | timestamptz | `now()` | |

**Constraint:** UNIQUE (`customer_id`, `outlet_id`)
**Index:** `idx_customer_memberships_outlet`

### Table: `point_transactions`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | uuid PK | `uuid_generate_v4()` | |
| `customer_id` | uuid | — | NOT NULL |
| `outlet_id` | uuid | — | NOT NULL |
| `type` | varchar(20) | — | NOT NULL — earn/redeem/adjust_add/adjust_deduct |
| `amount` | integer | — | NOT NULL |
| `balance_after` | integer | — | |
| `reason` | text | — | |
| `reference` | varchar(100) | — | Sale invoice no, dll |
| `created_at` | timestamptz | `now()` | |
| `created_by` | uuid | — | |

**Index:** `idx_point_transactions_customer`

**Relationship:**
```
customers (1) ─── (many) customer_memberships ─── (1) outlets
customer_memberships (1) ─── (many) point_transactions
```

---

## 16. Data Flow

```
USER INPUT (adjust points)
 ↓
API: POST /loyalty/adjust-points
 ↓
BACKEND: adjust_points()
 ↓
UPDATE customer_memberships.points
 ↓
INSERT point_transactions
 ↓
UPDATE tier (if needed)
 ↓
RESPONSE
 ↓
UI RELOAD
```

---

## 17. Validation

- `customer_id`, `outlet_id` required.
- `amount` > 0.
- `type` valid (add/deduct/earn/redeem).

---

## 18. Calculation

### Point Balance
```
points = previous_points + (type=add/earn ? +amount : -amount)
```

### Tier
```
tier = silver (0 - T1)
     = gold (T1 - T2)
     = platinum (T2+)
```
NOT CONFIRMED FROM SOURCE — threshold values.

---

## 19. Audit Log

| Action | Entity | Dicatat? |
|--------|--------|----------|
| Adjust Points | `point_transaction` | YA — via `point_transactions` table |
| Tier Update | `customer_membership` | NOT CONFIRMED |

---

## 20. Reports

- Tidak ada report loyalty tersendiri (NOT CONFIRMED).
- Data membership dapat dianalisa via AI Assistant.

---

## 21. Integration / Dependency

| Dependency | Keterangan |
|------------|------------|
| Customers | `customer_id` |
| Outlets | `outlet_id` scope |
| Sales | Point accumulation dari pembelian (NOT CONFIRMED) |
| AI Assistant | Query membership data |

---

## 22. Error Handling

| Kondisi | HTTP | Behavior |
|---------|------|----------|
| Customer not found | 404 | "Customer not found" |
| Insufficient points (deduct) | 400 | "Insufficient points" |
| Unauthorized | 401/403 | Redirect/blocked |

---

## 23. Edge Cases

- Pelanggan tanpa membership → auto-create saat adjust pertama.
- Point negatif → dicegah (deduct tidak boleh melebihi balance).
- Membership per outlet → pelanggan dapat punya tier berbeda di outlet berbeda.

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
TC-LOY-001: Adjust points add
Given: Membership dengan 100 points
When: Adjust add 50 points
Then: Balance=150, transaction dicatat

TC-LOY-002: Adjust points deduct
Given: Membership dengan 100 points
When: Adjust deduct 30 points
Then: Balance=70, transaction dicatat

TC-LOY-003: Insufficient points
Given: Membership dengan 10 points
When: Adjust deduct 50 points
Then: Error 400 "Insufficient points"

TC-LOY-004: Per-outlet membership
Given: Customer dengan membership di outlet A (100) dan outlet B (50)
When: View membership outlet A
Then: Hanya membership outlet A yang ditampilkan
```

---

## 26. Current Implementation Status

```
STATUS: IMPLEMENTED
```

Membership list, adjust points, transaction history berfungsi.

---

## 27. Bugs / Findings

| ID | Severity | Finding |
|----|----------|---------|
| LOY-F-01 | MEDIUM | Point accumulation dari sales (otomatis) NOT CONFIRMED — kemungkinan tidak terintegrasi dengan POS checkout |
| LOY-F-02 | LOW | Tier threshold values NOT CONFIRMED FROM SOURCE |
| LOY-F-03 | LOW | Tidak ada report loyalty tersendiri |

---

## 28. Gaps

| Gap | Keterangan |
|-----|------------|
| Auto point from sales | NOT CONFIRMED — point accumulation otomatis dari POS |
| Reward redemption | Tidak ada redemption untuk produk/reward |
| Tier benefits | Tidak ada benefit berbeda per tier |
| Loyalty report | Tidak ada report loyalty |

---

## 29. Dependency Map

```
Loyalty
 ├── Customers (customer_id)
 ├── Outlets (outlet_id scope)
 ├── Sales (point accumulation — NOT CONFIRMED)
 ├── Point Transactions (audit trail)
 └── AI Assistant (query)
```

---

## 30. End-to-End Flow

```
MANAGER BUKA MENU LOYALTY
 ↓
PILIH OUTLET
 ↓
VIEW MEMBERSHIPS
 ↓
[PILIH CUSTOMER]
 ↓
VIEW TIER + POINT BALANCE + HISTORY
 ↓
[ADJUST POINTS]
 ↓
UPDATE customer_memberships.points
 ↓
INSERT point_transactions
 ↓
UPDATE tier (if needed)
 ↓
UI RELOAD
```
