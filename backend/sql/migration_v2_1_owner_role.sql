-- ============================================================
-- MIGRATION v2.1 — Add owner role
-- ============================================================

-- 1. Insert owner role
INSERT INTO roles (id, name, label, description, is_system, is_active)
VALUES (
    '00000000-0000-0000-0000-000000000a00',
    'owner',
    'Owner',
    'Pemilik bisnis, akses penuh ke semua outlet',
    TRUE,
    TRUE
) ON CONFLICT (name) DO NOTHING;

-- 2. Give owner ALL permissions (copy from admin)
INSERT INTO role_permissions (role_id, module, action, granted)
SELECT '00000000-0000-0000-0000-000000000a00', module, action, TRUE
FROM role_permissions
WHERE role_id = '00000000-0000-0000-0000-000000000a01'
ON CONFLICT (role_id, module, action) DO NOTHING;

-- 3. Give admin ALL permissions too (admin = per-cabang full access)
-- Admin already has permissions from seed, but ensure complete
INSERT INTO role_permissions (role_id, module, action, granted)
SELECT '00000000-0000-0000-0000-000000000a01', module, action, TRUE
FROM role_permissions
WHERE role_id = '00000000-0000-0000-0000-000000000a01'
ON CONFLICT (role_id, module, action) DO NOTHING;

-- 4. Update existing owner@republikdimsum.id user to role=owner
UPDATE users SET role = 'owner' WHERE email = 'owner@republikdimsum.id';

-- 5. Give owner user access to all outlets (not strictly needed since owner bypasses)
INSERT INTO user_outlet_access (user_id, outlet_id)
SELECT u.id, o.id FROM users u, outlets o
WHERE u.role = 'owner'
ON CONFLICT (user_id, outlet_id) DO NOTHING;

-- 6. Ensure admin users have outlet access (per-cabang)
-- Admin users should already have access from migration_v2
-- But ensure they have access to at least the main outlet
INSERT INTO user_outlet_access (user_id, outlet_id)
SELECT u.id, o.id FROM users u
CROSS JOIN (SELECT id FROM outlets WHERE is_main = TRUE LIMIT 1) o
WHERE u.role = 'admin'
  AND NOT EXISTS (
      SELECT 1 FROM user_outlet_access ua
      WHERE ua.user_id = u.id
  )
ON CONFLICT (user_id, outlet_id) DO NOTHING;
