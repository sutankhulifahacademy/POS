# Dokumentasi Menu POS — Republik Dimsum

> **Versi:** 1.0  
> **Tanggal:** 29 Agustus 2026  
> **Status:** Complete — 17 menu aktif  
> **Branch:** `custom_breakdown_server.py`

---

## Daftar Isi

1. [Dashboard](#1-dashboard)
2. [Kasir (POS)](#2-kasir-pos)
3. [Meja (Dine-In)](#3-meja-dine-in)
4. [Absensi](#4-absensi)
5. [Shift](#5-shift)
6. [Produk](#6-produk)
7. [Inventory](#7-inventory)
8. [Transfer Stok](#8-transfer-stok)
9. [Purchase Order](#9-purchase-order)
10. [Pelanggan](#10-pelanggan)
11. [Supplier](#11-supplier)
12. [Outlet](#12-outlet)
13. [Laporan](#13-laporan)
14. [Karyawan](#14-karyawan)
15. [Pengaturan](#15-pengaturan)
16. [Rekening Bank](#16-rekening-bank)
17. [Role & Akses](#17-role--akses)
18. [Sistem Role & Permission](#sistem-role--permission)
19. [Sistem Menu Dinamis](#sistem-menu-dinamis)

---

## 1. Dashboard

| Atribut | Nilai |
|---------|-------|
| **Nama Menu** | `dashboard` |
| **Label** | Dashboard |
| **Route** | `/dashboard` |
| **Icon** | LayoutDashboard |
| **Sort Order** | 1 |
| **Actions** | `view` |
| **Akses Role** | admin, manager |

### Deskripsi
Halaman utama yang menampilkan ringkasan performa bisnis untuk periode tertentu. Memberikan overview cepat tentang pendapatan, transaksi, dan stok.

### Fitur Utama
- **Period Selector** — pilih periode: harian, mingguan, bulanan, tahunan
- **Metric Cards** — kartu ringkasan: pendapatan, jumlah transaksi, rata-rata nilai transaksi, produk terjual
- **Revenue Chart** — grafik garis pendapatan over time
- **Top Products** — tabel produk terlaris
- **Low Stock Panel** — daftar produk dengan stok menipis

### API Endpoints
| Method | Endpoint | Fungsi |
|--------|----------|-------|
| GET | `/reports/dashboard?period={period}` | Data dashboard berdasarkan periode |

### Tidak Ada
- Tidak ada form/modal
- Tidak ada export/import
- Tidak ada CRUD

---

## 2. Kasir (POS)

| Atribut | Nilai |
|---------|-------|
| **Nama Menu** | `pos` |
| **Label** | Kasir (POS) |
| **Route** | `/pos` |
| **Icon** | ShoppingCart |
| **Sort Order** | 2 |
| **Actions** | `view`, `create` |
| **Akses Role** | admin, manager, kasir |

### Deskripsi
Terminal kasir utama untuk transaksi retail/takeaway dan dine-in. Halaman ini adalah inti dari sistem POS yang digunakan kasir sehari-hari.

### Fitur Utama

#### Tab POS (Takeaway/Retail)
- **Product Grid** — grid produk dengan gambar, nama, harga
- **Category Filter** — filter produk berdasarkan kategori
- **Live Search** — pencarian produk real-time
- **Barcode Scanner** — scan barcode produk untuk menambah ke keranjang
- **Cart Sidebar** — keranjang belanja dengan +/- qty, hapus item
- **Variant Picker** — pilih varian produk (nama, SKU, harga, stok)
- **Outlet Selector** — pilih outlet aktif
- **Active Shift Indicator** — indikator shift kasir yang sedang aktif

#### Tab Dine-In
- **Table Map** — peta meja grouped by zone
- **Table Status** — status meja (available/occupied)
- **Open Order** — buka order untuk meja, tambah produk
- **Checkout Dine-In** — checkout langsung dari meja

#### Pembayaran
- **Cash** — pembayaran tunai dengan hitung kembalian
- **Card** — pembayaran kartu (card_type, card_brand, last4, approval_code, terminal_id)
- **Transfer Bank** — transfer ke rekening tujuan (bank, account_name, account_no, reference_no, sender_name)
- **QRIS** — pembayaran via Midtrans QRIS dengan QR code

#### Lainnya
- **Receipt Modal** — struk transaksi setelah checkout
- **Print Receipt** — cetak struk
- **Dashboard Shortcut** — tombol langsung ke dashboard (admin/manager)
- **Open Shift CTA** — prompt buka shift jika belum ada shift aktif

### API Endpoints
| Method | Endpoint | Fungsi |
|--------|----------|-------|
| GET | `/products` | List produk |
| GET | `/categories` | List kategori |
| GET | `/customers` | List pelanggan |
| GET | `/shifts/active` | Shift aktif kasir |
| GET | `/outlets` | List outlet |
| GET | `/payment-accounts` | Rekening bank untuk transfer |
| GET | `/card-brands` | Daftar bank/brand kartu |
| GET | `/outlet-stocks/{outletId}` | Stok per outlet |
| GET | `/products/by-barcode/{code}` | Cari produk by barcode |
| POST | `/card-brands` | Tambah card brand baru (auto-persist) |
| POST | `/sales` | Checkout transaksi |

### Card Brand Auto-Persist
- Saat kasir memilih "Lainnya" dan mengetik bank/brand baru, sistem otomatis menyimpan ke database `card_brands`
- Brand baru langsung tersedia untuk semua kasir di POS dan Dine-In

---

## 3. Meja (Dine-In)

| Atribut | Nilai |
|---------|-------|
| **Nama Menu** | `tables` |
| **Label** | Meja (Dine-In) |
| **Route** | `/tables` |
| **Icon** | Utensils |
| **Sort Order** | 3 |
| **Actions** | `view`, `create`, `update`, `delete` |
| **Akses Role** | admin, manager |

### Deskripsi
Manajemen meja dine-in standalone. Memungkinkan admin/manager mengatur meja, zone, dan mengelola order dine-in secara langsung.

### Fitur Utama
- **Table Map by Zone** — peta meja dikelompokkan per zone (Utama, VIP, dll)
- **Table Status** — available (hijau) / occupied (merah)
- **Active Order Total** — total bill meja yang occupied
- **Tambah Meja** — tambah meja baru (name, capacity, zone)
- **Hapus Meja** — hapus meja
- **Open/Edit Order** — buka atau edit order meja
- **Product Picker** — pilih produk untuk ditambahkan ke order
- **Simpan (Belum Bayar)** — simpan order tanpa checkout
- **Bayar Sekarang** — checkout order dine-in
- **Batalkan Order** — batalkan order yang belum dibayar

### API Endpoints
| Method | Endpoint | Fungsi |
|--------|----------|-------|
| GET | `/tables` | List semua meja |
| GET | `/products` | List produk untuk order |
| GET | `/customers` | List pelanggan |
| GET | `/payment-accounts` | Rekening bank |
| GET | `/card-brands` | Daftar brand kartu |
| GET | `/orders?status=open` | Order aktif |
| POST | `/tables` | Tambah meja |
| DELETE | `/tables/{id}` | Hapus meja |
| POST | `/orders` | Buka order baru |
| PUT | `/orders/{id}/items` | Update item order |
| POST | `/orders/{id}/checkout` | Checkout order |
| POST | `/card-brands` | Tambah card brand |
| DELETE | `/orders/{id}` | Batalkan order |

---

## 4. Absensi

| Atribut | Nilai |
|---------|-------|
| **Nama Menu** | `attendance` |
| **Label** | Absensi |
| **Route** | `/attendance` |
| **Icon** | Clock |
| **Sort Order** | 4 |
| **Actions** | `view`, `create`, `update`, `delete` |
| **Akses Role** | admin, manager, kasir |

### Deskripsi
Sistem absensi karyawan berbasis webcam. Karyawan dapat clock-in dan clock-out dengan foto sebagai bukti kehadiran.

### Fitur Utama
- **Absen Masuk (Clock In)** — webcam capture + note opsional
- **Absen Keluar (Clock Out)** — webcam capture + note opsional
- **Live Session Duration** — durasi sesi absensi real-time
- **Attendance History** — riwayat absensi (cashier, clock in, clock out, duration, status)
- **Detail Modal** — detail absensi dengan foto clock-in dan clock-out

### API Endpoints
| Method | Endpoint | Fungsi |
|--------|----------|-------|
| GET | `/attendance/active` | Sesi absensi aktif user |
| GET | `/attendance?limit=50` | Riwayat absensi |
| POST | `/attendance/clock-in` | Clock in dengan foto |
| POST | `/attendance/clock-out` | Clock out dengan foto |

---

## 5. Shift

| Atribut | Nilai |
|---------|-------|
| **Nama Menu** | `shifts` |
| **Label** | Shift |
| **Route** | `/shifts` |
| **Icon** | Clock |
| **Sort Order** | 5 |
| **Actions** | `view`, `open`, `close` |
| **Akses Role** | admin, manager |

### Deskripsi
Manajemen shift kasir dengan rekonsiliasi kas. Setiap kasir harus membuka shift sebelum bertransaksi dan menutup shift saat selesai.

### Fitur Utama
- **Active Shift Card** — kartu shift yang sedang aktif
- **Buka Shift** — buka shift baru (opening cash, note)
- **Tutup Shift** — tutup shift (actual cash, note)
- **Close Result Summary** — ringkasan hasil tutup shift:
  - Cash sales total
  - Non-cash sales total
  - Expected cash vs actual cash
  - Difference (selisih)
  - Transaction count
- **Shift History** — riwayat semua shift

### API Endpoints
| Method | Endpoint | Fungsi |
|--------|----------|-------|
| GET | `/shifts/active` | Shift aktif |
| GET | `/shifts` | Riwayat shift |
| POST | `/shifts/open` | Buka shift |
| POST | `/shifts/close` | Tutup shift |

---

## 6. Produk

| Atribut | Nilai |
|---------|-------|
| **Nama Menu** | `products` |
| **Label** | Produk |
| **Route** | `/products` |
| **Icon** | Package |
| **Sort Order** | 6 |
| **Actions** | `view`, `create`, `update`, `delete` |
| **Akses Role** | admin, manager |

### Deskripsi
Manajemen katalog produk dengan varian, kategori, barcode, dan kontrol stok.

### Fitur Utama
- **Product List** — tabel produk dengan search
- **Tambah Produk** — tambah produk baru
- **Edit Produk** — edit produk existing
- **Hapus Produk** — hapus produk
- **Variants** — tambah/hapus varian per produk (name, SKU, price, stock)
- **Low Stock Highlighting** — highlight produk dengan stok menipis
- **Fields**: name, SKU, barcode, category, unit, price, cost, stock, low_stock_threshold, image_url, description, variants

### API Endpoints
| Method | Endpoint | Fungsi |
|--------|----------|-------|
| GET | `/products` | List produk |
| GET | `/categories` | List kategori |
| POST | `/products` | Tambah produk |
| PUT | `/products/{id}` | Update produk |
| DELETE | `/products/{id}` | Hapus produk |

---

## 7. Inventory

| Atribut | Nilai |
|---------|-------|
| **Nama Menu** | `inventory` |
| **Label** | Inventory |
| **Route** | `/inventory` |
| **Icon** | Boxes |
| **Sort Order** | 7 |
| **Actions** | `view`, `create`, `update`, `delete` |
| **Akses Role** | admin, manager |

### Deskripsi
Manajemen stok inventory dengan penyesuaian manual dan riwayat pergerakan stok.

### Fitur Utama

#### Tab Penyesuaian
- **Select Product** — pilih produk untuk disesuaikan
- **Delta** — jumlah penyesuaian (+/-)
- **Reason** — alasan penyesuaian
- **Note** — catatan tambahan
- **Simpan Penyesuaian** — simpan dan update stok
- **Stock Summary** — ringkasan stok semua produk

#### Tab Riwayat
- **Stock Movements History** — riwayat semua pergerakan stok
- Kolom: produk, delta, reason, note, outlet, timestamp

### API Endpoints
| Method | Endpoint | Fungsi |
|--------|----------|-------|
| GET | `/products` | List produk dengan stok |
| GET | `/inventory/movements` | Riwayat pergerakan stok |
| POST | `/inventory/adjust` | Penyesuaian stok manual |

---

## 8. Transfer Stok

| Atribut | Nilai |
|---------|-------|
| **Nama Menu** | `transfers` |
| **Label** | Transfer Stok |
| **Route** | `/transfers` |
| **Icon** | ArrowRightLeft |
| **Sort Order** | 8 |
| **Actions** | `view`, `create` |
| **Akses Role** | admin, manager |

### Deskripsi
Transfer stok antar outlet tanpa membuat purchase order. Memudahkan redistribusi stok antar cabang.

### Fitur Utama
- **Transfer List** — daftar semua transfer
- **Buat Transfer** — buat transfer baru:
  - From Outlet — outlet asal
  - To Outlet — outlet tujuan
  - Item Lines — produk + quantity
  - Note — catatan
- **Konfirmasi Transfer** — konfirmasi dan eksekusi transfer
- **Detail Modal** — detail transfer dengan item list

### API Endpoints
| Method | Endpoint | Fungsi |
|--------|----------|-------|
| GET | `/stock-transfers` | List transfer |
| GET | `/outlets` | List outlet |
| GET | `/products` | List produk |
| POST | `/stock-transfers` | Buat transfer baru |

---

## 9. Purchase Order

| Atribut | Nilai |
|---------|-------|
| **Nama Menu** | `purchase_orders` |
| **Label** | Purchase Order |
| **Route** | `/purchase-orders` |
| **Icon** | ClipboardList |
| **Sort Order** | 9 |
| **Actions** | `view`, `create`, `update`, `delete` |
| **Akses Role** | admin, manager |

### Deskripsi
Sistem Purchase Order ke supplier. Membuat PO, menerima barang (auto-update stok), dan menolak/membatalkan PO.

### Fitur Utama
- **PO List** — daftar PO dengan status (draft, received, cancelled)
- **Buat PO** — buat PO baru:
  - Supplier — pilih supplier
  - Item Lines — produk + quantity + cost
  - Note — catatan
- **Detail Modal** — detail PO lengkap:
  - Supplier, timestamp, status, note
  - Items: product_name, quantity, cost, subtotal
  - Total
- **Terima (Receive)** — terima barang → update stok + record stock movement
- **Tolak (Reject)** — tolak PO → status menjadi `cancelled`
- **Hapus Draft** — hapus PO yang masih draft
- **Terima Barang dari Detail** — receive langsung dari modal detail

### API Endpoints
| Method | Endpoint | Fungsi |
|--------|----------|-------|
| GET | `/purchase-orders` | List PO |
| GET | `/suppliers` | List supplier |
| GET | `/products` | List produk |
| POST | `/purchase-orders` | Buat PO |
| POST | `/purchase-orders/{id}/receive` | Terima barang |
| POST | `/purchase-orders/{id}/reject` | Tolak PO |
| DELETE | `/purchase-orders/{id}` | Hapus PO draft |

---

## 10. Pelanggan

| Atribut | Nilai |
|---------|-------|
| **Nama Menu** | `customers` |
| **Label** | Pelanggan |
| **Route** | `/customers` |
| **Icon** | Users |
| **Sort Order** | 10 |
| **Actions** | `view`, `create`, `update`, `delete` |
| **Akses Role** | admin, manager |

### Deskripsi
Master data pelanggan dengan tracking loyalty points, total spent, dan visit count.

### Fitur Utama
- **Customer List** — tabel pelanggan
- **Tambah/Edit/Hapus** — CRUD pelanggan
- **Fields**: name, phone, email, address
- **Auto-track**: loyalty_points, total_spent, visit_count

### API Endpoints
| Method | Endpoint | Fungsi |
|--------|----------|-------|
| GET | `/customers` | List pelanggan |
| POST | `/customers` | Tambah pelanggan |
| PUT | `/customers/{id}` | Update pelanggan |
| DELETE | `/customers/{id}` | Hapus pelanggan |

---

## 11. Supplier

| Atribut | Nilai |
|---------|-------|
| **Nama Menu** | `suppliers` |
| **Label** | Supplier |
| **Route** | `/suppliers` |
| **Icon** | Truck |
| **Sort Order** | 11 |
| **Actions** | `view`, `create`, `update`, `delete` |
| **Akses Role** | admin, manager |

### Deskripsi
Master data supplier untuk Purchase Order.

### Fitur Utama
- **Supplier List** — tabel supplier
- **Tambah/Edit/Hapus** — CRUD supplier
- **Fields**: name, contact_person, phone, email, address

### API Endpoints
| Method | Endpoint | Fungsi |
|--------|----------|-------|
| GET | `/suppliers` | List supplier |
| POST | `/suppliers` | Tambah supplier |
| PUT | `/suppliers/{id}` | Update supplier |
| DELETE | `/suppliers/{id}` | Hapus supplier |

---

## 12. Outlet

| Atribut | Nilai |
|---------|-------|
| **Nama Menu** | `outlets` |
| **Label** | Outlet |
| **Route** | `/outlets` |
| **Icon** | Store |
| **Sort Order** | 12 |
| **Actions** | `view`, `create`, `update`, `delete` |
| **Akses Role** | admin |

### Deskripsi
Manajemen multi-outlet/cabang. Setiap outlet memiliki stok terpisah.

### Fitur Utama
- **Outlet List** — tabel outlet
- **Tambah/Edit/Hapus** — CRUD outlet
- **Is Main Flag** — tandai outlet utama
- **Fields**: name, address, phone, is_main

### API Endpoints
| Method | Endpoint | Fungsi |
|--------|----------|-------|
| GET | `/outlets` | List outlet |
| POST | `/outlets` | Tambah outlet |
| PUT | `/outlets/{id}` | Update outlet |
| DELETE | `/outlets/{id}` | Hapus outlet |

---

## 13. Laporan

| Atribut | Nilai |
|---------|-------|
| **Nama Menu** | `reports` |
| **Label** | Laporan |
| **Route** | `/reports` |
| **Icon** | BarChart3 |
| **Sort Order** | 13 |
| **Actions** | `view`, `export`, `detail` |
| **Akses Role** | admin, manager |

### Deskripsi
Hub laporan manajerial dengan 6 tab laporan, filter periode, filter outlet, dan export Excel/PDF.

### Fitur Utama

#### Tab Dashboard
- Period selector (daily/weekly/monthly/yearly)
- Summary cards: revenue, transactions, avg transaction, products sold
- Revenue chart
- Top products
- Low stock

#### Tab Penjualan
- Period + date range + outlet filter
- Summary: revenue, transactions, avg, discounts, tax
- Breakdown by: payment method, source (POS/Dine-In), category, outlet, cashier
- Top products table
- Invoice list with receipt popup
- Export Excel/PDF

#### Tab Laba Rugi
- Revenue, COGS, gross profit, net profit
- Period + outlet filter
- Export Excel/PDF

#### Tab Shift
- Shift list with reconciliation
- Cash sales, non-cash sales, expected vs actual, difference
- Export Excel/PDF

#### Tab Stok
- Stock movements history
- Low stock alerts
- Current stock per product
- Export Excel/PDF

#### Tab Rekonsiliasi
- Payment reconciliation
- Per payment method breakdown
- Verified vs pending transfers
- Export Excel/PDF

### API Endpoints
| Method | Endpoint | Fungsi |
|--------|----------|-------|
| GET | `/outlets` | List outlet untuk filter |
| GET | `/reports/dashboard` | Data dashboard |
| GET | `/reports/sales` | Laporan penjualan |
| GET | `/reports/profit-loss` | Laporan laba rugi |
| GET | `/reports/shifts` | Laporan shift |
| GET | `/reports/stock` | Laporan stok |
| GET | `/reports/payment-reconciliation` | Rekonsiliasi pembayaran |
| GET | `/sales/{saleId}` | Detail transaksi untuk receipt |

### Export
- **Excel** — via `xlsx` library
- **PDF** — via `jspdf` + `jspdf-autotable`

---

## 14. Karyawan

| Atribut | Nilai |
|---------|-------|
| **Nama Menu** | `users` |
| **Label** | Karyawan |
| **Route** | `/users` |
| **Icon** | UserCog |
| **Sort Order** | 14 |
| **Actions** | `view`, `create`, `update`, `delete` |
| **Akses Role** | admin, manager |

### Deskripsi
Manajemen karyawan/user dengan foto, KTP, role-based account, dan reset password.

### Fitur Utama
- **Employee Cards** — grid kartu karyawan dengan foto
- **Tambah Karyawan** — tambah karyawan baru:
  - name, email, role (kasir/manager/admin)
  - phone, address, job_title
  - photo (image upload)
  - ktp_image, ktp_number
- **Edit Karyawan** — edit data karyawan
- **Reset Password** — reset password karyawan
- **Hapus Karyawan** — hapus karyawan
- **Detail View** — detail lengkap karyawan

### API Endpoints
| Method | Endpoint | Fungsi |
|--------|----------|-------|
| GET | `/users` | List karyawan |
| GET | `/users/{id}` | Detail karyawan |
| POST | `/users` | Tambah karyawan |
| PUT | `/users/{id}` | Update karyawan |
| POST | `/users/{id}/reset-password` | Reset password |
| DELETE | `/users/{id}` | Hapus karyawan |

---

## 15. Pengaturan

| Atribut | Nilai |
|---------|-------|
| **Nama Menu** | `settings` |
| **Label** | Pengaturan |
| **Route** | `/settings` |
| **Icon** | Settings |
| **Sort Order** | 15 |
| **Actions** | `view`, `update` |
| **Akses Role** | admin |

### Deskripsi
Pengaturan bisnis dan manajemen kategori produk.

### Fitur Utama

#### Business Profile
- **Name** — nama bisnis
- **Business Type** — tipe bisnis
- **Currency** — mata uang (default: IDR)
- **Tax Rate** — tarif pajak (%)
- **Address** — alamat bisnis
- **Simpan** — simpan profil bisnis

#### Categories
- **Category List** — daftar kategori produk
- **Tambah Kategori** — tambah kategori (name, color)
- **Hapus Kategori** — hapus kategori

### API Endpoints
| Method | Endpoint | Fungsi |
|--------|----------|-------|
| GET | `/business` | Profil bisnis |
| GET | `/categories` | List kategori |
| POST | `/business` | Update profil bisnis |
| POST | `/categories` | Tambah kategori |
| DELETE | `/categories/{id}` | Hapus kategori |

---

## 16. Rekening Bank

| Atribut | Nilai |
|---------|-------|
| **Nama Menu** | `payment_accounts` |
| **Label** | Rekening Bank |
| **Route** | `/payment-accounts` |
| **Icon** | CreditCard |
| **Sort Order** | 16 |
| **Actions** | `view`, `create`, `update`, `delete` |
| **Akses Role** | admin, manager |

### Deskripsi
Daftar rekening bank tujuan untuk pembayaran transfer. Digunakan di POS dan Dine-In saat metode pembayaran transfer dipilih.

### Fitur Utama
- **Account List** — tabel rekening bank
- **Tambah/Edit/Hapus** — CRUD rekening
- **Is Active Flag** — aktif/non-aktif rekening
- **Fields**: bank_name, account_name, account_no, is_active

### API Endpoints
| Method | Endpoint | Fungsi |
|--------|----------|-------|
| GET | `/payment-accounts` | List rekening |
| POST | `/payment-accounts` | Tambah rekening |
| PUT | `/payment-accounts/{id}` | Update rekening |
| DELETE | `/payment-accounts/{id}` | Hapus rekening |

---

## 17. Role & Akses

| Atribut | Nilai |
|---------|-------|
| **Nama Menu** | `roles` |
| **Label** | Role & Akses |
| **Route** | `/roles` |
| **Icon** | Shield |
| **Sort Order** | 17 |
| **Actions** | `view`, `create`, `update`, `delete` |
| **Akses Role** | admin (owner) |

### Deskripsi
Sistem manajemen role, permission tree, menu access, dan menu management. Hanya owner yang bisa mengakses menu ini.

### 3 Tab Utama

#### Tab 1: Permission Tree
- Pilih role → edit permission tree
- Parent checkbox (module) → toggle semua child actions
- Child checkbox (action) → toggle individual action
- Indeterminate state untuk partial check
- Expand/collapse per module
- **Simpan Permissions** — save semua changes

#### Tab 2: Menu Access
- Pilih role → checklist menu mana yang visible di sidebar
- Select All / Deselect All
- **Simpan Menu** — save menu visibility per role

#### Tab 3: Menu Management (Owner Only)
- CRUD menu items
- **Tambah Menu** — tambah menu baru:
  - name (lowercase, no spaces)
  - label (display name)
  - description
  - route (e.g. /new-page)
  - icon (lucide-react icon name)
  - sort_order
  - actions (multi-checkbox: view, create, update, delete, export, detail, open, close)
  - is_active
- **Edit Menu** — edit menu existing
- **Hapus Menu** — hapus menu
- Setelah save, refresh permission tree + menu access

### Role Management
- **Role List** — daftar semua role (admin, manager, kasir, custom)
- **Buat Role** — tambah custom role (name, label, description)
- **Edit Role** — edit label, description, is_active
- **Hapus Role** — hapus custom role (tidak bisa hapus system role, tidak bisa hapus jika masih ada user assigned)
- **System Role Badge** — badge untuk admin/manager/kasir (tidak bisa dihapus)

### API Endpoints
| Method | Endpoint | Fungsi |
|--------|----------|-------|
| GET | `/roles` | List role + permissions |
| GET | `/roles/permission-tree` | Permission tree (dynamic from menus) |
| GET | `/roles/my-permissions` | Permissions user saat ini |
| GET | `/roles/{id}` | Detail role + permissions |
| POST | `/roles` | Buat role |
| PUT | `/roles/{id}` | Update role |
| PUT | `/roles/{id}/permissions` | Bulk update permissions |
| DELETE | `/roles/{id}` | Hapus role |
| GET | `/menus` | List semua menu |
| GET | `/menus/my-menus` | Menu visible untuk user |
| GET | `/menus/role/{roleId}` | Menu + visibility per role |
| PUT | `/menus/role/{roleId}` | Update menu visibility per role |
| POST | `/menus` | Tambah menu |
| PUT | `/menus/{id}` | Update menu |
| DELETE | `/menus/{id}` | Hapus menu |

---

## Sistem Role & Permission

### Tabel Database

#### `roles`
| Kolom | Tipe | Deskripsi |
|-------|------|-----------|
| id | UUID | Primary key |
| name | VARCHAR(50) | Nama role (unique) |
| label | VARCHAR(100) | Display name |
| description | TEXT | Deskripsi role |
| is_system | BOOLEAN | System role (tidak bisa dihapus) |
| is_active | BOOLEAN | Status aktif |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

#### `role_permissions`
| Kolom | Tipe | Deskripsi |
|-------|------|-----------|
| id | UUID | Primary key |
| role_id | UUID | FK → roles |
| module | VARCHAR(50) | Nama module/menu |
| action | VARCHAR(20) | Action (view, create, update, delete, dll) |
| granted | BOOLEAN | Diizinkan atau tidak |
| created_at | TIMESTAMPTZ | |

**Unique constraint**: (role_id, module, action)

### Seed Data
| Role | Permissions |
|------|-------------|
| admin | 63 (semua module + action) |
| manager | 42 (tanpa outlets, settings, roles) |
| kasir | 7 (pos + attendance) |

### Actions Tersedia
| Action | Deskripsi |
|--------|-----------|
| `view` | Lihat/halaman |
| `create` | Tambah data |
| `update` | Edit data |
| `delete` | Hapus data |
| `export` | Export Excel/PDF |
| `detail` | Lihat detail |
| `open` | Buka (shift) |
| `close` | Tutup (shift) |

---

## Sistem Menu Dinamis

### Tabel Database

#### `menus`
| Kolom | Tipe | Deskripsi |
|-------|------|-----------|
| id | UUID | Primary key |
| name | VARCHAR(50) | Nama menu (unique, lowercase) |
| label | VARCHAR(100) | Display name |
| description | TEXT | Deskripsi menu |
| route | VARCHAR(100) | Route frontend |
| icon | VARCHAR(50) | Nama icon lucide-react |
| sort_order | INTEGER | Urutan menu di sidebar |
| parent_id | UUID | FK → menus (untuk submenu) |
| is_active | BOOLEAN | Status aktif |
| actions | JSONB | Array actions tersedia |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

#### `role_menus`
| Kolom | Tipe | Deskripsi |
|-------|------|-----------|
| id | UUID | Primary key |
| role_id | UUID | FK → roles |
| menu_id | UUID | FK → menus |
| is_visible | BOOLEAN | Visible di sidebar untuk role ini |
| created_at | TIMESTAMPTZ | |

**Unique constraint**: (role_id, menu_id)

### Alur Menu Dinamis

```
1. Owner buka Role & Akses → tab "Menu Management"
   └── Tambah menu baru (name, label, route, icon, actions, sort_order)
       │
       ├── Otomatis muncul di tab "Permission Tree"
       ├── Otomatis muncul di tab "Menu Access" (is_visible=false)
       └── Tersimpan di tabel menus

2. Owner pilih role → tab "Menu Access"
   └── Checklist menu → Simpan
       └── User dengan role itu lihat menu di sidebar

3. Owner pilih role → tab "Permission Tree"
   └── Checklist action → Simpan
       └── Permission tersimpan di role_permissions
```

### Sidebar Frontend
- Sidebar **tidak hardcoded** — fetch dari `GET /menus/my-menus`
- Icon dari database dipetakan ke komponen lucide-react via `ICON_MAP`
- Menu di-cache di memory untuk performa
- `canAccess()` cek menu dari API, bukan array hardcoded

---

## Teknologi

| Komponen | Teknologi |
|----------|-----------|
| Backend | FastAPI, Python 3.11, Uvicorn |
| Database | PostgreSQL 14+ (asyncpg) |
| Auth | JWT (PyJWT), bcrypt |
| Frontend | React, Create React App (CRACO) |
| HTTP Client | Axios |
| Icons | lucide-react |
| Toast | sonner |
| Charts | Custom (SVG) |
| Export Excel | xlsx |
| Export PDF | jspdf, jspdf-autotable |
| Payment | Midtrans QRIS |
| Container | Docker Compose |
| Web Server | Nginx (frontend) |

---

## Catatan Update

| Versi | Tanggal | Perubahan |
|-------|---------|-----------|
| 1.0 | 2026-08-29 | Dokumen awal — 17 menu, sistem role & permission, menu dinamis |

> **Update berikutnya:** Tambahkan baris baru di tabel di atas dan buat dokumen versi baru saat ada penambahan/perubahan menu.
