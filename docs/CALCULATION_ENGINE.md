# POS Calculation Engine — Zero-Divergence Specification

## 1. Price Resolution

### Source of Truth
- **Database**: `products.price` (NUMERIC(12,2) NOT NULL)
- **Backend**: `services/pricing_service.py` resolves the final unit price
- **Frontend**: Display only — never authoritative

### Resolution Rules
```
IF sales_channel == "online":
    unit_price = online_price (fallback: products.price)
ELIF price_type == "reseller":
    unit_price = reseller_price (fallback: products.price)
ELIF price_type == "partai":
    unit_price = wholesale_price (fallback: products.price)
ELSE (ecceran/standard):
    unit_price = products.price
```

### Variant Price Resolution
If `variant_name` is provided and matches a variant in `products.variants` JSONB, the variant's pricing fields are used instead of the product-level fields.

## 2. Calculation Formula (Canonical)

### Line Subtotal
```
line_subtotal = round(unit_price × quantity, 2)
```

### Order Subtotal
```
order_subtotal = round(Σ(line_subtotal), 2)
```

### Grand Total
```
grand_total = round(order_subtotal - discount + tax, 2)
grand_total = max(0, grand_total)
```

### Validation Rules
- `discount >= 0` (rejected otherwise)
- `tax >= 0` (rejected otherwise)
- `discount <= subtotal` (rejected otherwise)
- `tax <= subtotal` (rejected otherwise)
- `quantity >= 1` (rejected otherwise)
- `unit_price >= 0` (Pydantic Field constraint)

## 3. Payment Calculation

### Cash
```
amount_paid = frontend_supplied (must be >= grand_total)
change = round(amount_paid - grand_total, 2)
change = max(0, change)
```

### Card / QRIS / Transfer
```
amount_paid = grand_total (backend overwrites frontend value)
change = 0
```

## 4. Rounding Policy

- **All money calculations** use `round(value, 2)` in Python before persistence
- **Database** stores `NUMERIC(14,2)` which enforces 2 decimal places
- **Frontend display** uses `formatIDR()` with `maximumFractionDigits: 0` (rounds to whole Rupiah for display only)
- **No rounding in SQL** — all SQL aggregates use persisted values

## 5. Single Source of Truth

### Calculation Engine Location
- **`backend/services/sales_service.py:_validate_sale_total()`** — the canonical total calculation
- **`backend/services/sales_service.py:_validate_payment()`** — the canonical payment validation
- **`backend/services/order_service.py:_calc_total()`** — the canonical subtotal calculation

### Both POS and Dine-In Use the Same Functions
- `POST /sales` (POS) → uses `_validate_sale_total()` and `_validate_payment()`
- `POST /orders/{id}/checkout` (Dine-In) → uses `_validate_sale_total()` and `_validate_payment()`

## 6. Frontend vs Backend Responsibility

| Field | Frontend | Backend |
|-------|----------|---------|
| product_id | Input (sent) | Validates against DB |
| quantity | Input (sent) | Validates >= 1 |
| unit_price | Display only | Resolved from DB |
| variant_name | Input (sent) | Used for price resolution |
| discount | Input (sent) | Validates >= 0, <= subtotal |
| tax | Input (sent, hardcoded 0) | Validates >= 0, <= subtotal |
| subtotal | Display only | Calculated from DB price × qty |
| total | Display only | Calculated: subtotal - discount + tax |
| amount_paid | Input (cash only) | Validated (cash) or overwritten (card/qris/transfer) |
| change | Display only | Calculated: amount_paid - total |

## 7. Database Constraints

### CHECK Constraints (added 2026-02-09)
- `products.price >= 0`
- `products.cost >= 0`
- `sales.subtotal >= 0`
- `sales.discount >= 0`
- `sales.tax >= 0`
- `sales.total >= 0`
- `sales.amount_paid >= 0`
- `sales.change_amount >= 0`
- `shifts.opening_cash >= 0`
- `shifts.actual_cash >= 0`
- `expenses.amount >= 0`
- `purchase_orders.total >= 0`

### UNIQUE Constraints
- `sales.invoice_no` — prevents duplicate sales at DB level

## 8. Report Consistency

### Revenue
- All reports use `SUM(sales.total)` (persisted) for headline revenue
- Item-level revenue uses `SUM((elem->>'price')::numeric * (elem->>'quantity')::numeric)` from JSONB
- These may differ when discount/tax is applied — this is expected (item-level = gross, total = net)

### COGS
- POS COGS is calculated at report time from current `products.cost`
- Online COGS is stored at creation time in `online_order_items.cogs`

## 9. Known Limitations

1. **QRIS amount divergence**: Frontend total is sent to Midtrans before the sale is created. If the product price changes between product list load and checkout, the QRIS charge may differ from the recorded sale total.
2. **COGS not versioned**: Historical P&L uses current `products.cost`, not the cost at time of sale.
3. **Tax/service charge not auto-calculated**: `outlets.tax_rate` and `outlets.service_charge_rate` are configuration-only. The frontend hardcodes `tax: 0` and does not send service charge. This is current business behavior.
4. **Discount is flat amount**: No percentage-based discount in POS checkout (coupons have percentage, but that's a separate flow).
5. **Sales idempotency is in-process**: The `_idempotency_cache` dict is per-worker. Single-worker deployment is sufficient.
