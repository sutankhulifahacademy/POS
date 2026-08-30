-- ============================================================
-- MIGRATION v2.0 — Multi-Outlet, Audit, Leave, Alerts
-- ============================================================

-- 1. user_outlet_access — multi-outlet authorization
CREATE TABLE IF NOT EXISTS user_outlet_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    outlet_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, outlet_id)
);
CREATE INDEX IF NOT EXISTS idx_user_outlet_access_user ON user_outlet_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_outlet_access_outlet ON user_outlet_access(outlet_id);

-- 2. audit_logs — audit trail for all important actions
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

-- 3. leave_requests — leave/permission management
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

-- 4. alerts — notification/alert center
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

-- 5. Add outlet_id to attendance
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS outlet_id UUID;
CREATE INDEX IF NOT EXISTS idx_attendance_outlet ON attendance(outlet_id, clock_in_at DESC);

-- 6. Add outlet_id to purchase_orders
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS outlet_id UUID;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_outlet ON purchase_orders(outlet_id, created_at DESC);

-- 7. Add indexes for existing outlet_id columns that lack them
CREATE INDEX IF NOT EXISTS idx_orders_outlet ON orders(outlet_id, status);
CREATE INDEX IF NOT EXISTS idx_tables_outlet ON tables(outlet_id, status);
CREATE INDEX IF NOT EXISTS idx_stock_movements_outlet ON stock_movements(outlet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_accounts_outlet ON payment_accounts(outlet_id);

-- 8. Seed user_outlet_access for existing users
-- Admin (owner) gets access to all outlets
INSERT INTO user_outlet_access (user_id, outlet_id)
SELECT u.id, o.id FROM users u, outlets o
WHERE u.role = 'admin'
ON CONFLICT (user_id, outlet_id) DO NOTHING;

-- Other users get access to main outlet by default
INSERT INTO user_outlet_access (user_id, outlet_id)
SELECT u.id, o.id FROM users u, outlets o
WHERE u.role != 'admin' AND o.is_main = TRUE
ON CONFLICT (user_id, outlet_id) DO NOTHING;

-- If no main outlet exists, give all users access to first outlet
INSERT INTO user_outlet_access (user_id, outlet_id)
SELECT u.id, o.id FROM users u
CROSS JOIN (SELECT id FROM outlets ORDER BY created_at LIMIT 1) o
WHERE u.role != 'admin'
  AND NOT EXISTS (
      SELECT 1 FROM user_outlet_access ua
      WHERE ua.user_id = u.id
  )
ON CONFLICT (user_id, outlet_id) DO NOTHING;
