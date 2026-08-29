-- Seed all menus
INSERT INTO menus (id, name, label, description, route, icon, sort_order) VALUES
('00000000-0000-0000-0000-000000000b01', 'dashboard',        'Dashboard',       'Dashboard utama',           '/dashboard',        'LayoutDashboard', 1),
('00000000-0000-0000-0000-000000000b02', 'pos',              'Kasir (POS)',     'Point of Sale & Dine-In',   '/pos',              'ShoppingCart',    2),
('00000000-0000-0000-0000-000000000b03', 'tables',           'Meja (Dine-In)',  'Manajemen meja dine-in',    '/tables',           'Utensils',        3),
('00000000-0000-0000-0000-000000000b04', 'attendance',       'Absensi',         'Absensi karyawan',          '/attendance',       'Clock',           4),
('00000000-0000-0000-0000-000000000b05', 'shifts',           'Shift',           'Manajemen shift kasir',     '/shifts',           'Clock',           5),
('00000000-0000-0000-0000-000000000b06', 'products',         'Produk',          'Manajemen produk',          '/products',         'Package',         6),
('00000000-0000-0000-0000-000000000b07', 'inventory',        'Inventory',       'Manajemen stok inventory',  '/inventory',        'Boxes',           7),
('00000000-0000-0000-0000-000000000b08', 'transfers',        'Transfer Stok',   'Transfer stok antar outlet','/transfers',        'ArrowRightLeft',  8),
('00000000-0000-0000-0000-000000000b09', 'purchase_orders',  'Purchase Order',  'Pesanan ke supplier',       '/purchase-orders',  'ClipboardList',   9),
('00000000-0000-0000-0000-000000000b10', 'customers',        'Pelanggan',       'Manajemen pelanggan',       '/customers',        'Users',           10),
('00000000-0000-0000-0000-000000000b11', 'suppliers',        'Supplier',        'Manajemen supplier',        '/suppliers',        'Truck',           11),
('00000000-0000-0000-0000-000000000b12', 'outlets',          'Outlet',          'Manajemen outlet',          '/outlets',          'Store',           12),
('00000000-0000-0000-0000-000000000b13', 'reports',          'Laporan',         'Laporan & analitik',        '/reports',          'BarChart3',       13),
('00000000-0000-0000-0000-000000000b14', 'users',            'Karyawan',        'Manajemen karyawan',        '/users',            'UserCog',         14),
('00000000-0000-0000-0000-000000000b15', 'settings',         'Pengaturan',      'Pengaturan sistem',         '/settings',         'Settings',        15),
('00000000-0000-0000-0000-000000000b16', 'payment_accounts', 'Rekening Bank',   'Rekening bank transfer',    '/payment-accounts', 'CreditCard',      16),
('00000000-0000-0000-0000-000000000b17', 'roles',            'Role & Akses',    'Manajemen role & menu',     '/roles',            'Shield',          17)
ON CONFLICT (name) DO NOTHING;

-- Seed role_menus: admin sees all
INSERT INTO role_menus (role_id, menu_id, is_visible)
SELECT '00000000-0000-0000-0000-000000000a01', id, TRUE FROM menus
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- Seed role_menus: manager (all except outlets, settings, roles)
INSERT INTO role_menus (role_id, menu_id, is_visible)
SELECT '00000000-0000-0000-0000-000000000a02', id, TRUE FROM menus
WHERE name NOT IN ('outlets', 'settings', 'roles')
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- Seed role_menus: kasir (only pos + attendance)
INSERT INTO role_menus (role_id, menu_id, is_visible)
SELECT '00000000-0000-0000-0000-000000000a03', id, TRUE FROM menus
WHERE name IN ('pos', 'attendance')
ON CONFLICT (role_id, menu_id) DO NOTHING;
