-- ============================================================
-- MIGRATION v2.3 — Phase 10-18: Receipt, Loyalty, KDS, Stock Adj,
--   Tax, Discount, Schedule, Payroll, Mobile Dashboard
-- ============================================================

-- ============ PHASE 10: Receipt/Invoice Customization ============
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS receipt_header TEXT;
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS receipt_footer TEXT;
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS receipt_logo VARCHAR(500);
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS receipt_show_cashier BOOLEAN DEFAULT TRUE;
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS receipt_show_shift BOOLEAN DEFAULT TRUE;
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS receipt_paper_width VARCHAR(10) DEFAULT '80mm';
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS receipt_font_size VARCHAR(10) DEFAULT 'small';

-- Set default receipt text for existing outlets
UPDATE outlets SET
    receipt_header = COALESCE(receipt_header, 'Terima kasih atas kunjungan Anda'),
    receipt_footer = COALESCE(receipt_footer, 'Simpan struk ini sebagai bukti pembayaran')
WHERE receipt_header IS NULL AND receipt_footer IS NULL;

-- ============ PHASE 11: Customer Loyalty ============
CREATE TABLE IF NOT EXISTS customer_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL,
    outlet_id UUID,
    tier VARCHAR(20) DEFAULT 'bronze',
    points INTEGER DEFAULT 0,
    total_spent NUMERIC(14,2) DEFAULT 0,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(customer_id, outlet_id)
);
CREATE INDEX IF NOT EXISTS idx_cm_customer ON customer_memberships(customer_id);
CREATE INDEX IF NOT EXISTS idx_cm_tier ON customer_memberships(tier);

CREATE TABLE IF NOT EXISTS point_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL,
    outlet_id UUID,
    sale_id UUID,
    points_change INTEGER NOT NULL,
    reason VARCHAR(100),
    balance_after INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pt_customer ON point_transactions(customer_id, created_at DESC);

-- ============ PHASE 12: Kitchen Display System (KDS) ============
CREATE TABLE IF NOT EXISTS kitchen_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id UUID,
    sale_id UUID,
    invoice_no VARCHAR(100),
    table_no VARCHAR(50),
    items JSONB NOT NULL DEFAULT '[]',
    status VARCHAR(20) DEFAULT 'new',
    priority INTEGER DEFAULT 0,
    assigned_to UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    elapsed_seconds INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ko_outlet_status ON kitchen_orders(outlet_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_ko_sale ON kitchen_orders(sale_id);

-- ============ PHASE 13: Stock Adjustment with Reason ============
-- stock_movements already has reason column, add more structured fields
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS outlet_id UUID;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS adjustment_type VARCHAR(20) DEFAULT 'restock';
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS reference_no VARCHAR(100);
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS approved_by UUID;

-- ============ PHASE 14: Tax Configuration per Outlet ============
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS tax_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) DEFAULT 11.00;
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS tax_name VARCHAR(50) DEFAULT 'PPN';
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS tax_inclusive BOOLEAN DEFAULT FALSE;
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS service_charge_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS service_charge_rate NUMERIC(5,2) DEFAULT 5.00;

-- ============ PHASE 15: Discount/Coupon Management ============
CREATE TABLE IF NOT EXISTS coupons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id UUID,
    code VARCHAR(50) NOT NULL,
    description TEXT,
    discount_type VARCHAR(20) NOT NULL DEFAULT 'percentage',
    discount_value NUMERIC(14,2) NOT NULL DEFAULT 0,
    min_purchase NUMERIC(14,2) DEFAULT 0,
    max_discount NUMERIC(14,2),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    usage_limit INTEGER,
    usage_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coupons_outlet ON coupons(outlet_id, is_active);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);

-- ============ PHASE 16: Employee Scheduling ============
CREATE TABLE IF NOT EXISTS employee_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id UUID,
    user_id UUID NOT NULL,
    user_name VARCHAR(255),
    day_of_week INTEGER NOT NULL,
    start_time VARCHAR(5) NOT NULL,
    end_time VARCHAR(5) NOT NULL,
    role VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_es_outlet_day ON employee_schedules(outlet_id, day_of_week, is_active);
CREATE INDEX IF NOT EXISTS idx_es_user ON employee_schedules(user_id);

-- ============ PHASE 17: Payroll ============
CREATE TABLE IF NOT EXISTS payroll_periods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id UUID,
    period_name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'draft',
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pp_outlet ON payroll_periods(outlet_id, start_date);

CREATE TABLE IF NOT EXISTS payroll_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payroll_period_id UUID NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    user_name VARCHAR(255),
    outlet_id UUID,
    base_salary NUMERIC(14,2) DEFAULT 0,
    overtime_hours NUMERIC(5,2) DEFAULT 0,
    overtime_pay NUMERIC(14,2) DEFAULT 0,
    attendance_days INTEGER DEFAULT 0,
    attendance_bonus NUMERIC(14,2) DEFAULT 0,
    deductions NUMERIC(14,2) DEFAULT 0,
    net_pay NUMERIC(14,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pi_period ON payroll_items(payroll_period_id);
CREATE INDEX IF NOT EXISTS idx_pi_user ON payroll_items(user_id);

-- ============ PHASE 18: Mobile Dashboard (no schema needed, uses existing) ============
-- Mobile dashboard uses existing dashboard endpoints with mobile-optimized frontend

-- ============ PERMISSIONS ============
INSERT INTO role_permissions (role_id, module, action, granted)
SELECT '00000000-0000-0000-0000-000000000a00', m, a, TRUE
FROM (VALUES
    ('receipt', 'view'), ('receipt', 'update'),
    ('loyalty', 'view'), ('loyalty', 'create'), ('loyalty', 'update'),
    ('kds', 'view'), ('kds', 'update'),
    ('stock_adjust', 'view'), ('stock_adjust', 'create'),
    ('tax', 'view'), ('tax', 'update'),
    ('coupons', 'view'), ('coupons', 'create'), ('coupons', 'update'), ('coupons', 'delete'),
    ('schedules', 'view'), ('schedules', 'create'), ('schedules', 'update'),
    ('payroll', 'view'), ('payroll', 'create'), ('payroll', 'update')
) AS v(m, a)
ON CONFLICT (role_id, module, action) DO NOTHING;

-- Admin gets same as owner
INSERT INTO role_permissions (role_id, module, action, granted)
SELECT '00000000-0000-0000-0000-000000000a01', m, a, TRUE
FROM (VALUES
    ('receipt', 'view'), ('receipt', 'update'),
    ('loyalty', 'view'), ('loyalty', 'create'), ('loyalty', 'update'),
    ('kds', 'view'), ('kds', 'update'),
    ('stock_adjust', 'view'), ('stock_adjust', 'create'),
    ('tax', 'view'),
    ('coupons', 'view'), ('coupons', 'create'), ('coupons', 'update'),
    ('schedules', 'view'), ('schedules', 'create'), ('schedules', 'update'),
    ('payroll', 'view')
) AS v(m, a)
ON CONFLICT (role_id, module, action) DO NOTHING;

-- Manager gets view + limited create
INSERT INTO role_permissions (role_id, module, action, granted)
SELECT '00000000-0000-0000-0000-000000000a02', m, a, TRUE
FROM (VALUES
    ('receipt', 'view'),
    ('loyalty', 'view'),
    ('kds', 'view'), ('kds', 'update'),
    ('stock_adjust', 'view'), ('stock_adjust', 'create'),
    ('tax', 'view'),
    ('coupons', 'view'),
    ('schedules', 'view'), ('schedules', 'create'),
    ('payroll', 'view')
) AS v(m, a)
ON CONFLICT (role_id, module, action) DO NOTHING;

-- ============ MENUS ============
INSERT INTO menus (id, name, label, description, route, icon, sort_order) VALUES
('00000000-0000-0000-0000-000000000b22', 'loyalty', 'Loyalty', 'Program loyalitas pelanggan', '/loyalty', 'Award', 21),
('00000000-0000-0000-0000-000000000b23', 'kds', 'Kitchen Display', 'Antrian pesanan dapur', '/kds', 'ChefHat', 22),
('00000000-0000-0000-0000-000000000b24', 'coupons', 'Kupon', 'Manajemen kupon diskon', '/coupons', 'Ticket', 23),
('00000000-0000-0000-0000-000000000b25', 'schedules', 'Jadwal Shift', 'Penjadwalan karyawan', '/schedules', 'Calendar', 24),
('00000000-0000-0000-0000-000000000b26', 'payroll', 'Payroll', 'Penggajian karyawan', '/payroll', 'Banknote', 25)
ON CONFLICT (name) DO NOTHING;

-- Owner sees all new menus
INSERT INTO role_menus (role_id, menu_id, is_visible)
SELECT '00000000-0000-0000-0000-000000000a00', id, TRUE FROM menus
WHERE name IN ('loyalty', 'kds', 'coupons', 'schedules', 'payroll')
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- Admin sees all new menus
INSERT INTO role_menus (role_id, menu_id, is_visible)
SELECT '00000000-0000-0000-0000-000000000a01', id, TRUE FROM menus
WHERE name IN ('loyalty', 'kds', 'coupons', 'schedules', 'payroll')
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- Manager sees kds, schedules, payroll
INSERT INTO role_menus (role_id, menu_id, is_visible)
SELECT '00000000-0000-0000-0000-000000000a02', id, TRUE FROM menus
WHERE name IN ('kds', 'schedules', 'payroll')
ON CONFLICT (role_id, menu_id) DO NOTHING;
