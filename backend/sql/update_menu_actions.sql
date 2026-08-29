UPDATE menus SET actions = '["view"]'::jsonb WHERE name = 'dashboard';
UPDATE menus SET actions = '["view","create","update","delete"]'::jsonb WHERE name IN ('attendance','products','inventory','users','customers','suppliers','categories','outlets','tables','purchase_orders','payment_accounts','roles');
UPDATE menus SET actions = '["view","create"]'::jsonb WHERE name IN ('pos','transfers');
UPDATE menus SET actions = '["view","export","detail"]'::jsonb WHERE name = 'reports';
UPDATE menus SET actions = '["view","update"]'::jsonb WHERE name = 'settings';
UPDATE menus SET actions = '["view","open","close"]'::jsonb WHERE name = 'shifts';
UPDATE menus SET actions = '["view"]'::jsonb WHERE name IN ('tables','payment_accounts') AND actions IS NULL;
