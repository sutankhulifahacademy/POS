-- ============================================================
-- DATA FIX: Backfill outlet_id + Create test data per outlet
-- ============================================================

-- 1. BACKFILL attendance: assign to outlet 1 (where most users are assigned)
UPDATE attendance SET outlet_id = '10000000-0000-0000-0000-000000000001' WHERE outlet_id IS NULL;

-- 2. BACKFILL shifts: assign NULL outlet to outlet 1
UPDATE shifts SET outlet_id = '10000000-0000-0000-0000-000000000001' WHERE outlet_id IS NULL;

-- 3. BACKFILL stock_movements: assign NULL to outlet 1
UPDATE stock_movements SET outlet_id = '10000000-0000-0000-0000-000000000001' WHERE outlet_id IS NULL;

-- 4. BACKFILL purchase_orders: assign NULL to outlet 1
UPDATE purchase_orders SET outlet_id = '10000000-0000-0000-0000-000000000001' WHERE outlet_id IS NULL;

-- 5. Ensure outlet_stocks exist for all products in all outlets
INSERT INTO outlet_stocks (product_id, outlet_id, quantity)
SELECT p.id, o.id, 50
FROM products p
CROSS JOIN outlets o
WHERE NOT EXISTS (
    SELECT 1 FROM outlet_stocks os
    WHERE os.product_id = p.id AND os.outlet_id = o.id
)
ON CONFLICT DO NOTHING;

-- 6. Create test dine-in tables for outlets 2 and 3
INSERT INTO tables (id, outlet_id, name, capacity, status, zone)
SELECT
    uuid_generate_v4(),
    o.id,
    'Meja ' || gs.idx,
    CASE WHEN gs.idx <= 5 THEN 4 ELSE 6 END,
    'available',
    'Dine In'
FROM outlets o
CROSS JOIN generate_series(1, 10) AS gs(idx)
WHERE o.id IN ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003')
ON CONFLICT DO NOTHING;

-- 7. Create test sales for outlet 2 and 3 (dine-in and takeaway)
-- Get some product IDs
DO $$
DECLARE
    p1 uuid; p2 uuid; p3 uuid; p4 uuid;
    o2 uuid := '10000000-0000-0000-0000-000000000002';
    o3 uuid := '10000000-0000-0000-0000-000000000003';
    i int;
    sid uuid;
    items_json jsonb;
    total_amt numeric;
BEGIN
    SELECT id INTO p1 FROM products WHERE is_active = TRUE ORDER BY created_at LIMIT 1;
    SELECT id INTO p2 FROM products WHERE is_active = TRUE ORDER BY created_at OFFSET 1 LIMIT 1;
    SELECT id INTO p3 FROM products WHERE is_active = TRUE ORDER BY created_at OFFSET 2 LIMIT 1;
    SELECT id INTO p4 FROM products WHERE is_active = TRUE ORDER BY created_at OFFSET 3 LIMIT 1;

    -- Outlet 2: 15 sales (mix of dine-in and takeaway)
    FOR i IN 1..15 LOOP
        sid := uuid_generate_v4();
        total_amt := 25000 + (random() * 100000);
        items_json := jsonb_build_array(
            jsonb_build_object('product_id', p1, 'name', 'Dimsum Ayam', 'price', 25000, 'quantity', 1 + floor(random()*3)),
            jsonb_build_object('product_id', p2, 'name', 'Dimsum Udang', 'price', 30000, 'quantity', 1 + floor(random()*2))
        );

        INSERT INTO sales (id, invoice_no, outlet_id, cashier_id, cashier_name, items, subtotal, tax, discount, total,
                          payment_method, source, table_name, shift_id, created_at)
        VALUES (
            sid,
            'INV-O2-' || lpad(i::text, 4, '0'),
            o2,
            '00000000-0000-0000-0000-000000000e01',
            'Budi Santoso',
            items_json,
            total_amt,
            total_amt * 0.11,
            0,
            total_amt * 1.11,
            CASE WHEN i % 2 = 0 THEN 'cash' ELSE 'qris' END,
            CASE WHEN i % 3 = 0 THEN 'dine_in' ELSE 'takeaway' END,
            CASE WHEN i % 3 = 0 THEN 'Meja ' || (i % 5 + 1) ELSE NULL END,
            NULL,
            NOW() - (i || ' hours')::interval
        );
    END LOOP;

    -- Outlet 3: 10 sales (mix of dine-in and takeaway)
    FOR i IN 1..10 LOOP
        sid := uuid_generate_v4();
        total_amt := 20000 + (random() * 80000);
        items_json := jsonb_build_array(
            jsonb_build_object('product_id', p3, 'name', 'Dimsum Spesial', 'price', 35000, 'quantity', 1 + floor(random()*2)),
            jsonb_build_object('product_id', p4, 'name', 'Es Teh', 'price', 10000, 'quantity', 1 + floor(random()*3))
        );

        INSERT INTO sales (id, invoice_no, outlet_id, cashier_id, cashier_name, items, subtotal, tax, discount, total,
                          payment_method, source, table_name, shift_id, created_at)
        VALUES (
            sid,
            'INV-O3-' || lpad(i::text, 4, '0'),
            o3,
            '00000000-0000-0000-0000-000000000e01',
            'Budi Santoso',
            items_json,
            total_amt,
            total_amt * 0.11,
            0,
            total_amt * 1.11,
            CASE WHEN i % 2 = 0 THEN 'cash' ELSE 'card' END,
            CASE WHEN i % 3 = 0 THEN 'dine_in' ELSE 'takeaway' END,
            CASE WHEN i % 3 = 0 THEN 'Meja ' || (i % 5 + 1) ELSE NULL END,
            NULL,
            NOW() - (i || ' hours')::interval
        );
    END LOOP;
END $$;

-- 8. Create test attendance for outlet 2 and 3
INSERT INTO attendance (id, cashier_id, cashier_name, outlet_id, clock_in_at, clock_in_photo, clock_in_note, status, duration_minutes)
SELECT
    uuid_generate_v4(),
    u.id,
    u.name,
    o.id,
    NOW() - (gs.idx || ' days')::interval - '8 hours'::interval,
    '',
    'Test attendance',
    'completed',
    480
FROM users u
CROSS JOIN outlets o
CROSS JOIN generate_series(1, 5) AS gs(idx)
WHERE o.id IN ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003')
AND u.role IN ('kasir', 'manager', 'supervisor')
ON CONFLICT DO NOTHING;

-- 9. Create test shifts for outlet 2 and 3
INSERT INTO shifts (id, cashier_id, cashier_name, outlet_id, opening_cash, status, opened_at, closed_at, actual_cash, expected_cash, difference, transaction_count, close_note)
SELECT
    uuid_generate_v4(),
    u.id,
    u.name,
    o.id,
    500000,
    'closed',
    NOW() - (gs.idx || ' days')::interval - '8 hours'::interval,
    NOW() - (gs.idx || ' days')::interval,
    750000,
    740000,
    10000,
    5,
    'Test shift'
FROM users u
CROSS JOIN outlets o
CROSS JOIN generate_series(1, 3) AS gs(idx)
WHERE o.id IN ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003')
AND u.role IN ('kasir', 'manager')
ON CONFLICT DO NOTHING;

-- 10. Create test expenses for outlet 2 and 3
INSERT INTO expenses (id, outlet_id, category, description, amount, expense_date, payment_method, vendor, created_by, created_at)
SELECT
    uuid_generate_v4(),
    o.id,
    CASE gs.idx % 4 WHEN 0 THEN 'rent' WHEN 1 THEN 'utilities' WHEN 2 THEN 'supplies' ELSE 'salary' END,
    CASE gs.idx % 4 WHEN 0 THEN 'Sewa bulanan' WHEN 1 THEN 'Listrik PLN' WHEN 2 THEN 'Supplies dapur' ELSE 'Gaji karyawan' END,
    CASE gs.idx % 4 WHEN 0 THEN 5000000 WHEN 1 THEN 1200000 WHEN 2 THEN 800000 ELSE 3500000 END,
    (NOW() - (gs.idx || ' days')::interval)::date,
    CASE gs.idx % 2 WHEN 0 THEN 'transfer' ELSE 'cash' END,
    CASE gs.idx % 4 WHEN 0 THEN 'Pemilik' WHEN 1 THEN 'PLN' WHEN 2 THEN 'Mitra Sejati' ELSE 'Payroll' END,
    '00000000-0000-0000-0000-000000000e01',
    NOW() - (gs.idx || ' days')::interval
FROM outlets o
CROSS JOIN generate_series(1, 8) AS gs(idx)
WHERE o.id IN ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003')
ON CONFLICT DO NOTHING;

-- 11. Create test purchase orders for outlet 2 and 3
INSERT INTO purchase_orders (id, po_no, supplier_id, supplier_name, items, total, status, note, created_by, outlet_id, created_at)
SELECT
    uuid_generate_v4(),
    'PO-O' || CASE WHEN o.id = '10000000-0000-0000-0000-000000000002' THEN '2' ELSE '3' END || '-' || lpad(gs.idx::text, 3, '0'),
    sup.id,
    sup.name,
    jsonb_build_array(
        jsonb_build_object('product_id', p.id, 'name', p.name, 'quantity', 20, 'cost', p.cost, 'price', p.price)
    ),
    p.cost * 20,
    'draft',
    'Test PO',
    '00000000-0000-0000-0000-000000000e01',
    o.id,
    NOW() - (gs.idx || ' days')::interval
FROM outlets o
CROSS JOIN generate_series(1, 3) AS gs(idx)
CROSS JOIN LATERAL (SELECT id, name FROM suppliers LIMIT 1) sup
CROSS JOIN LATERAL (SELECT id, name, cost, price FROM products WHERE is_active = TRUE ORDER BY created_at OFFSET gs.idx LIMIT 1) p
WHERE o.id IN ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003')
ON CONFLICT DO NOTHING;
