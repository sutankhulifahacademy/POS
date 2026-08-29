INSERT INTO users (id, email, name, role, password_hash, is_active, created_at, updated_at, phone, job_title)
VALUES
('00000000-0000-0000-0000-000000000e01', 'manager.budi@republikdimsum.id', 'Budi Santoso', 'manager', '$2b$12$VMdlOtk9UyzFnjljvYLAgekXKCwFBG49RijKqMZ1gnJ2zWjSmc7va', TRUE, NOW(), NOW(), '081234567801', 'Manager Outlet'),
('00000000-0000-0000-0000-000000000e02', 'manager.siti@republikdimsum.id', 'Siti Rahayu', 'manager', '$2b$12$VMdlOtk9UyzFnjljvYLAgekXKCwFBG49RijKqMZ1gnJ2zWjSmc7va', TRUE, NOW(), NOW(), '081234567802', 'Manager Operasional'),
('00000000-0000-0000-0000-000000000e03', 'manager.agus@republikdimsum.id', 'Agus Pratama', 'manager', '$2b$12$VMdlOtk9UyzFnjljvYLAgekXKCwFBG49RijKqMZ1gnJ2zWjSmc7va', TRUE, NOW(), NOW(), '081234567803', 'Manager Keuangan'),
('00000000-0000-0000-0000-000000000e11', 'supervisor.rina@republikdimsum.id', 'Rina Wati', 'supervisor', '$2b$12$VMdlOtk9UyzFnjljvYLAgekXKCwFBG49RijKqMZ1gnJ2zWjSmc7va', TRUE, NOW(), NOW(), '081234567811', 'Supervisor Shift Pagi'),
('00000000-0000-0000-0000-000000000e12', 'supervisor.dono@republikdimsum.id', 'Dono Hartono', 'supervisor', '$2b$12$VMdlOtk9UyzFnjljvYLAgekXKCwFBG49RijKqMZ1gnJ2zWjSmc7va', TRUE, NOW(), NOW(), '081234567812', 'Supervisor Shift Malam')
ON CONFLICT (email) DO NOTHING;
