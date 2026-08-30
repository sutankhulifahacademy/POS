-- ============================================================
-- MIGRATION v2.2 — Phase 8: Employee assignment, expenses
-- ============================================================

-- 1. user_outlet_access: add is_primary and assigned_at
ALTER TABLE user_outlet_access ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT FALSE;
ALTER TABLE user_outlet_access ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ DEFAULT NOW();

-- Set first outlet per user as primary if none is primary
UPDATE user_outlet_access uua
SET is_primary = TRUE
WHERE id::text IN (
    SELECT MIN(id::text) FROM user_outlet_access GROUP BY user_id
)
AND NOT EXISTS (
    SELECT 1 FROM user_outlet_access u2
    WHERE u2.user_id = uua.user_id AND u2.is_primary = TRUE
);

-- 2. expenses table — operational expense tracking per outlet
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

-- 3. Add expense categories seed
INSERT INTO role_permissions (role_id, module, action, granted)
SELECT '00000000-0000-0000-0000-000000000a00', 'expenses', a, TRUE
FROM (VALUES ('view'), ('create'), ('update'), ('delete')) AS v(a)
ON CONFLICT (role_id, module, action) DO NOTHING;

INSERT INTO role_permissions (role_id, module, action, granted)
SELECT '00000000-0000-0000-0000-000000000a01', 'expenses', a, TRUE
FROM (VALUES ('view'), ('create'), ('update'), ('delete')) AS v(a)
ON CONFLICT (role_id, module, action) DO NOTHING;

-- Manager: view + create expenses
INSERT INTO role_permissions (role_id, module, action, granted)
SELECT '00000000-0000-0000-0000-000000000a02', 'expenses', a, TRUE
FROM (VALUES ('view'), ('create')) AS v(a)
ON CONFLICT (role_id, module, action) DO NOTHING;

-- 4. Add audit_logs permission for owner + admin
INSERT INTO role_permissions (role_id, module, action, granted)
SELECT '00000000-0000-0000-0000-000000000a00', 'audit', a, TRUE
FROM (VALUES ('view')) AS v(a)
ON CONFLICT (role_id, module, action) DO NOTHING;

INSERT INTO role_permissions (role_id, module, action, granted)
SELECT '00000000-0000-0000-0000-000000000a01', 'audit', a, TRUE
FROM (VALUES ('view')) AS v(a)
ON CONFLICT (role_id, module, action) DO NOTHING;

-- 5. Add alerts permission
INSERT INTO role_permissions (role_id, module, action, granted)
SELECT '00000000-0000-0000-0000-000000000a00', 'alerts', a, TRUE
FROM (VALUES ('view'), ('manage')) AS v(a)
ON CONFLICT (role_id, module, action) DO NOTHING;

INSERT INTO role_permissions (role_id, module, action, granted)
SELECT '00000000-0000-0000-0000-000000000a01', 'alerts', a, TRUE
FROM (VALUES ('view'), ('manage')) AS v(a)
ON CONFLICT (role_id, module, action) DO NOTHING;

INSERT INTO role_permissions (role_id, module, action, granted)
SELECT '00000000-0000-0000-0000-000000000a02', 'alerts', a, TRUE
FROM (VALUES ('view')) AS v(a)
ON CONFLICT (role_id, module, action) DO NOTHING;

-- 6. Add menus: Expenses, Audit Logs, Alerts
INSERT INTO menus (id, name, label, description, route, icon, sort_order)
VALUES
('00000000-0000-0000-0000-000000000b19', 'expenses', 'Pengeluaran', 'Tracking pengeluaran operasional', '/expenses', 'Wallet', 18),
('00000000-0000-0000-0000-000000000b20', 'audit_logs', 'Audit Log', 'Log aktivitas sistem', '/audit-logs', 'FileText', 19)
ON CONFLICT (name) DO NOTHING;

-- Owner sees all menus
INSERT INTO role_menus (role_id, menu_id, is_visible)
SELECT '00000000-0000-0000-0000-000000000a00', id, TRUE FROM menus
WHERE name IN ('expenses', 'audit_logs')
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- Admin sees expenses + audit
INSERT INTO role_menus (role_id, menu_id, is_visible)
SELECT '00000000-0000-0000-0000-000000000a01', id, TRUE FROM menus
WHERE name IN ('expenses', 'audit_logs')
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- Manager sees expenses only
INSERT INTO role_menus (role_id, menu_id, is_visible)
SELECT '00000000-0000-0000-0000-000000000a02', id, TRUE FROM menus
WHERE name = 'expenses'
ON CONFLICT (role_id, menu_id) DO NOTHING;
