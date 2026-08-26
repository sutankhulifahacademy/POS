# Panduan Instalasi Lokal — Sutan Khulifah POS

Panduan ini menjelaskan cara menjalankan aplikasi **di komputer / server sendiri** (VPS, PC, atau Mac) tanpa memerlukan platform Emergent.

---

## 1. Stack Teknologi

| Layer      | Teknologi                            | Versi minimum |
| ---------- | ------------------------------------ | ------------- |
| Backend    | Python + FastAPI + Motor (async)     | Python 3.11+  |
| Frontend   | React 19 + Craco + Tailwind          | Node 18+      |
| Database   | **MongoDB** (NoSQL, document store)  | MongoDB 6.0+  |
| Auth       | JWT (PyJWT) + bcrypt                 | —             |
| Payment    | Midtrans QRIS (optional)             | —             |
| Print      | CSS `@media print` (thermal 58/80mm) | —             |

---

## 2. Prasyarat

Install di komputer Anda:

1. **Python 3.11+** — https://www.python.org/downloads/
2. **Node.js 18+ dan Yarn** — https://nodejs.org/ , lalu `npm install -g yarn`
3. **MongoDB Community Edition** — https://www.mongodb.com/try/download/community
   - Alternatif via Docker: `docker run -d --name mongo -p 27017:27017 mongo:6`
   - Alternatif cloud gratis: **MongoDB Atlas** (free tier 512MB) — https://www.mongodb.com/cloud/atlas
4. **Git** — untuk clone repo (opsional jika sudah punya kode)

---

## 3. Database MongoDB — Setting

Aplikasi menggunakan **MongoDB** (bukan MySQL/PostgreSQL). MongoDB menyimpan data sebagai dokumen JSON, sangat cocok untuk POS karena struktur produk/varian fleksibel.

### 3a. MongoDB Lokal (default)

Setelah instal MongoDB, service jalan otomatis di `mongodb://localhost:27017`. Tidak perlu buat database manual — aplikasi akan membuatnya otomatis saat backend pertama kali jalan.

**Verifikasi MongoDB jalan:**
```bash
# Windows PowerShell / Linux / Mac terminal
mongosh
# Harus muncul prompt "test>"
```

### 3b. MongoDB Atlas (Cloud, gratis)

1. Buat cluster gratis di https://cloud.mongodb.com/
2. Di menu **Database Access** → tambah user (`posuser` / password kuat)
3. Di menu **Network Access** → tambah IP address `0.0.0.0/0` (untuk akses dari mana saja) atau IP server Anda saja
4. Klik **Connect** → **Drivers** → copy connection string, contoh:
   ```
   mongodb+srv://posuser:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
5. Ganti `MONGO_URL` di `backend/.env` dengan connection string tersebut.

### 3c. Struktur Koleksi (dibuat otomatis)

Backend akan membuat collection ini secara otomatis pada request pertama:

| Collection          | Isi                                                              |
| ------------------- | ---------------------------------------------------------------- |
| `users`             | Akun pengguna (admin/manager/kasir) + bcrypt hash                |
| `business`          | Profil bisnis (nama, tipe, pajak, alamat)                        |
| `outlets`           | Cabang / outlet                                                  |
| `categories`        | Kategori produk                                                  |
| `products`          | Katalog produk + varian embedded                                 |
| `outlet_stocks`     | Stok per outlet (auto-init dari `product.stock` untuk outlet utama)|
| `stock_movements`   | Log semua perubahan stok (sale, PO, transfer, adjust)            |
| `sales`             | Transaksi penjualan (invoice + item + payment info)              |
| `qris_orders`       | Order QRIS Midtrans + status pembayaran                          |
| `shifts`            | Buka/tutup shift kasir + rekonsiliasi kas                        |
| `purchase_orders`   | PO ke supplier                                                    |
| `stock_transfers`   | Transfer stok antar outlet                                       |
| `customers`         | Data pelanggan + loyalty points                                  |
| `suppliers`         | Data supplier                                                    |
| `tables`            | Meja untuk mode dine-in F&B                                      |
| `orders`            | Order dine-in aktif (open/closed/cancelled)                      |

Index unik dibuat otomatis pada startup:
- `users.email` (unique)
- `products.sku` (unique)

---

## 4. Instalasi Backend

```bash
# Masuk ke folder backend
cd backend

# Buat virtual environment (opsional tapi disarankan)
python -m venv .venv

# Aktifkan venv
# Linux/Mac:
source .venv/bin/activate
# Windows PowerShell:
.venv\Scripts\Activate.ps1

# Install semua dependency
pip install -r requirements.txt

# Install library tambahan untuk QRIS (opsional)
pip install "qrcode[pil]" httpx
```

### 4a. File `backend/.env`

Buat file `backend/.env` (atau edit yang sudah ada):

```env
# ==== DATABASE ====
MONGO_URL="mongodb://localhost:27017"
# Untuk MongoDB Atlas:
# MONGO_URL="mongodb+srv://posuser:PASSWORD@cluster0.xxxxx.mongodb.net"

DB_NAME="sutankhulifah_pos"

# ==== CORS (URL frontend Anda) ====
CORS_ORIGINS="http://localhost:3000"
# Untuk production dengan domain custom:
# CORS_ORIGINS="https://pos.namadomain.com"

# ==== JWT (WAJIB diganti - generate string acak 64 karakter) ====
JWT_SECRET="ganti-dengan-string-acak-64-karakter-hex-untuk-keamanan-produksi"

# ==== SEED ADMIN (dijalankan saat backend pertama startup) ====
ADMIN_EMAIL="owner@bisnis-anda.com"
ADMIN_PASSWORD="PasswordKuat@2026"

# ==== MIDTRANS QRIS (opsional - kosongkan jika tidak pakai) ====
MIDTRANS_SERVER_KEY=""
MIDTRANS_BASE_URL="https://api.sandbox.midtrans.com"
# Untuk production Midtrans: https://api.midtrans.com
```

**Cara generate JWT_SECRET yang aman:**
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### 4b. Menjalankan Backend

```bash
# Dari folder backend, dengan venv aktif
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

Backend akan jalan di **http://localhost:8001**. Buka http://localhost:8001/docs untuk lihat Swagger API docs.

---

## 5. Instalasi Frontend

```bash
# Masuk ke folder frontend
cd frontend

# Install semua dependency (pakai yarn, JANGAN npm)
yarn install
```

### 5a. File `frontend/.env`

Buat/edit `frontend/.env`:

```env
REACT_APP_BACKEND_URL=http://localhost:8001
WDS_SOCKET_PORT=0
```

Untuk production dengan domain custom:
```env
REACT_APP_BACKEND_URL=https://api.pos.namadomain.com
```

### 5b. Menjalankan Frontend

```bash
# Development mode (hot reload)
yarn start
# Buka http://localhost:3000

# Production build
yarn build
# Hasil di folder frontend/build - deploy via nginx/apache
```

---

## 6. Login Pertama Kali

Setelah backend jalan, admin/owner otomatis di-seed dari `ADMIN_EMAIL` + `ADMIN_PASSWORD` di `.env`.

1. Buka http://localhost:3000
2. Login dengan email + password yang Anda set di `.env`
3. Setup bisnis di menu **Pengaturan** (nama toko, tipe usaha, dll.)
4. Buat pengguna kasir/manager via menu **Pengguna**

---

## 7. Deploy Production

### 7a. Server (VPS Ubuntu contoh)

```bash
# Install semua prasyarat
sudo apt update
sudo apt install -y python3.11 python3.11-venv nodejs npm mongodb
sudo npm install -g yarn

# Setup backend sebagai service (systemd)
sudo nano /etc/systemd/system/pos-backend.service
```

Isi file service:
```ini
[Unit]
Description=Sutan Khulifah POS Backend
After=network.target mongodb.service

[Service]
Type=simple
User=posuser
WorkingDirectory=/home/posuser/pos/backend
Environment="PATH=/home/posuser/pos/backend/.venv/bin"
ExecStart=/home/posuser/pos/backend/.venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable pos-backend
sudo systemctl start pos-backend
```

### 7b. Nginx sebagai Reverse Proxy

```nginx
# /etc/nginx/sites-available/pos
server {
    listen 80;
    server_name pos.namadomain.com;

    # Frontend static files
    root /home/posuser/pos/frontend/build;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Lalu install SSL gratis:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d pos.namadomain.com
```

---

## 8. Backup MongoDB

```bash
# Backup harian (tambahkan ke crontab)
mongodump --uri="mongodb://localhost:27017" --db=sutankhulifah_pos --out=/backup/$(date +%Y%m%d)

# Restore
mongorestore --uri="mongodb://localhost:27017" --db=sutankhulifah_pos /backup/20260825/sutankhulifah_pos
```

---

## 9. Kredensial Default (Ubah setelah deploy!)

Setelah startup pertama, admin akan otomatis dibuat dari nilai `ADMIN_EMAIL`/`ADMIN_PASSWORD` di `.env`.

**PENTING**: Untuk keamanan produksi, WAJIB:
1. Ganti `JWT_SECRET` menjadi string acak yang panjang
2. Ganti `ADMIN_PASSWORD` menjadi password kuat
3. Batasi `CORS_ORIGINS` hanya ke domain Anda
4. Aktifkan HTTPS via SSL/Let's Encrypt
5. Batasi MongoDB port 27017 hanya dari IP backend (firewall)

---

## 10. Troubleshooting

| Masalah                          | Solusi                                                              |
| -------------------------------- | ------------------------------------------------------------------- |
| Backend error `MONGO_URL`        | Pastikan MongoDB jalan: `sudo systemctl status mongod`              |
| Frontend tidak connect ke API    | Cek `REACT_APP_BACKEND_URL` di `frontend/.env` sudah benar          |
| CORS error di browser            | Tambahkan URL frontend ke `CORS_ORIGINS` di `backend/.env`          |
| QRIS error "not configured"      | Isi `MIDTRANS_SERVER_KEY` di `backend/.env` lalu restart backend    |
| Admin lupa password              | Ubah `ADMIN_PASSWORD` di `.env` lalu restart backend (auto re-hash) |
| Cari data di MongoDB             | `mongosh` → `use sutankhulifah_pos` → `db.users.find()`             |

---

## 11. Optimisasi Performa

- **Index tambahan** untuk query cepat:
  ```javascript
  db.sales.createIndex({ created_at: -1 })
  db.sales.createIndex({ outlet_id: 1, created_at: -1 })
  db.stock_movements.createIndex({ product_id: 1, created_at: -1 })
  ```
- **Nginx gzip** untuk kompresi asset
- **PM2** alternatif systemd untuk manage backend
- **MongoDB replica set** untuk high availability

Selamat menjalankan POS Sutan Khulifah Academy di infrastruktur Anda sendiri!
