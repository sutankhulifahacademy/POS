-- ============================================================
-- REPUBLIK DIMSUM POS
-- TESTING SEED DATA
-- Database : sutankhulifah_pos
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- FIXED UUID
-- ============================================================

-- BUSINESS
INSERT INTO business (
    id, name, business_type, currency, tax_rate, address
)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Republik Dimsum',
    'F&B / Restaurant',
    'IDR',
    11,
    'Depok, Jawa Barat'
)
ON CONFLICT DO NOTHING;


-- ============================================================
-- OUTLETS
-- ============================================================

INSERT INTO outlets (
    id, name, address, phone, is_main
)
VALUES
(
    '10000000-0000-0000-0000-000000000001',
    'Outlet Utama',
    'Jl. Raya Utama No. 1, Depok',
    '081234567890',
    true
),
(
    '10000000-0000-0000-0000-000000000002',
    'Outlet Margonda',
    'Jl. Margonda Raya No. 100, Depok',
    '081234567891',
    false
),
(
    '10000000-0000-0000-0000-000000000003',
    'Outlet Sawangan',
    'Jl. Sawangan Raya No. 20, Depok',
    '081234567892',
    false
)
ON CONFLICT DO NOTHING;


-- ============================================================
-- CATEGORIES
-- ============================================================

INSERT INTO categories (
    id, name, color
)
VALUES
(
    '20000000-0000-0000-0000-000000000001',
    'Dimsum',
    '#D4AF37'
),
(
    '20000000-0000-0000-0000-000000000002',
    'Frozen Dimsum',
    '#4CAF50'
),
(
    '20000000-0000-0000-0000-000000000003',
    'Minuman',
    '#2196F3'
),
(
    '20000000-0000-0000-0000-000000000004',
    'Makanan',
    '#FF9800'
),
(
    '20000000-0000-0000-0000-000000000005',
    'Paket',
    '#9C27B0'
)
ON CONFLICT DO NOTHING;


-- ============================================================
-- SUPPLIERS
-- ============================================================

INSERT INTO suppliers (
    id, name, contact_person, phone, email, address
)
VALUES
(
    '30000000-0000-0000-0000-000000000001',
    'PT Dimsum Nusantara',
    'Budi Santoso',
    '081300000001',
    'budi@dimsumnusantara.test',
    'Jakarta'
),
(
    '30000000-0000-0000-0000-000000000002',
    'CV Frozen Food Indonesia',
    'Andi Wijaya',
    '081300000002',
    'andi@frozenfood.test',
    'Bogor'
),
(
    '30000000-0000-0000-0000-000000000003',
    'PT Minuman Sejahtera',
    'Rina Putri',
    '081300000003',
    'rina@minuman.test',
    'Depok'
)
ON CONFLICT DO NOTHING;


-- ============================================================
-- CUSTOMERS
-- ============================================================

INSERT INTO customers (
    id, name, phone, email, address,
    loyalty_points, total_spent, visit_count
)
VALUES
(
    '40000000-0000-0000-0000-000000000001',
    'Pelanggan Umum',
    '081400000001',
    'umum@test.local',
    'Depok',
    0,
    0,
    0
),
(
    '40000000-0000-0000-0000-000000000002',
    'Ahmad Fauzi',
    '081400000002',
    'ahmad@test.local',
    'Beji, Depok',
    120,
    1250000,
    8
),
(
    '40000000-0000-0000-0000-000000000003',
    'Siti Rahma',
    '081400000003',
    'siti@test.local',
    'Cimanggis, Depok',
    80,
    850000,
    5
),
(
    '40000000-0000-0000-0000-000000000004',
    'Restu Catering',
    '081400000004',
    'restu@test.local',
    'Sawangan, Depok',
    300,
    4250000,
    17
)
ON CONFLICT DO NOTHING;


-- ============================================================
-- PRODUCTS
-- ============================================================

INSERT INTO products (
    id, name, sku, barcode, category_id,
    price, cost, stock, low_stock_threshold,
    unit, description, is_active, variants
)
VALUES

(
    '50000000-0000-0000-0000-000000000001',
    'Dimsum Ayam',
    'DIM-001',
    '899000000001',
    '20000000-0000-0000-0000-000000000001',
    25000,
    15000,
    100,
    10,
    'box',
    'Dimsum ayam premium isi 10 pcs',
    true,
    '[]'::jsonb
),

(
    '50000000-0000-0000-0000-000000000002',
    'Dimsum Udang',
    'DIM-002',
    '899000000002',
    '20000000-0000-0000-0000-000000000001',
    30000,
    18000,
    80,
    10,
    'box',
    'Dimsum udang isi 10 pcs',
    true,
    '[]'::jsonb
),

(
    '50000000-0000-0000-0000-000000000003',
    'Dimsum Mix',
    'DIM-003',
    '899000000003',
    '20000000-0000-0000-0000-000000000001',
    35000,
    21000,
    75,
    10,
    'box',
    'Dimsum campuran isi 12 pcs',
    true,
    '[]'::jsonb
),

(
    '50000000-0000-0000-0000-000000000004',
    'Dimsum Frozen Ayam',
    'FRZ-001',
    '899000000004',
    '20000000-0000-0000-0000-000000000002',
    45000,
    30000,
    150,
    20,
    'pack',
    'Dimsum frozen ayam isi 20 pcs',
    true,
    '[]'::jsonb
),

(
    '50000000-0000-0000-0000-000000000005',
    'Dimsum Frozen Udang',
    'FRZ-002',
    '899000000005',
    '20000000-0000-0000-0000-000000000002',
    55000,
    37000,
    120,
    20,
    'pack',
    'Dimsum frozen udang isi 20 pcs',
    true,
    '[]'::jsonb
),

(
    '50000000-0000-0000-0000-000000000006',
    'Es Teh Manis',
    'MIN-001',
    '899000000006',
    '20000000-0000-0000-0000-000000000003',
    8000,
    2500,
    200,
    20,
    'cup',
    'Es teh manis',
    true,
    '[]'::jsonb
),

(
    '50000000-0000-0000-0000-000000000007',
    'Air Mineral',
    'MIN-002',
    '899000000007',
    '20000000-0000-0000-0000-000000000003',
    5000,
    2500,
    200,
    20,
    'botol',
    'Air mineral 600ml',
    true,
    '[]'::jsonb
),

(
    '50000000-0000-0000-0000-000000000008',
    'Paket Hemat Dimsum',
    'PKT-001',
    '899000000008',
    '20000000-0000-0000-0000-000000000005',
    45000,
    27000,
    60,
    10,
    'paket',
    'Dimsum ayam + es teh',
    true,
    '[]'::jsonb
)

ON CONFLICT DO NOTHING;


-- ============================================================
-- TABLES / MEJA
-- ============================================================

INSERT INTO tables (
    id, name, capacity, outlet_id, zone, status
)
VALUES
(
    '60000000-0000-0000-0000-000000000001',
    'Meja 01',
    2,
    '10000000-0000-0000-0000-000000000001',
    'Indoor',
    'available'
),
(
    '60000000-0000-0000-0000-000000000002',
    'Meja 02',
    2,
    '10000000-0000-0000-0000-000000000001',
    'Indoor',
    'available'
),
(
    '60000000-0000-0000-0000-000000000003',
    'Meja 03',
    4,
    '10000000-0000-0000-0000-000000000001',
    'Indoor',
    'occupied'
),
(
    '60000000-0000-0000-0000-000000000004',
    'Meja 04',
    4,
    '10000000-0000-0000-0000-000000000001',
    'Outdoor',
    'available'
),
(
    '60000000-0000-0000-0000-000000000005',
    'Meja 05',
    6,
    '10000000-0000-0000-0000-000000000002',
    'Indoor',
    'available'
),
(
    '60000000-0000-0000-0000-000000000006',
    'Meja 06',
    4,
    '10000000-0000-0000-0000-000000000002',
    'Indoor',
    'available'
)
ON CONFLICT DO NOTHING;


-- ============================================================
-- OUTLET STOCK
-- ============================================================

INSERT INTO outlet_stocks (
    id, product_id, outlet_id, quantity
)
VALUES
(
    '70000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    50
),
(
    '70000000-0000-0000-0000-000000000002',
    '50000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    40
),
(
    '70000000-0000-0000-0000-000000000003',
    '50000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    35
),
(
    '70000000-0000-0000-0000-000000000004',
    '50000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000001',
    80
),
(
    '70000000-0000-0000-0000-000000000005',
    '50000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000001',
    60
),
(
    '70000000-0000-0000-0000-000000000006',
    '50000000-0000-0000-0000-000000000006',
    '10000000-0000-0000-0000-000000000001',
    100
),
(
    '70000000-0000-0000-0000-000000000007',
    '50000000-0000-0000-0000-000000000007',
    '10000000-0000-0000-0000-000000000001',
    100
),
(
    '70000000-0000-0000-0000-000000000008',
    '50000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    30
),
(
    '70000000-0000-0000-0000-000000000009',
    '50000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000002',
    50
)
ON CONFLICT DO NOTHING;


-- ============================================================
-- PURCHASE ORDERS
-- ============================================================

INSERT INTO purchase_orders (
    id, po_no, supplier_id, supplier_name,
    items, total, status, note
)
VALUES
(
    '80000000-0000-0000-0000-000000000001',
    'PO-202608-0001',
    '30000000-0000-0000-0000-000000000001',
    'PT Dimsum Nusantara',
    '[
        {
            "product_id": "50000000-0000-0000-0000-000000000001",
            "product_name": "Dimsum Ayam",
            "quantity": 100,
            "price": 15000,
            "subtotal": 1500000
        },
        {
            "product_id": "50000000-0000-0000-0000-000000000002",
            "product_name": "Dimsum Udang",
            "quantity": 50,
            "price": 18000,
            "subtotal": 900000
        }
    ]'::jsonb,
    2400000,
    'received',
    'Stok awal testing'
),
(
    '80000000-0000-0000-0000-000000000002',
    'PO-202608-0002',
    '30000000-0000-0000-0000-000000000002',
    'CV Frozen Food Indonesia',
    '[
        {
            "product_id": "50000000-0000-0000-0000-000000000004",
            "product_name": "Dimsum Frozen Ayam",
            "quantity": 100,
            "price": 30000,
            "subtotal": 3000000
        },
        {
            "product_id": "50000000-0000-0000-0000-000000000005",
            "product_name": "Dimsum Frozen Udang",
            "quantity": 100,
            "price": 37000,
            "subtotal": 3700000
        }
    ]'::jsonb,
    6700000,
    'received',
    'Stok frozen testing'
),
(
    '80000000-0000-0000-0000-000000000003',
    'PO-202608-0003',
    '30000000-0000-0000-0000-000000000003',
    'PT Minuman Sejahtera',
    '[
        {
            "product_id": "50000000-0000-0000-0000-000000000006",
            "product_name": "Es Teh Manis",
            "quantity": 100,
            "price": 2500,
            "subtotal": 250000
        },
        {
            "product_id": "50000000-0000-0000-0000-000000000007",
            "product_name": "Air Mineral",
            "quantity": 100,
            "price": 2500,
            "subtotal": 250000
        }
    ]'::jsonb,
    500000,
    'draft',
    'PO testing'
)
ON CONFLICT DO NOTHING;


-- ============================================================
-- STOCK MOVEMENTS
-- ============================================================

INSERT INTO stock_movements (
    id, product_id, product_name, delta,
    reason, note, outlet_id
)
VALUES
(
    '90000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    'Dimsum Ayam',
    100,
    'purchase',
    'Stok awal',
    '10000000-0000-0000-0000-000000000001'
),
(
    '90000000-0000-0000-0000-000000000002',
    '50000000-0000-0000-0000-000000000002',
    'Dimsum Udang',
    80,
    'purchase',
    'Stok awal',
    '10000000-0000-0000-0000-000000000001'
),
(
    '90000000-0000-0000-0000-000000000003',
    '50000000-0000-0000-0000-000000000004',
    'Dimsum Frozen Ayam',
    150,
    'purchase',
    'Stok frozen awal',
    '10000000-0000-0000-0000-000000000001'
),
(
    '90000000-0000-0000-0000-000000000004',
    '50000000-0000-0000-0000-000000000001',
    'Dimsum Ayam',
    -10,
    'sale',
    'Penjualan testing',
    '10000000-0000-0000-0000-000000000001'
),
(
    '90000000-0000-0000-0000-000000000005',
    '50000000-0000-0000-0000-000000000004',
    'Dimsum Frozen Ayam',
    -5,
    'sale',
    'Penjualan testing',
    '10000000-0000-0000-0000-000000000001'
)
ON CONFLICT DO NOTHING;


-- ============================================================
-- STOCK TRANSFERS
-- ============================================================

INSERT INTO stock_transfers (
    id, transfer_no,
    from_outlet_id, to_outlet_id,
    from_outlet_name, to_outlet_name,
    items, total_quantity,
    note, status
)
VALUES
(
    '91000000-0000-0000-0000-000000000001',
    'TRF-202608-0001',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'Outlet Utama',
    'Outlet Margonda',
    '[
        {
            "product_id": "50000000-0000-0000-0000-000000000001",
            "product_name": "Dimsum Ayam",
            "quantity": 20
        },
        {
            "product_id": "50000000-0000-0000-0000-000000000004",
            "product_name": "Dimsum Frozen Ayam",
            "quantity": 10
        }
    ]'::jsonb,
    30,
    'Transfer stok testing',
    'completed'
)
ON CONFLICT DO NOTHING;


-- ============================================================
-- SHIFTS
-- ============================================================

-- Ambil salah satu user yang sudah ada
INSERT INTO shifts (
    id, cashier_id, cashier_name, outlet_id,
    opening_cash, status,
    opened_at, cash_sales, non_cash_sales,
    transaction_count, note
)
SELECT
    '92000000-0000-0000-0000-000000000001',
    u.id,
    u.name,
    '10000000-0000-0000-0000-000000000001',
    500000,
    'open',
    now() - interval '3 hours',
    850000,
    425000,
    25,
    'Shift testing'
FROM users u
WHERE u.email = 'owner@republikdimsum.id'
AND NOT EXISTS (
    SELECT 1
    FROM shifts
    WHERE id = '92000000-0000-0000-0000-000000000001'
)
LIMIT 1;


-- ============================================================
-- SALES
-- ============================================================

INSERT INTO sales (
    id, invoice_no, shift_id, outlet_id,
    customer_id, cashier_id, cashier_name,
    items, subtotal, discount, tax, total,
    payment_method, amount_paid, change_amount,
    source, table_id, table_name, note
)
SELECT
    '93000000-0000-0000-0000-000000000001',
    'INV-20260826-0001',
    '92000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000002',
    u.id,
    u.name,
    '[
        {
            "product_id": "50000000-0000-0000-0000-000000000001",
            "name": "Dimsum Ayam",
            "qty": 2,
            "price": 25000,
            "subtotal": 50000
        },
        {
            "product_id": "50000000-0000-0000-0000-000000000006",
            "name": "Es Teh Manis",
            "qty": 2,
            "price": 8000,
            "subtotal": 16000
        }
    ]'::jsonb,
    66000,
    0,
    0,
    66000,
    'cash',
    100000,
    34000,
    'pos',
    '60000000-0000-0000-0000-000000000003',
    'Meja 03',
    'Transaksi testing'
FROM users u
WHERE u.email = 'owner@republikdimsum.id'
AND NOT EXISTS (
    SELECT 1 FROM sales
    WHERE id = '93000000-0000-0000-0000-000000000001'
)
LIMIT 1;


INSERT INTO sales (
    id, invoice_no, shift_id, outlet_id,
    customer_id, cashier_id, cashier_name,
    items, subtotal, discount, tax, total,
    payment_method, amount_paid, change_amount,
    source, note
)
SELECT
    '93000000-0000-0000-0000-000000000002',
    'INV-20260826-0002',
    '92000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000003',
    u.id,
    u.name,
    '[
        {
            "product_id": "50000000-0000-0000-0000-000000000003",
            "name": "Dimsum Mix",
            "qty": 1,
            "price": 35000,
            "subtotal": 35000
        },
        {
            "product_id": "50000000-0000-0000-0000-000000000007",
            "name": "Air Mineral",
            "qty": 2,
            "price": 5000,
            "subtotal": 10000
        }
    ]'::jsonb,
    45000,
    0,
    0,
    45000,
    'qris',
    45000,
    0,
    'pos',
    'Transaksi QRIS testing'
FROM users u
WHERE u.email = 'owner@republikdimsum.id'
AND NOT EXISTS (
    SELECT 1 FROM sales
    WHERE id = '93000000-0000-0000-0000-000000000002'
)
LIMIT 1;


-- ============================================================
-- ORDERS
-- ============================================================

INSERT INTO orders (
    id, order_no, table_id, table_name,
    outlet_id, guest_count, items,
    total, status,
    cashier_id, cashier_name,
    opened_at
)
SELECT
    '94000000-0000-0000-0000-000000000001',
    'ORD-20260826-0001',
    '60000000-0000-0000-0000-000000000003',
    'Meja 03',
    '10000000-0000-0000-0000-000000000001',
    3,
    '[
        {
            "product_id": "50000000-0000-0000-0000-000000000001",
            "name": "Dimsum Ayam",
            "qty": 2,
            "price": 25000
        },
        {
            "product_id": "50000000-0000-0000-0000-000000000006",
            "name": "Es Teh Manis",
            "qty": 3,
            "price": 8000
        }
    ]'::jsonb,
    74000,
    'open',
    u.id,
    u.name,
    now()
FROM users u
WHERE u.email = 'owner@republikdimsum.id'
AND NOT EXISTS (
    SELECT 1 FROM orders
    WHERE id = '94000000-0000-0000-0000-000000000001'
)
LIMIT 1;



COMMIT;
