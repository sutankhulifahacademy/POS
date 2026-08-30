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
    updated_at TIMESTAMPTZ
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
    price NUMERIC(12,2) NOT NULL,
    cost NUMERIC(12,2) DEFAULT 0,
    stock INTEGER DEFAULT 0,
    low_stock_threshold INTEGER DEFAULT 5,
    unit VARCHAR(50) DEFAULT 'pcs',
    image_url TEXT,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    variants JSONB DEFAULT '[]'::jsonb,
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
    created_at TIMESTAMPTZ DEFAULT NOW()
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
    created_at TIMESTAMPTZ DEFAULT NOW()
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
