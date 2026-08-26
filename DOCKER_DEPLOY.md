# Docker Deployment — Republik Dimsum Imperium

Satu perintah untuk menjalankan seluruh stack (PostgreSQL + FastAPI backend + React frontend) di komputer/server Anda.

## Prasyarat

- **Docker** 24+ dan **Docker Compose v2** — https://docs.docker.com/get-docker/
- Port yang harus bebas: `80` (frontend), `8001` (backend API), `5432` (Postgres)
- RAM minimum: 2 GB

## Quickstart 3 Langkah

```bash
# 1. Clone/copy source code ke server
cd /path/to/app-source

# 2. Buat file konfigurasi
cp .env.example .env
nano .env    # WAJIB ganti JWT_SECRET dan POSTGRES_PASSWORD

# 3. Jalankan!
docker compose up -d --build
```

Setelah ~2 menit build:
- **Frontend**: http://localhost
- **Backend API**: http://localhost:8001
- **API Docs (Swagger)**: http://localhost:8001/docs
- **PostgreSQL**: `localhost:5432` (untuk akses via pgAdmin/DBeaver)

Login pertama pakai `ADMIN_EMAIL` + `ADMIN_PASSWORD` dari `.env`.

## Struktur Container

```
┌────────────────────────────────────────────────────────┐
│  Docker Host                                            │
│                                                         │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────┐  │
│  │ rdi-frontend │→→→│  rdi-backend │→→→│rdi-postgres│  │
│  │ nginx:80     │   │ uvicorn:8001 │   │ pg:5432    │  │
│  │ React bundle │   │ FastAPI+SQLA │   │ +schema.sql│  │
│  └──────────────┘   └──────────────┘   └────────────┘  │
│                                              │          │
│                                        ┌─────▼──────┐   │
│                                        │  pg_data   │   │
│                                        │  (volume)  │   │
│                                        └────────────┘   │
└────────────────────────────────────────────────────────┘
```

- **postgres** — PostgreSQL 15 Alpine. Auto-load `backend/postgres_schema.sql` saat pertama startup via `/docker-entrypoint-initdb.d/`. Data persisten di named volume `pg_data`.
- **backend** — Python 3.11 + FastAPI + SQLAlchemy async. Tunggu postgres healthy sebelum start. Auto-seed admin user.
- **frontend** — Multi-stage build: Node 20 build → Nginx 1.27 Alpine runtime. SPA fallback dikonfigurasi.

## Perintah Berguna

```bash
# Cek status
docker compose ps

# Lihat logs
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres

# Restart 1 service
docker compose restart backend

# Rebuild setelah ubah code
docker compose up -d --build backend
docker compose up -d --build frontend

# Stop semua
docker compose down

# Stop + hapus volume (⚠️ DATA HILANG!)
docker compose down -v

# Akses shell container
docker compose exec backend bash
docker compose exec postgres psql -U posuser -d republik_dimsum

# Backup database
docker compose exec postgres pg_dump -U posuser republik_dimsum > backup_$(date +%Y%m%d).sql

# Restore database
cat backup_20260825.sql | docker compose exec -T postgres psql -U posuser republik_dimsum
```

## Deploy ke VPS Production

1. Setup domain + DNS A record ke IP VPS Anda
2. Install Docker di VPS
3. Copy source code (git clone atau scp)
4. Edit `.env`:
   ```env
   REACT_APP_BACKEND_URL=https://api.domain-anda.com
   CORS_ORIGINS=https://pos.domain-anda.com
   JWT_SECRET=$(python -c "import secrets;print(secrets.token_hex(32))")
   POSTGRES_PASSWORD=<password-kuat-random>
   ```
5. Tambahkan Nginx/Traefik/Caddy di depan untuk SSL Let's Encrypt (contoh Caddyfile):
   ```
   pos.domain-anda.com {
     reverse_proxy localhost:80
   }
   api.domain-anda.com {
     reverse_proxy localhost:8001
   }
   ```
6. `docker compose up -d --build`

## Migrasi Data dari MongoDB (jika ada)

Jika Anda sudah punya data MongoDB yang mau dipindah:

```bash
# 1. Mulai stack Docker seperti biasa
docker compose up -d

# 2. Jalankan migration script dari host (arahkan MONGO_URL ke MongoDB Anda)
export MONGO_URL="mongodb://old-mongo-host:27017"
export DB_NAME="test_database"
export POSTGRES_URL="postgresql://posuser:pospass@localhost:5432/republik_dimsum"
python backend/migrate_mongo_to_postgres.py
```

## Troubleshooting

| Error                                          | Solusi                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `port is already allocated`                    | Port 80/8001/5432 sudah dipakai. Stop service lain atau ubah port. |
| Backend `connection refused` ke postgres       | Tunggu 10 detik lagi — healthcheck butuh waktu saat pertama.       |
| Frontend `Failed to fetch`                     | Cek `REACT_APP_BACKEND_URL` di `.env` sudah benar & backend live.  |
| CORS error di browser                          | Tambahkan URL frontend Anda ke `CORS_ORIGINS` di `.env`.           |
| Admin gagal login                              | Ganti `ADMIN_PASSWORD` di `.env` + `docker compose restart backend`. |
| Postgres data hilang setelah `down -v`         | Volume `pg_data` di-hapus. Restore dari backup.                    |

## Keamanan Produksi (Checklist)

- [ ] Ganti `JWT_SECRET` dengan random 64 karakter
- [ ] Ganti `POSTGRES_PASSWORD` dengan password kuat
- [ ] Ganti `ADMIN_PASSWORD` setelah login pertama via UI (menu Karyawan → Reset Password)
- [ ] Set `CORS_ORIGINS` hanya ke domain Anda (bukan `*`)
- [ ] Aktifkan HTTPS via reverse proxy (Caddy/Nginx + Let's Encrypt)
- [ ] Batasi port 5432 dan 8001 hanya dari internal (firewall)
- [ ] Setup daily backup pg_dump ke S3/Google Drive
- [ ] Aktifkan Midtrans production key (bukan sandbox) untuk QRIS live
