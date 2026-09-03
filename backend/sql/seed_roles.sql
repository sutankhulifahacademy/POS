-- Seed admin permissions (all granted)
INSERT INTO role_permissions (role_id, module, action, granted)
SELECT '00000000-0000-0000-0000-000000000a01', m.module, m.action, TRUE
FROM (VALUES
  ('dashboard','view'), ('attendance','view'), ('attendance','create'), ('attendance','update'), ('attendance','delete'),
  ('pos','view'), ('pos','create'), ('dinein','view'), ('dinein','create'),
  ('products','view'), ('products','create'), ('products','update'), ('products','delete'),
  ('inventory','view'), ('inventory','create'), ('inventory','update'), ('inventory','delete'),
  ('reports','view'), ('reports','export'), ('reports','detail'),
  ('roles','view'), ('roles','create'), ('roles','update'), ('roles','delete'),
  ('settings','view'), ('settings','update'),
  ('users','view'), ('users','create'), ('users','update'), ('users','delete'),
  ('customers','view'), ('customers','create'), ('customers','update'), ('customers','delete'),
  ('suppliers','view'), ('suppliers','create'), ('suppliers','update'), ('suppliers','delete'),
  ('categories','view'), ('categories','create'), ('categories','update'), ('categories','delete'),
  ('outlets','view'), ('outlets','create'), ('outlets','update'), ('outlets','delete'),
  ('tables','view'), ('tables','create'), ('tables','update'), ('tables','delete'),
  ('shifts','view'), ('shifts','open'), ('shifts','close'),
  ('purchase_orders','view'), ('purchase_orders','create'), ('purchase_orders','update'), ('purchase_orders','delete'),
  ('stock_transfers','view'), ('stock_transfers','create'),
  ('payment_accounts','view'), ('payment_accounts','create'), ('payment_accounts','update'), ('payment_accounts','delete'),
  ('expenses','view'), ('expenses','create'), ('expenses','update'), ('expenses','delete'),
  ('payroll','view'), ('payroll','create'), ('payroll','update'),
  ('schedules','view'), ('schedules','create'), ('schedules','update'), ('schedules','delete'),
  ('loyalty','view'), ('loyalty','update'),
  ('receipt','view'), ('receipt','update'),
  ('kds','view'), ('kds','update'),
  ('online_platforms','view'), ('online_platforms','create'), ('online_platforms','update'), ('online_platforms','delete')
) AS m(module, action)
ON CONFLICT (role_id, module, action) DO NOTHING;

-- Seed manager permissions
INSERT INTO role_permissions (role_id, module, action, granted)
SELECT '00000000-0000-0000-0000-000000000a02', m.module, m.action, TRUE
FROM (VALUES
  ('dashboard','view'), ('attendance','view'), ('attendance','create'), ('attendance','update'),
  ('pos','view'), ('pos','create'), ('dinein','view'), ('dinein','create'),
  ('products','view'), ('products','create'), ('products','update'),
  ('inventory','view'), ('inventory','create'), ('inventory','update'),
  ('reports','view'), ('reports','export'), ('reports','detail'),
  ('roles','view'),
  ('customers','view'), ('customers','create'), ('customers','update'),
  ('suppliers','view'), ('suppliers','create'), ('suppliers','update'),
  ('categories','view'), ('categories','create'), ('categories','update'),
  ('outlets','view'),
  ('tables','view'), ('tables','create'), ('tables','update'),
  ('shifts','view'), ('shifts','open'), ('shifts','close'),
  ('purchase_orders','view'), ('purchase_orders','create'), ('purchase_orders','update'),
  ('stock_transfers','view'), ('stock_transfers','create'),
  ('payment_accounts','view'), ('payment_accounts','create'), ('payment_accounts','update'),
  ('expenses','view'), ('expenses','create'), ('expenses','update'),
  ('payroll','view'), ('payroll','create'), ('payroll','update'),
  ('schedules','view'), ('schedules','create'), ('schedules','update'),
  ('loyalty','view'), ('loyalty','update'),
  ('receipt','view'), ('receipt','update'),
  ('kds','view'), ('kds','update'),
  ('online_platforms','view'), ('online_platforms','create'), ('online_platforms','update')
) AS m(module, action)
ON CONFLICT (role_id, module, action) DO NOTHING;

-- Seed kasir permissions
INSERT INTO role_permissions (role_id, module, action, granted)
SELECT '00000000-0000-0000-0000-000000000a03', m.module, m.action, TRUE
FROM (VALUES
  ('pos','view'), ('pos','create'), ('dinein','view'), ('dinein','create'),
  ('tables','view'), ('shifts','view'), ('shifts','open'),
  ('kds','view'), ('kds','update')
) AS m(module, action)
ON CONFLICT (role_id, module, action) DO NOTHING;
