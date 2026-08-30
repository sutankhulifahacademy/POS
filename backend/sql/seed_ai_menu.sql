-- Add AI Assistant menu
INSERT INTO menus (id, name, label, description, route, icon, sort_order)
VALUES ('00000000-0000-0000-0000-000000000b18', 'ai_assistant', 'AI Assistant', 'AI business assistant', '/ai-assistant', 'Sparkles', 18)
ON CONFLICT (name) DO NOTHING;

-- Give owner + admin access to AI menu
INSERT INTO role_menus (role_id, menu_id, is_visible)
SELECT '00000000-0000-0000-0000-000000000a00', id, TRUE FROM menus WHERE name = 'ai_assistant'
ON CONFLICT (role_id, menu_id) DO NOTHING;

INSERT INTO role_menus (role_id, menu_id, is_visible)
SELECT '00000000-0000-0000-0000-000000000a01', id, TRUE FROM menus WHERE name = 'ai_assistant'
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- Give manager access too
INSERT INTO role_menus (role_id, menu_id, is_visible)
SELECT '00000000-0000-0000-0000-000000000a02', id, TRUE FROM menus WHERE name = 'ai_assistant'
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- Add AI permissions for owner + admin
INSERT INTO role_permissions (role_id, module, action, granted)
SELECT '00000000-0000-0000-0000-000000000a00', 'ai', a, TRUE
FROM (VALUES ('view'), ('query'), ('briefing'), ('anomaly'), ('forecast')) AS v(a)
ON CONFLICT (role_id, module, action) DO NOTHING;

INSERT INTO role_permissions (role_id, module, action, granted)
SELECT '00000000-0000-0000-0000-000000000a01', 'ai', a, TRUE
FROM (VALUES ('view'), ('query'), ('briefing'), ('anomaly'), ('forecast')) AS v(a)
ON CONFLICT (role_id, module, action) DO NOTHING;
