-- ==========================================================================
-- Sutan Khulifah POS - PostgreSQL Schema
-- Kompatibel dengan PostgreSQL 14+
-- Menggunakan JSONB untuk data embedded (variants, items) untuk fleksibilitas
-- Schema ini mencerminkan struktur database aktual
-- ==========================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- USERS
-- =============================================
CREATE TABLE IF NOT EXISTS users (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    email varchar(255) NOT NULL,
    name varchar(255) NOT NULL,
    role varchar(20) NOT NULL,
    password_hash text NOT NULL,
    is_active bool DEFAULT true NULL,
    created_at timestamptz DEFAULT now() NULL,
    updated_at timestamptz NULL,
    phone varchar(50) NULL,
    address text NULL,
    job_title varchar(100) NULL,
    photo text NULL,
    ktp_image text NULL,
    ktp_number varchar(100) NULL,
    CONSTRAINT users_email_key UNIQUE (email),
    CONSTRAINT users_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_users_email ON public.users USING btree (email);

-- =============================================
-- BUSINESS PROFILE
-- =============================================
CREATE TABLE IF NOT EXISTS business (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    business_type VARCHAR(20) NOT NULL,
    currency VARCHAR(10) DEFAULT 'IDR',
    tax_rate NUMERIC(5,2) DEFAULT 0,
    address TEXT,
    logo_url TEXT,
    primary_color VARCHAR(20) DEFAULT '#F4C842',
    secondary_color VARCHAR(20) DEFAULT '#C4A484',
    bg_color VARCHAR(20) DEFAULT '#1A0810',
    card_bg_color VARCHAR(20) DEFAULT '#331419',
    sidebar_bg_color VARCHAR(20) DEFAULT '#2A1015',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- =============================================
-- OUTLETS
-- =============================================
CREATE TABLE IF NOT EXISTS outlets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    address TEXT,
    phone VARCHAR(50),
    is_main BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    -- Receipt customization
    receipt_header TEXT,
    receipt_footer TEXT,
    receipt_logo VARCHAR(500),
    receipt_show_cashier BOOLEAN DEFAULT TRUE,
    receipt_show_shift BOOLEAN DEFAULT TRUE,
    receipt_paper_width VARCHAR(10) DEFAULT '80mm',
    receipt_font_size VARCHAR(10) DEFAULT 'small',
    -- Tax configuration
    tax_enabled BOOLEAN DEFAULT TRUE,
    tax_rate NUMERIC(5,2) DEFAULT 11.00,
    tax_name VARCHAR(50) DEFAULT 'PPN',
    tax_inclusive BOOLEAN DEFAULT FALSE,
    service_charge_enabled BOOLEAN DEFAULT FALSE,
    service_charge_rate NUMERIC(5,2) DEFAULT 5.00
);

-- =============================================
-- CATEGORIES
-- =============================================
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    color VARCHAR(20) DEFAULT '#D4AF37',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- =============================================
-- PRODUCTS (variants as JSONB for flexibility)
-- =============================================
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(100) UNIQUE NOT NULL,
    barcode VARCHAR(100),
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    price NUMERIC(12,2) NOT NULL,                -- EXISTING price (immutable from pricing feature)
    cost NUMERIC(12,2) DEFAULT 0,
    stock INTEGER DEFAULT 0,
    low_stock_threshold INTEGER DEFAULT 5,
    unit VARCHAR(50) DEFAULT 'pcs',
    image_url TEXT,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    variants JSONB DEFAULT '[]'::jsonb,
    -- Product type: standard, frozen, bundle
    product_type VARCHAR(20) DEFAULT 'standard',
    -- Additional pricing (nullable, fallback to price when NULL)
    retail_price NUMERIC(12,2),      -- Harga Eceran
    reseller_price NUMERIC(12,2),    -- Harga Reseller
    wholesale_price NUMERIC(12,2),   -- Harga Partai
    online_price NUMERIC(12,2),      -- Harga Online (wajib untuk semua product)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_products_category ON products(category_id);

-- =============================================
-- PER-OUTLET STOCK
-- =============================================
CREATE TABLE IF NOT EXISTS outlet_stocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
    quantity INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (product_id, outlet_id)
);
CREATE INDEX idx_outlet_stocks_outlet ON outlet_stocks(outlet_id);

-- =============================================
-- STOCK MOVEMENTS (audit log)
-- =============================================
CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL,
    product_name VARCHAR(255),
    delta INTEGER NOT NULL,
    reason VARCHAR(50) NOT NULL,
    note TEXT,
    outlet_id UUID,
    user_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    adjustment_type VARCHAR(20) DEFAULT 'restock',
    reference_no VARCHAR(100),
    approved_by UUID
);
CREATE INDEX idx_movements_product ON stock_movements(product_id, created_at DESC);
CREATE INDEX idx_movements_created ON stock_movements(created_at DESC);

-- =============================================
-- PAYMENT ACCOUNTS (rekening bank untuk transfer)
-- =============================================
CREATE TABLE IF NOT EXISTS payment_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_name VARCHAR(100) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    account_no VARCHAR(100) NOT NULL,
    outlet_id UUID REFERENCES outlets(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- SALES (invoice + line items as JSONB)
-- =============================================
CREATE TABLE IF NOT EXISTS sales (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    invoice_no varchar(50) NOT NULL,
    shift_id uuid NULL,
    outlet_id uuid NULL,
    customer_id uuid NULL,
    cashier_id uuid NULL,
    cashier_name varchar(255) NULL,
    items jsonb NOT NULL,
    subtotal numeric(14, 2) NOT NULL,
    discount numeric(14, 2) DEFAULT 0 NULL,
    tax numeric(14, 2) DEFAULT 0 NULL,
    total numeric(14, 2) NOT NULL,
    payment_method varchar(20) NULL,
    amount_paid numeric(14, 2) NULL,
    change_amount numeric(14, 2) NULL,
    source varchar(20) DEFAULT 'pos' NULL,
    table_id uuid NULL,
    table_name varchar(100) NULL,
    note text NULL,
    created_at timestamptz DEFAULT now() NULL,
    card_type varchar(20) NULL,
    card_brand varchar(50) NULL,
    card_last4 varchar(4) NULL,
    card_reference_no varchar(100) NULL,
    card_approval_code varchar(100) NULL,
    card_terminal_id varchar(100) NULL,
    transfer_bank varchar(100) NULL,
    transfer_account_name varchar(150) NULL,
    transfer_account_no varchar(100) NULL,
    transfer_reference_no varchar(150) NULL,
    transfer_sender_name varchar(150) NULL,
    transfer_verified bool DEFAULT false NOT NULL,
    payment_reference varchar(150) NULL,
    -- Pricing channel + price type for additional pricing
    sales_channel varchar(10) DEFAULT 'offline',   -- offline, online
    price_type varchar(10) DEFAULT 'ecceran',       -- ecceran, reseller, partai, online
    CONSTRAINT sales_invoice_no_key UNIQUE (invoice_no),
    CONSTRAINT sales_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_sales_created ON public.sales USING btree (created_at DESC);
CREATE INDEX idx_sales_outlet_created ON public.sales USING btree (outlet_id, created_at DESC);
CREATE INDEX idx_sales_shift ON public.sales USING btree (shift_id);

-- =============================================
-- SHIFTS (kasir open/close)
-- =============================================
CREATE TABLE IF NOT EXISTS shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cashier_id UUID NOT NULL,
    cashier_name VARCHAR(255),
    outlet_id UUID,
    opening_cash NUMERIC(14,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'open',
    opened_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    actual_cash NUMERIC(14,2),
    expected_cash NUMERIC(14,2),
    difference NUMERIC(14,2),
    cash_sales NUMERIC(14,2) DEFAULT 0,
    non_cash_sales NUMERIC(14,2) DEFAULT 0,
    transaction_count INTEGER DEFAULT 0,
    note TEXT,
    close_note TEXT
);
CREATE INDEX idx_shifts_cashier_status ON shifts(cashier_id, status);

-- =============================================
-- CUSTOMERS
-- =============================================
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    loyalty_points INTEGER DEFAULT 0,
    total_spent NUMERIC(14,2) DEFAULT 0,
    visit_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- =============================================
-- SUPPLIERS
-- =============================================
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- =============================================
-- PURCHASE ORDERS
-- =============================================
CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    po_no VARCHAR(50) UNIQUE NOT NULL,
    supplier_id UUID,
    supplier_name VARCHAR(255),
    items JSONB NOT NULL,
    total NUMERIC(14,2),
    status VARCHAR(20) DEFAULT 'draft',
    note TEXT,
    created_by UUID,
    outlet_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    received_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_outlet ON purchase_orders(outlet_id, created_at DESC);

-- =============================================
-- STOCK TRANSFERS
-- =============================================
CREATE TABLE IF NOT EXISTS stock_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transfer_no VARCHAR(50) UNIQUE NOT NULL,
    from_outlet_id UUID,
    to_outlet_id UUID,
    from_outlet_name VARCHAR(255),
    to_outlet_name VARCHAR(255),
    items JSONB NOT NULL,
    total_quantity INTEGER,
    note TEXT,
    status VARCHAR(20) DEFAULT 'completed',
    created_by UUID,
    created_by_name VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- Transfer approval lifecycle
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    -- Link to stock request (if transfer came from request)
    request_id UUID,
    delivery_note_id UUID,
    -- Shipping info
    shipped_by UUID,
    shipped_by_name VARCHAR(255),
    shipped_at TIMESTAMPTZ
);

-- =============================================
-- TABLES (F&B dine-in)
-- =============================================
CREATE TABLE IF NOT EXISTS tables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    capacity INTEGER DEFAULT 2,
    outlet_id UUID,
    zone VARCHAR(100) DEFAULT 'Utama',
    status VARCHAR(20) DEFAULT 'available',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- =============================================
-- ORDERS (dine-in open orders)
-- =============================================
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_no VARCHAR(50) NOT NULL,
    table_id UUID REFERENCES tables(id),
    table_name VARCHAR(100),
    outlet_id UUID,
    guest_count INTEGER DEFAULT 1,
    items JSONB DEFAULT '[]'::jsonb,
    total NUMERIC(14,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'open',
    cashier_id UUID,
    cashier_name VARCHAR(255),
    sale_id UUID,
    opened_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
CREATE INDEX idx_orders_table_status ON orders(table_id, status);

-- =============================================
-- QRIS ORDERS (Midtrans payment tracking)
-- =============================================
CREATE SEQUENCE IF NOT EXISTS qris_orders_id_seq;
CREATE TABLE IF NOT EXISTS qris_orders (
    id INTEGER PRIMARY KEY DEFAULT nextval('qris_orders_id_seq'),
    order_id VARCHAR(100) UNIQUE NOT NULL,
    amount INTEGER NOT NULL,
    description TEXT,
    transaction_id VARCHAR(100),
    status VARCHAR(30) DEFAULT 'pending',
    fraud_status VARCHAR(20),
    qr_string TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- =============================================
-- CARD BRANDS (bank/brand untuk pembayaran kartu)
-- =============================================
CREATE TABLE IF NOT EXISTS card_brands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- ATTENDANCE (absensi karyawan)
-- =============================================
CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cashier_id UUID,
    cashier_name TEXT,
    clock_in_at TIMESTAMPTZ,
    clock_in_photo TEXT,
    clock_in_note TEXT,
    clock_out_at TIMESTAMPTZ,
    clock_out_photo TEXT,
    clock_out_note TEXT,
    duration_minutes INTEGER,
    shift_id UUID,
    status TEXT DEFAULT 'active',
    outlet_id UUID
);
CREATE INDEX IF NOT EXISTS idx_attendance_outlet ON attendance(outlet_id, clock_in_at DESC);

-- =============================================
-- ROLES (manajemen role)
-- =============================================
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) UNIQUE NOT NULL,
    label VARCHAR(100) NOT NULL,
    description TEXT,
    is_system BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- ROLE PERMISSIONS (module/action per role)
-- =============================================
CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    module VARCHAR(50) NOT NULL,
    action VARCHAR(20) NOT NULL,
    granted BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(role_id, module, action)
);

-- =============================================
-- MENUS (dynamic menu items for sidebar)
-- =============================================
CREATE TABLE IF NOT EXISTS menus (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) UNIQUE NOT NULL,
    label VARCHAR(100) NOT NULL,
    description TEXT,
    route VARCHAR(100) NOT NULL,
    icon VARCHAR(50) DEFAULT 'Circle',
    sort_order INTEGER DEFAULT 0,
    parent_id UUID REFERENCES menus(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE,
    actions JSONB DEFAULT '["view"]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- ROLE MENUS (which menus are visible per role)
-- =============================================
CREATE TABLE IF NOT EXISTS role_menus (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    menu_id UUID NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
    is_visible BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(role_id, menu_id)
);

-- =============================================
-- USER OUTLET ACCESS (multi-outlet authorization)
-- =============================================
CREATE TABLE IF NOT EXISTS user_outlet_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    outlet_id UUID NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, outlet_id)
);
CREATE INDEX IF NOT EXISTS idx_user_outlet_access_user ON user_outlet_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_outlet_access_outlet ON user_outlet_access(outlet_id);

-- =============================================
-- AUDIT LOGS (audit trail for all important actions)
-- =============================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    user_name VARCHAR(255),
    role VARCHAR(50),
    outlet_id UUID,
    action VARCHAR(50) NOT NULL,
    entity VARCHAR(50) NOT NULL,
    entity_id VARCHAR(255),
    old_value JSONB,
    new_value JSONB,
    ip VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_outlet ON audit_logs(outlet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- =============================================
-- LEAVE REQUESTS (cuti/izin management)
-- =============================================
CREATE TABLE IF NOT EXISTS leave_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    user_name VARCHAR(255),
    outlet_id UUID,
    leave_type VARCHAR(20) NOT NULL DEFAULT 'izin',
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    approved_by UUID,
    approved_by_name VARCHAR(255),
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leave_requests_user ON leave_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leave_requests_outlet ON leave_requests(outlet_id, status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status, start_date);

-- =============================================
-- ALERTS (notification/alert center)
-- =============================================
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id UUID,
    category VARCHAR(30) NOT NULL,
    severity VARCHAR(10) NOT NULL DEFAULT 'info',
    title VARCHAR(255) NOT NULL,
    message TEXT,
    data JSONB DEFAULT '{}'::jsonb,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alerts_outlet ON alerts(outlet_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_category ON alerts(category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity, is_read, created_at DESC);

-- =============================================
-- EXPENSES (operational expense tracking per outlet)
-- =============================================
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    outlet_id UUID REFERENCES outlets(id) ON DELETE SET NULL,
    category VARCHAR(50) NOT NULL,
    description TEXT,
    amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method VARCHAR(20) DEFAULT 'cash',
    vendor VARCHAR(255),
    receipt_no VARCHAR(100),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expenses_outlet ON expenses(outlet_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date DESC);

-- =============================================
-- CUSTOMER MEMBERSHIPS (loyalty per outlet)
-- =============================================
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

-- =============================================
-- POINT TRANSACTIONS (loyalty point log)
-- =============================================
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

-- =============================================
-- KITCHEN ORDERS (KDS)
-- =============================================
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

-- =============================================
-- COUPONS (discount management)
-- =============================================
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

-- =============================================
-- EMPLOYEE SCHEDULES (shift scheduling)
-- =============================================
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

-- =============================================
-- PAYROLL PERIODS
-- =============================================
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

-- =============================================
-- PAYROLL ITEMS
-- =============================================
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

-- =============================================
-- TRANSFER ITEMS (item-level approval)
-- =============================================
CREATE TABLE IF NOT EXISTS transfer_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transfer_id UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    qty_sent INT NOT NULL DEFAULT 0,
    qty_received INT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, checked, approved, rejected
    note TEXT DEFAULT '',
    checked_by UUID,
    checked_by_name VARCHAR(255),
    checked_at TIMESTAMPTZ,
    approved_by UUID,
    approved_by_name VARCHAR(255),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transfer_items_transfer_id ON transfer_items(transfer_id);
CREATE INDEX IF NOT EXISTS idx_transfer_items_status ON transfer_items(status);

-- =============================================
-- STOCK REQUESTS (cabang -> pusat)
-- =============================================
CREATE TABLE IF NOT EXISTS stock_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_no VARCHAR(50) UNIQUE NOT NULL,
    requesting_outlet_id UUID NOT NULL,
    requesting_outlet_name VARCHAR(255),
    status VARCHAR(30) NOT NULL DEFAULT 'draft',  -- draft, submitted, approved, partially_approved, rejected, converted
    priority VARCHAR(20) NOT NULL DEFAULT 'normal',  -- normal, urgent
    note TEXT DEFAULT '',
    created_by UUID,
    created_by_name VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    submitted_at TIMESTAMPTZ,
    reviewed_by UUID,
    reviewed_by_name VARCHAR(255),
    reviewed_at TIMESTAMPTZ,
    review_note TEXT DEFAULT '',
    converted_transfer_id UUID,  -- link to stock_transfers.id after conversion
    converted_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_requests_outlet ON stock_requests(requesting_outlet_id);
CREATE INDEX IF NOT EXISTS idx_stock_requests_status ON stock_requests(status);

-- =============================================
-- STOCK REQUEST ITEMS
-- =============================================
CREATE TABLE IF NOT EXISTS stock_request_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL REFERENCES stock_requests(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    sku VARCHAR(100),
    qty_requested INT NOT NULL DEFAULT 0,
    qty_approved INT,           -- set by reviewer (partial approval)
    stock_at_center INT,        -- snapshot of stock at center when reviewed
    status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, approved, rejected
    note TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_request_items_request ON stock_request_items(request_id);

-- =============================================
-- DELIVERY NOTES (SURAT JALAN)
-- =============================================
CREATE TABLE IF NOT EXISTS delivery_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    delivery_no VARCHAR(50) UNIQUE NOT NULL,    -- SJ-YYYYMMDD-NNNN
    transfer_id UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
    request_id UUID,                             -- link to stock_requests if transfer came from request
    status VARCHAR(20) NOT NULL DEFAULT 'generated',  -- generated, printed, shipped, received, completed
    generated_by UUID,
    generated_by_name VARCHAR(255),
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    printed_by UUID,
    printed_by_name VARCHAR(255),
    printed_at TIMESTAMPTZ,
    print_count INT NOT NULL DEFAULT 0,
    shipped_by UUID,
    shipped_by_name VARCHAR(255),
    shipped_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ,
    note TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_transfer ON delivery_notes(transfer_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_request ON delivery_notes(request_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_no ON delivery_notes(delivery_no);

-- =============================================
-- INDEXES (from migration_v2_multi_outlet)
-- =============================================
CREATE INDEX IF NOT EXISTS idx_orders_outlet ON orders(outlet_id, status);
CREATE INDEX IF NOT EXISTS idx_tables_outlet ON tables(outlet_id, status);
CREATE INDEX IF NOT EXISTS idx_stock_movements_outlet ON stock_movements(outlet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_accounts_outlet ON payment_accounts(outlet_id);

-- ==========================================================================
-- END OF SCHEMA
-- ==========================================================================
