-- Stock Request + Delivery Note (Surat Jalan) migration
-- Depends on: stock_transfers, transfer_items (from transfer_approval.sql)

-- ============ STOCK REQUESTS ============
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

-- ============ STOCK REQUEST ITEMS ============
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

-- ============ DELIVERY NOTES (SURAT JALAN) ============
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

-- ============ ADD COLUMNS TO stock_transfers ============
-- Link transfer to request + shipping info
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS request_id UUID;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS delivery_note_id UUID;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS shipped_by UUID;
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS shipped_by_name VARCHAR(255);
ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;

-- ============ ADD PERMISSIONS FOR STOCK REQUESTS ============
-- Insert new module permissions if not exists
INSERT INTO role_permissions (id, role_id, module, action, granted)
SELECT gen_random_uuid(), r.id, 'stock_requests', 'view', TRUE
FROM roles r
WHERE r.name IN ('owner', 'admin', 'manager', 'supervisor')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.module = 'stock_requests' AND rp.action = 'view'
  );

INSERT INTO role_permissions (id, role_id, module, action, granted)
SELECT uuid_generate_v4(), r.id, 'stock_requests', 'create', TRUE
FROM roles r
WHERE r.name IN ('owner', 'admin', 'manager', 'supervisor', 'kasir')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.module = 'stock_requests' AND rp.action = 'create'
  );

-- Approve request: only owner + manager
INSERT INTO role_permissions (id, role_id, module, action, granted)
SELECT gen_random_uuid(), r.id, 'stock_requests', 'approve', TRUE
FROM roles r
WHERE r.name IN ('owner', 'manager')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.module = 'stock_requests' AND rp.action = 'approve'
  );

-- ============ ADD MENUS ============
INSERT INTO menus (id, name, label, description, route, icon, sort_order, parent_id, is_active, actions)
SELECT '00000000-0000-0000-0000-000000000c01', 'stock_requests', 'Request Stok', 'Permintaan stok dari cabang ke pusat', '/stock-requests', 'PackagePlus', 11, NULL, TRUE, '["view","create","approve"]'
WHERE NOT EXISTS (SELECT 1 FROM menus WHERE route = '/stock-requests');

-- Assign stock_requests menu to owner, admin, manager, supervisor
INSERT INTO role_menus (id, role_id, menu_id)
SELECT gen_random_uuid(), r.id, m.id
FROM roles r, menus m
WHERE m.route = '/stock-requests'
  AND r.name IN ('owner', 'admin', 'manager', 'supervisor')
  AND NOT EXISTS (
    SELECT 1 FROM role_menus rm WHERE rm.role_id = r.id AND rm.menu_id = m.id
  );
