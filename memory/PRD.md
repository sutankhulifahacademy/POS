# Sutan Khulifah POS - PRD

## Original Problem Statement
"saya ingin membuat aplikasi POS lengkap sampai ke invetory semuanya yang bisa dicustom di berbagai lini usaha"

## Brand Identity
- Sutan Khulifah Academy - Perjalanan Ruhani. Refleksi Kehidupan. Transformasi Diri.
- Luxury dark + gold aesthetic (#050505 obsidian + #D4AF37 warm gold)
- Typography: Cormorant Garamond (serif) + Manrope (sans)
- Logo: agyuw41m_logoSK.png

## Architecture
- **Backend**: FastAPI + Motor (MongoDB async) + JWT auth (bcrypt) — all routes under `/api`
- **Frontend**: React 19 + React Router 7 + Recharts + Sonner + Tailwind + Shadcn/UI
- **Auth**: JWT (cookie + Bearer header fallback), 3 roles: admin, manager, kasir
- **DB Collections**: users, business, outlets, categories, products, customers, suppliers, sales, stock_movements

## User Personas
1. Owner/Admin — full control, business setup, staff management
2. Manager — inventory, products, reports
3. Kasir (Cashier) — POS terminal, add customers

## Core Requirements (Static)
- Multi-business-type: Retail, F&B, Fashion, General
- Multi-outlet ready
- Product catalog with SKU, barcode, category, image, stock
- POS terminal with cart, multi payment (cash/card/QRIS/transfer), discount, receipt
- Real-time stock deduction on sale + stock movement log
- Customer loyalty (auto points based on spend)
- Low-stock alerts on dashboard
- Sales reports with 7-day revenue trend & top products

## Implemented (Feb 2026 - Initial MVP)
- ✅ JWT auth with admin seeding (sutankhulifahacademy@gmail.com)
- ✅ Business profile setup with type customization
- ✅ Product, Category, Outlet, Customer, Supplier CRUD (role-gated)
- ✅ POS terminal with product grid, cart, checkout, receipt modal
- ✅ Inventory adjustment + movement history
- ✅ Sales list with invoice detail modal
- ✅ Dashboard with metrics + 7-day chart + low stock + top products
- ✅ Luxury dark/gold theme with brand logo

## Prioritized Backlog
### P1
- Barcode scanner integration (webcam / USB HID)
- Purchase Orders workflow (PO → receive → auto stock in)
- User management (invite kasir/manager, role editor)
- Product variants (size, color, flavor)

### P2
- Export laporan PDF/Excel
- Shift management (open/close shift, opening balance)
- Print thermal receipt (58mm/80mm)
- Multi-outlet stock transfer

### P3
- Loyalty tier & rewards redemption
- AI sales insights (Claude via Emergent LLM)
- Table management (untuk F&B)
- E-invoice / e-receipt via email
