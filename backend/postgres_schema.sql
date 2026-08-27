-- ==========================================================================
-- Sutan Khulifah POS - PostgreSQL Schema
-- Kompatibel dengan PostgreSQL 14+
-- Menggunakan JSONB untuk data embedded (variants, items) untuk fleksibilitas
-- ==========================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- USERS
-- =============================================
CREATE TABLE IF NOT EXISTS users (
    	id uuid DEFAULT uuid_generate_v4() NOT NULL,
	email varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"role" varchar(20) NOT NULL,
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
	CONSTRAINT users_pkey PRIMARY KEY (id),
	CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'manager'::character varying, 'kasir'::character varying])::text[])))
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
	"source" varchar(20) DEFAULT 'pos'::character varying NULL,
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
	transfer_account_name varchar(255) NULL,
	transfer_account_no varchar(100) NULL,
	transfer_reference_no varchar(100) NULL,
	transfer_sender_name varchar(255) NULL,
	transfer_verified boolean DEFAULT FALSE NULL,
	payment_reference varchar(100) NULL,
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
    created_at TIMESTAMPTZ DEFAULT NOW(),
    received_at TIMESTAMPTZ
);

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
CREATE TABLE IF NOT EXISTS qris_orders (
    id SERIAL PRIMARY KEY,
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


