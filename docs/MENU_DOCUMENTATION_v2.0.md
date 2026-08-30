# Menu Documentation v2.0 — Paket System Rework

## Overview

This version documents the reworked paket (bundle) system. The previous
approach (v1.0) used `product_type` and `bundle_items` columns on the
products table. The new approach (v2.0) uses **category-based detection**
with **dynamic composition at point of sale**.

## Key Changes from v1.0

| Aspect | v1.0 | v2.0 |
|--------|------|------|
| Paket detection | `products.product_type = 'paket'` | `products.category_id` = Paket category |
| Composition | Pre-defined in `products.bundle_items` JSONB | Chosen dynamically by cashier at POS/Dine-In |
| Flexibility | Every sale of same paket has identical items | Each sale can have different items |
| COGS calculation | Used paket product's own `cost` field | Sums `cost` of each component item in `paket_items` |
| Database columns | `product_type`, `bundle_items` | Both columns **removed** |

## Database Schema Changes

### Removed columns
```sql
ALTER TABLE products DROP COLUMN product_type;
ALTER TABLE products DROP COLUMN bundle_items;
```

### No new columns needed
The `sales.items` JSONB already stores the full item array. Paket
composition is stored as `paket_items` nested inside each sale item:

```json
{
  "product_id": "paket-product-uuid",
  "name": "Paket Suka-Suka",
  "price": 18000,
  "quantity": 1,
  "variant_name": "",
  "paket_items": [
    {"product_id": "dimsum-ori-uuid", "name": "Dimsum Original Reguler", "price": 3000, "quantity": 2},
    {"product_id": "dimsum-nori-uuid", "name": "Dimsum Nori Reguler", "price": 3000, "quantity": 2},
    {"product_id": "dimsum-beef-uuid", "name": "Dimsum Smoke Beef Reguler", "price": 3500, "quantity": 2}
  ]
}
```

## How Paket Works

### 1. Product Setup (Products page)
- Create a product with **category = "Paket"**
- Set the paket selling price (e.g. Rp 18.000 for "Paket Mix Suka Suka")
- No pre-defined composition needed

### 2. POS — Selling a Paket
1. Cashier clicks a paket product card (shows "Paket" badge)
2. A **Paket Composer** modal opens showing ALL non-paket products
3. Cashier selects which items and quantities go into this paket
4. Search box available to filter products
5. Total item count displayed
6. "Tambah ke Keranjang" adds the paket to cart with `paket_items`

### 3. Dine-In — Selling a Paket
Same composer modal in the Dine-In order panel.

### 4. Cart Display
Paket items in cart show their composition as a sub-list:
```
Paket Suka-Suka           Rp 18.000
  ├ Dimsum Original ×2
  ├ Dimsum Nori ×2
  └ Dimsum Beef ×2
```

### 5. Receipt
The paket appears as a single line item on the receipt with its paket price.

## Profit/Loss Calculation

### Regular items
- Revenue = `item.price × item.quantity`
- COGS = `products.cost × item.quantity`
- Profit = Revenue - COGS

### Paket items
- Revenue = `paket.price × paket.quantity` (what customer paid)
- COGS = `SUM(component_product.cost × component.quantity)` for each item in `paket_items`
- Profit = Revenue - COGS

### Example
```
Paket Suka-Suka sold for Rp 18.000
  Contains: 2× Dimsum Original (cost Rp 1.927 each)
            2× Dimsum Nori (cost Rp 2.329 each)
            2× Dimsum Beef (cost Rp 2.329 each)

Revenue = Rp 18.000
COGS = (2 × 1.927) + (2 × 2.329) + (2 × 2.329) = 13.170
Profit = 18.000 - 13.170 = Rp 4.830
```

### Report endpoints updated
All COGS calculations in these endpoints now handle paket_items:
- `/reports/profit-loss` — headline, by-product, by-category, by-day
- `/reports/sales` — by-product breakdown

The SQL uses a CASE expression:
```sql
CASE
  WHEN elem ? 'paket_items' AND jsonb_array_length(elem->'paket_items') > 0 THEN
    (SELECT SUM(pc.cost * pi.quantity)
     FROM jsonb_array_elements(elem->'paket_items') pi
     JOIN products pc ON pi.product_id = pc.id)
  ELSE
    p.cost * elem.quantity
END
```

## Existing Paket Products

The database already contains paket products with correct `category_id`
pointing to the "Paket" category:

| Name | SKU | Price | Category |
|------|-----|-------|----------|
| Paket Ekonomis Isi 3 - Mozarella | PKT-EKO-MOZ | 9.000 | Paket |
| Paket Ekonomis Isi 3 - Nori | PKT-EKO-NORI | 8.500 | Paket |
| Paket Ekonomis Isi 3 - Original Mix | PKT-EKO-MIX | 8.000 | Paket |
| Paket Ekonomis Isi 3 - Pedas | PKT-EKO-PDS | 9.000 | Paket |
| Paket Ekonomis Isi 3 - Smoke Beef | PKT-EKO-BEEF | 9.000 | Paket |
| Paket Hemat - Mozarella Isi 5 | PKT-HEMAT-MOZ5 | 15.000 | Paket |
| Paket Hemat - Original Isi 6 | PKT-HEMAT-ORI6 | 15.000 | Paket |
| Paket Mix Suka Suka (Isi 6 Pcs) | PKT-MIX-SUKA | 18.000 | Paket |

All paket products have `cost = 0` in the products table. This is correct
because COGS is now calculated dynamically from the component items'
costs at sale time, not from the paket's own cost field.

## Frontend Files

| File | Changes |
|------|---------|
| `Products.js` | Removed product_type selector and bundle_items UI. Paket = category only. Table shows category name with "Paket" badge. |
| `POS.js` | Replaced static paketPick modal with dynamic paketComposer. Cashier selects items at sale time. Cart shows paket_items sub-list. |
| `Tables.js` | Same dynamic paket composer in dine-in order panel. Order items include paket_items. |

## Backend Files

| File | Changes |
|------|---------|
| `models/products.py` | Removed `product_type` and `bundle_items` from ProductCreate/ProductUpdate |
| `routes/products.py` | Removed `product_type` and `bundle_items` from INSERT/UPDATE SQL |
| `routes/reports.py` | All COGS calculations now use CASE to handle paket_items components |
| `sql/postgres_schema.sql` | Removed `product_type` and `bundle_items` columns from products table |
