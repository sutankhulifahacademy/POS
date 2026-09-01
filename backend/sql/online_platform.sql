-- ============================================================
-- MIGRATION: Online Marketplace Profit Analysis
-- Platforms: GrabFood, GoFood, ShopeeFood (extensible)
-- Non-destructive: adds new tables, does NOT modify existing tables
-- ============================================================

-- ============ ONLINE PLATFORMS ============
CREATE TABLE IF NOT EXISTS online_platforms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(30) UNIQUE NOT NULL,          -- grabfood, gofood, shopeefood
    name VARCHAR(100) NOT NULL,                -- GrabFood, GoFood, ShopeeFood
    is_active BOOLEAN DEFAULT TRUE,
    icon VARCHAR(50) DEFAULT 'Smartphone',
    color VARCHAR(20) DEFAULT '#00B14F',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ PLATFORM FEE CONFIGS (with effective dates + outlet scope) ============
CREATE TABLE IF NOT EXISTS platform_fee_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    platform_id UUID NOT NULL REFERENCES online_platforms(id) ON DELETE CASCADE,
    outlet_id UUID,                            -- NULL = global default, specific UUID = outlet-specific
    -- Fee components
    commission_pct NUMERIC(5,2) DEFAULT 0,     -- percentage of gross sales
    fixed_fee NUMERIC(12,2) DEFAULT 0,         -- fixed fee per order
    tax_on_fee_pct NUMERIC(5,2) DEFAULT 0,     -- tax applied to commission + fixed fee
    promo_merchant_pct NUMERIC(5,2) DEFAULT 0, -- merchant-funded promo percentage
    promo_platform_pct NUMERIC(5,2) DEFAULT 0, -- platform-funded promo percentage (info only)
    advertising_fee NUMERIC(12,2) DEFAULT 0,   -- advertising cost per order
    other_fee_pct NUMERIC(5,2) DEFAULT 0,      -- other percentage-based fee
    other_fixed_fee NUMERIC(12,2) DEFAULT 0,   -- other fixed fee
    -- Fee calculation base
    fee_calc_base VARCHAR(20) DEFAULT 'gross', -- gross, after_merchant_discount, net, settlement_defined
    -- Effective dates (history preservation)
    effective_date DATE NOT NULL,
    end_date DATE,                             -- NULL = currently active
    is_active BOOLEAN DEFAULT TRUE,
    note TEXT DEFAULT '',
    created_by UUID,
    created_by_name VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pfc_platform ON platform_fee_configs(platform_id);
CREATE INDEX IF NOT EXISTS idx_pfc_outlet ON platform_fee_configs(outlet_id);
CREATE INDEX IF NOT EXISTS idx_pfc_effective ON platform_fee_configs(effective_date, end_date);

-- ============ ONLINE ORDERS ============
CREATE TABLE IF NOT EXISTS online_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_no VARCHAR(50) UNIQUE NOT NULL,
    platform_id UUID NOT NULL REFERENCES online_platforms(id) ON DELETE RESTRICT,
    platform_name VARCHAR(100),
    outlet_id UUID,
    outlet_name VARCHAR(255),
    -- Sales info
    gross_sales NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_quantity INTEGER NOT NULL DEFAULT 0,
    -- Fee breakdown (snapshot at order time)
    commission_amount NUMERIC(14,2) DEFAULT 0,
    fixed_fee NUMERIC(14,2) DEFAULT 0,
    tax_on_fee NUMERIC(14,2) DEFAULT 0,
    merchant_promo NUMERIC(14,2) DEFAULT 0,
    platform_promo NUMERIC(14,2) DEFAULT 0,
    advertising_fee NUMERIC(14,2) DEFAULT 0,
    other_fee NUMERIC(14,2) DEFAULT 0,
    total_deduction NUMERIC(14,2) DEFAULT 0,
    -- Settlement
    expected_settlement NUMERIC(14,2) DEFAULT 0,
    actual_settlement NUMERIC(14,2),
    settlement_variance NUMERIC(14,2),
    settlement_status VARCHAR(20) DEFAULT 'pending',  -- pending, matched, variance
    settlement_date DATE,
    settlement_note TEXT DEFAULT '',
    -- COGS + Profit
    total_cogs NUMERIC(14,2) DEFAULT 0,
    gross_profit NUMERIC(14,2) DEFAULT 0,
    profit_margin NUMERIC(5,2) DEFAULT 0,
    effective_fee_pct NUMERIC(5,2) DEFAULT 0,
    -- Fee config snapshot
    fee_config_id UUID,
    fee_config_snapshot JSONB DEFAULT '{}'::jsonb,
    -- Metadata
    customer_name VARCHAR(255),
    platform_order_ref VARCHAR(100),           -- order ref from platform
    note TEXT DEFAULT '',
    status VARCHAR(20) DEFAULT 'completed',    -- draft, completed, reconciled
    created_by UUID,
    created_by_name VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oo_platform ON online_orders(platform_id);
CREATE INDEX IF NOT EXISTS idx_oo_outlet ON online_orders(outlet_id);
CREATE INDEX IF NOT EXISTS idx_oo_status ON online_orders(status);
CREATE INDEX IF NOT EXISTS idx_oo_created ON online_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oo_settlement_status ON online_orders(settlement_status);

-- ============ ONLINE ORDER ITEMS ============
CREATE TABLE IF NOT EXISTS online_order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES online_orders(id) ON DELETE CASCADE,
    product_id UUID,
    product_name VARCHAR(255) NOT NULL,
    variant_name VARCHAR(255),
    sku VARCHAR(100),
    online_price NUMERIC(12,2) NOT NULL DEFAULT 0,  -- online price per unit
    cost NUMERIC(12,2) DEFAULT 0,                    -- HPP per unit
    quantity INTEGER NOT NULL DEFAULT 1,
    gross_sales NUMERIC(14,2) DEFAULT 0,             -- online_price * quantity
    cogs NUMERIC(14,2) DEFAULT 0,                    -- cost * quantity
    profit NUMERIC(14,2) DEFAULT 0,                  -- (settlement portion - cogs) — calculated
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ooi_order ON online_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_ooi_product ON online_order_items(product_id);

-- ============ SEED DEFAULT PLATFORMS ============
INSERT INTO online_platforms (id, code, name, is_active, icon, color, sort_order)
VALUES
    ('70000000-0000-0000-0000-000000000001', 'grabfood', 'GrabFood', TRUE, 'Smartphone', '#00B14F', 1),
    ('70000000-0000-0000-0000-000000000002', 'gofood', 'GoFood', TRUE, 'Utensils', '#E11931', 2),
    ('70000000-0000-0000-0000-000000000003', 'shopeefood', 'ShopeeFood', TRUE, 'ShoppingBag', '#EE4D2D', 3)
ON CONFLICT (code) DO NOTHING;

-- ============ SEED DEFAULT FEE CONFIGS (estimation only, owner should adjust) ============
INSERT INTO platform_fee_configs (id, platform_id, outlet_id, commission_pct, fixed_fee, tax_on_fee_pct, fee_calc_base, effective_date, is_active, note)
SELECT gen_random_uuid(), p.id, NULL, 30, 0, 11, 'gross', '2026-01-01', TRUE, 'Default estimation — please adjust to actual contract'
FROM online_platforms p WHERE p.code = 'grabfood'
AND NOT EXISTS (SELECT 1 FROM platform_fee_configs WHERE platform_id = p.id AND outlet_id IS NULL);

INSERT INTO platform_fee_configs (id, platform_id, outlet_id, commission_pct, fixed_fee, tax_on_fee_pct, fee_calc_base, effective_date, is_active, note)
SELECT gen_random_uuid(), p.id, NULL, 20, 1000, 11, 'gross', '2026-01-01', TRUE, 'Default estimation — please adjust to actual contract'
FROM online_platforms p WHERE p.code = 'gofood'
AND NOT EXISTS (SELECT 1 FROM platform_fee_configs WHERE platform_id = p.id AND outlet_id IS NULL);

INSERT INTO platform_fee_configs (id, platform_id, outlet_id, commission_pct, fixed_fee, tax_on_fee_pct, fee_calc_base, effective_date, is_active, note)
SELECT gen_random_uuid(), p.id, NULL, 20, 0, 11, 'gross', '2026-01-01', TRUE, 'Default estimation — please adjust to actual contract'
FROM online_platforms p WHERE p.code = 'shopeefood'
AND NOT EXISTS (SELECT 1 FROM platform_fee_configs WHERE platform_id = p.id AND outlet_id IS NULL);

-- ============ PERMISSIONS ============
INSERT INTO role_permissions (id, role_id, module, action, granted)
SELECT gen_random_uuid(), r.id, 'online_platforms', a, TRUE
FROM roles r, (VALUES ('view'), ('create'), ('update'), ('delete')) AS v(a)
WHERE r.name IN ('owner', 'admin')
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.module = 'online_platforms' AND rp.action = v.a);

INSERT INTO role_permissions (id, role_id, module, action, granted)
SELECT gen_random_uuid(), r.id, 'online_platforms', 'view', TRUE
FROM roles r
WHERE r.name IN ('manager', 'supervisor')
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.module = 'online_platforms' AND rp.action = 'view');

-- ============ MENUS ============
INSERT INTO menus (id, name, label, description, route, icon, sort_order, is_active, actions)
SELECT '00000000-0000-0000-0000-000000000d01', 'online_platforms', 'Online Platform', 'Konfigurasi fee platform online (GrabFood, GoFood, ShopeeFood)', '/online-platforms', 'Smartphone', 26, TRUE, '["view","create","update","delete"]'
WHERE NOT EXISTS (SELECT 1 FROM menus WHERE route = '/online-platforms');

INSERT INTO menus (id, name, label, description, route, icon, sort_order, is_active, actions)
SELECT '00000000-0000-0000-0000-000000000d02', 'online_orders', 'Online Orders', 'Transaksi penjualan online + profit analysis', '/online-orders', 'ShoppingCart', 27, TRUE, '["view","create"]'
WHERE NOT EXISTS (SELECT 1 FROM menus WHERE route = '/online-orders');

INSERT INTO menus (id, name, label, description, route, icon, sort_order, is_active, actions)
SELECT '00000000-0000-0000-0000-000000000d03', 'online_profit', 'Online Profit', 'Laporan profitabilitas online marketplace', '/online-profit', 'TrendingUp', 28, TRUE, '["view"]'
WHERE NOT EXISTS (SELECT 1 FROM menus WHERE route = '/online-profit');

-- Assign menus to owner + admin
INSERT INTO role_menus (id, role_id, menu_id)
SELECT gen_random_uuid(), r.id, m.id
FROM roles r, menus m
WHERE m.route IN ('/online-platforms', '/online-orders', '/online-profit')
  AND r.name IN ('owner', 'admin')
  AND NOT EXISTS (SELECT 1 FROM role_menus rm WHERE rm.role_id = r.id AND rm.menu_id = m.id);

-- Assign online orders + profit view to manager + supervisor
INSERT INTO role_menus (id, role_id, menu_id)
SELECT gen_random_uuid(), r.id, m.id
FROM roles r, menus m
WHERE m.route IN ('/online-orders', '/online-profit')
  AND r.name IN ('manager', 'supervisor')
  AND NOT EXISTS (SELECT 1 FROM role_menus rm WHERE rm.role_id = r.id AND rm.menu_id = m.id);
