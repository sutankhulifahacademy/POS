# Panduan Migrasi ke PostgreSQL — Sutan Khulifah POS

Panduan ini memandu Anda memindahkan data dari MongoDB (implementasi saat ini) ke **PostgreSQL** dengan aman.

## ⚠️ Status Implementasi

- ✅ **Schema PostgreSQL siap** — `backend/postgres_schema.sql` (16 tabel lengkap dengan indeks)
- ✅ **Migration script siap** — `backend/migrate_mongo_to_postgres.py` (idempotent, semua koleksi)
- ⚠️ **Backend server.py masih pakai MongoDB (Motor)** — perlu iterasi terpisah untuk rewrite ke SQLAlchemy async
- ✅ **UI baru sudah pakai palet SK POS Enterprise** — navy blue + gold sesuai logo baru

**Rekomendasi eksekusi bertahap:**
1. Setup PostgreSQL + load schema → jalankan migration script → data 100% ter-copy ke Postgres  
2. **Test paralel**: MongoDB tetap digunakan production, PostgreSQL siap standby  
3. Iterasi berikut: rewrite `server.py` dari Motor → SQLAlchemy async (semua endpoint), swap koneksi  
4. Testing regresi menyeluruh (auth, POS, PO, transfer, dine-in, QRIS)  
5. Switchover: matikan MongoDB, semua traffic ke PostgreSQL

Cara yang paling aman adalah dual-run periode 1-2 minggu sebelum decommission MongoDB.

---

## 1. Install PostgreSQL

### Ubuntu / Debian
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl enable --now postgresql
```

### macOS
```bash
brew install postgresql@15
brew services start postgresql@15
```

### Docker (paling cepat untuk testing)
```bash
docker run -d --name pg-pos -p 5432:5432 \
  -e POSTGRES_USER=posuser \
  -e POSTGRES_PASSWORD=pospass \
  -e POSTGRES_DB=sutankhulifah_pos \
  -v pg_data:/var/lib/postgresql/data \
  postgres:15
```

### Cloud managed (pilihan production)
- **Supabase** (gratis 500MB) — https://supabase.com
- **Neon** (gratis, serverless) — https://neon.tech
- **AWS RDS**, **DigitalOcean Managed DB**, **GCP Cloud SQL** (berbayar)

## 2. Buat User & Database

```bash
sudo -u postgres psql
```
```sql
CREATE USER posuser WITH PASSWORD 'pospass';
CREATE DATABASE sutankhulifah_pos OWNER posuser;
GRANT ALL PRIVILEGES ON DATABASE sutankhulifah_pos TO posuser;
\q
```

## 3. Load Schema

```bash
cd /app/backend
psql -U posuser -d sutankhulifah_pos -f postgres_schema.sql
```

Verifikasi tabel:
```bash
psql -U posuser -d sutankhulifah_pos -c "\dt"
# Harus tampil 16 tabel: users, business, outlets, categories, products, outlet_stocks,
# stock_movements, sales, shifts, customers, suppliers, purchase_orders,
# stock_transfers, tables, orders, qris_orders
```

## 4. Migrasi Data dari MongoDB

Pastikan MongoDB masih berjalan dengan data lama.

```bash
cd /app/backend
pip install asyncpg motor python-dotenv
```

Tambahkan ke `backend/.env`:
```env
POSTGRES_URL="postgresql://posuser:pospass@localhost:5432/sutankhulifah_pos"
```

Jalankan migrasi:
```bash
python migrate_mongo_to_postgres.py
```

Output yang diharapkan:
```
✓ Connected: MongoDB=test_database → PostgreSQL
  users: 3/3 migrated
  business: 1/1 migrated
  outlets: 2/2 migrated
  categories: 2/2 migrated
  products: 3/3 migrated
  outlet_stocks: 2/2 migrated
  stock_movements: 20/20 migrated
  sales: 5/5 migrated
  ... dst
✅ Migrasi selesai.
```

Script bersifat **idempotent** (ON CONFLICT DO NOTHING/UPDATE) sehingga bisa dijalankan ulang tanpa duplikasi.

## 5. Verifikasi Data

```bash
psql -U posuser -d sutankhulifah_pos <<SQL
SELECT 'users' AS tbl, COUNT(*) FROM users
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'sales', COUNT(*) FROM sales
UNION ALL SELECT 'stock_movements', COUNT(*) FROM stock_movements
UNION ALL SELECT 'shifts', COUNT(*) FROM shifts;
SQL
```

Bandingkan jumlah dengan MongoDB:
```bash
mongosh --eval "use test_database; db.getCollectionNames().forEach(c => print(c + ': ' + db[c].countDocuments()))"
```

## 6. Rencana Rewrite Backend (Iterasi Berikutnya)

Untuk transisi penuh dari MongoDB ke PostgreSQL, backend `server.py` perlu di-refactor:

- **Dari**: `motor.motor_asyncio.AsyncIOMotorClient` + `db.collection.find({...})`  
- **Ke**: `sqlalchemy.ext.asyncio` + `async with SessionLocal() as s: s.execute(select(Model))`

Pola yang perlu diubah (kurang lebih 40 endpoint):
- `await db.users.find_one({"email": email})` → `await session.execute(select(User).filter_by(email=email))`
- `await db.products.insert_one(doc)` → `session.add(Product(**doc)); await session.commit()`
- `await db.sales.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)` → `select(Sale).order_by(Sale.created_at.desc()).limit(200)`
- `{"$inc": {"stock": -qty}}` → `update(Product).where(...).values(stock=Product.stock - qty)`

**Library yang perlu ditambah ke `requirements.txt`:**
```
sqlalchemy>=2.0
asyncpg>=0.29
alembic>=1.13
```

**Waktu estimasi rewrite**: 1 iterasi Emergent penuh (semua ~40 endpoint + testing).

Kalau Anda ingin lanjut rewrite, tinggal minta: "lanjutkan rewrite server.py ke SQLAlchemy PostgreSQL".

## 7. Rollback (kalau ada masalah)

Data MongoDB tetap ada — cukup ganti `MONGO_URL` di `.env` kembali ke server MongoDB Anda. Aplikasi resume dengan data terakhir.

## 8. Cleanup MongoDB (SETELAH yakin PostgreSQL production-ready)

```bash
# Backup dulu untuk arsip
mongodump --db test_database --out /backup/mongo_final_$(date +%Y%m%d)

# Stop MongoDB
sudo systemctl stop mongod
sudo systemctl disable mongod
```

---

**Ringkasan file yang sudah dibuat untuk migrasi:**
- `/app/backend/postgres_schema.sql` — DDL lengkap 16 tabel
- `/app/backend/migrate_mongo_to_postgres.py` — script migrasi idempotent
- `/app/SETUP_POSTGRES.md` — panduan ini
