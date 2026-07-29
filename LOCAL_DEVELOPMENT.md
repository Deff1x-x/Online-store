# Local Development

Single entry point for running KOZ on a clean machine **without editing source code**.

Two supported paths:

1. **Host stack (recommended for day-to-day development)** — PostgreSQL + Node (or .NET) + Vite.
2. **Local Docker API stack** — `deploy/local/docker-compose.yml` (Postgres + Node API). Frontends still on Vite.

> `deploy/vps/docker-compose.yml` is the **production VPS** stack. It requires a filled `.env`, TLS certificates, and either an external database or the `postgres` profile. It is **not** a one-command local developer path. See [Why VPS Compose is not for local](#why-vps-compose-is-not-for-local).

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | ≥ 20 |
| npm | ≥ 10 (comes with Node) |
| PostgreSQL | 16+ (or Docker for DB only) |
| .NET SDK | 10.x (only if running the .NET API) |
| Docker Desktop | optional — for `deploy/local` |

Free local ports: **3000** (Node), **5000** (.NET, optional), **5173** (client), **5174** (staff), **5432** (host Postgres) or **5433** (Compose Postgres).

---

## Installation

```bash
git clone <repo-url>
cd online-store   # or your clone directory

cp .env.example .env
cp apps/client/.env.example apps/client/.env
cp apps/staff/.env.example apps/staff/.env

npm ci
```

Windows (PowerShell), if `cp` is unavailable:

```powershell
Copy-Item .env.example .env
Copy-Item apps/client/.env.example apps/client/.env
Copy-Item apps/staff/.env.example apps/staff/.env
npm ci
```

---

## Environment

Root `.env` (used by Node / scripts):

| Variable | Local default | Notes |
|---|---|---|
| `DATABASE_HOST` | `localhost` | Use `localhost` for host Postgres; Compose API uses `postgres` |
| `DATABASE_PORT` | `5432` | Use `5433` if connecting from host to Compose Postgres |
| `DATABASE_NAME` | `online_store` | |
| `DATABASE_USER` | `postgres` | |
| `DATABASE_PASSWORD` | `postgres` | Local only |
| `JWT_SECRET` | development placeholder | ≥32 chars |
| `OTP_SECRET` | development placeholder | Required for .NET; must ≠ `JWT_SECRET` |
| `PORT` | `3000` | Node API |
| `VITE_API_URL` | `http://localhost:3000/api` | Also set in app `.env` files |
| `VITE_STORE_ID` | `11111111-1111-1111-1111-111111111111` | Seed store |

Do **not** commit real `.env` files.

---

## PostgreSQL (host)

Ensure PostgreSQL is running and `psql` is on `PATH` (Windows: `C:\Program Files\PostgreSQL\16\bin`).

```bash
# Linux / macOS
./scripts/local/setup-db.sh

# Windows PowerShell
.\scripts\local\setup-db.ps1
```

This drops and recreates `online_store`, applies `database/schema.sql`, migrations `001`–`003`, and `database/seed.sql`.

Manual equivalent:

```bash
export PGPASSWORD=postgres
psql -h localhost -U postgres -d postgres -c "DROP DATABASE IF EXISTS online_store;"
psql -h localhost -U postgres -d postgres -c "CREATE DATABASE online_store OWNER postgres;"
psql -h localhost -U postgres -d online_store -v ON_ERROR_STOP=1 -f database/schema.sql
for m in database/migrations/*.sql; do psql -h localhost -U postgres -d online_store -v ON_ERROR_STOP=1 -f "$m"; done
psql -h localhost -U postgres -d online_store -v ON_ERROR_STOP=1 -f database/seed.sql
```

---

## Docker (local API stack)

From repository root (port **3000** and **5433** must be free):

```bash
docker compose -f deploy/local/docker-compose.yml up --build
```

- API: `http://localhost:3000/api/health`
- Postgres on host: `localhost:5433` (user/password/db: `postgres` / `postgres` / `online_store`)
- Schema/seed run automatically on first volume init

Then start frontends on the host (see below).

Stop:

```bash
docker compose -f deploy/local/docker-compose.yml down
# wipe DB volume:
docker compose -f deploy/local/docker-compose.yml down -v
```

---

## Backend — Node (default for frontends)

```bash
npm run dev
# or: npm start
```

Health: `http://localhost:3000/api/health`

OTP codes for customers are printed to the server console in development (`1234` in test mode; otherwise generated and logged).

---

## Backend — .NET (optional)

```bash
# PowerShell
$env:ASPNETCORE_ENVIRONMENT = "Development"
$env:DATABASE_HOST = "localhost"
$env:DATABASE_PORT = "5432"
$env:DATABASE_NAME = "online_store"
$env:DATABASE_USER = "postgres"
$env:DATABASE_PASSWORD = "postgres"
$env:JWT_SECRET = "development-only-jwt-secret-do-not-use-in-production"
$env:OTP_SECRET = "development-only-otp-hmac-secret-do-not-use-in-production"

dotnet restore backend-dotnet/Koz.sln
dotnet run --project backend-dotnet/src/Koz.Api/Koz.Api.csproj --urls http://127.0.0.1:5000
```

- Health: `http://localhost:5000/api/health`
- Readiness: `http://localhost:5000/health/ready`
- Swagger (Development only): `http://localhost:5000/swagger`

Point Vite `VITE_API_URL` at `http://localhost:5000/api` only when intentionally testing against .NET.

---

## Frontend

```bash
# Client PWA (customers)
npm run dev --workspace=@koz/client

# Staff (manager / admin)
npm run dev --workspace=@koz/staff

# Production builds
npm run build --workspace=@koz/client
npm run build --workspace=@koz/staff
```

---

## Migrations and seed

| Step | Command |
|---|---|
| Full reset | `./scripts/local/setup-db.sh` or `.\scripts\local\setup-db.ps1` |
| Schema only | `psql ... -f database/schema.sql` |
| Migrations | `001` → `002` → `003` in order |
| Seed | `psql ... -f database/seed.sql` (idempotent staff upserts) |

Destructive down migrations are **not** run automatically.

---

## Local URLs

| Surface | URL |
|---|---|
| Client app | http://localhost:5173 |
| Staff app | http://localhost:5174 |
| Node API | http://localhost:3000/api |
| Node health | http://localhost:3000/api/health |
| .NET API | http://localhost:5000/api |
| .NET health | http://localhost:5000/api/health |
| .NET ready | http://localhost:5000/health/ready |
| .NET Swagger | http://localhost:5000/swagger |
| Compose Postgres | localhost:5433 |

---

## Test accounts (seed)

Password for **all** staff accounts: `Manager123`

| Role | Email | App |
|---|---|---|
| Manager (`store_operator`) | `manager@koz.kz` | Staff → manager screens |
| Admin operations | `admin@koz.kz` | Staff → admin operations |
| Admin catalog | `catalog@koz.kz` | Staff → catalog |
| Admin customers | `customers@koz.kz` | Staff → customers |
| Customer | any phone via OTP | Client → OTP page; code in Node console |

Seed store id: `11111111-1111-1111-1111-111111111111`

There is no separate “operator” user beyond `store_operator` (manager).

---

## Stop everything

```bash
# Frontends / Node / .NET: Ctrl+C in each terminal

# Local Compose
docker compose -f deploy/local/docker-compose.yml down
```

---

## Typical errors

| Symptom | Fix |
|---|---|
| `EADDRINUSE :::3000` | Stop the other process/container using port 3000 |
| `password authentication failed` | Match `DATABASE_PASSWORD` to your Postgres role |
| Empty catalog | Run seed; confirm `VITE_STORE_ID` matches seed store |
| Staff login 401 | Password is `Manager123` after seed |
| CORS errors | Use `http://localhost:5173` / `5174`; Node development allows all origins if `CORS_ORIGINS` unset |
| .NET fails on JWT/OTP | Set `JWT_SECRET` and distinct `OTP_SECRET` (≥32 chars) or use Development defaults |
| Compose Postgres init skipped | Volume already exists — `down -v` then `up --build` |
| `psql` not found (Windows) | Add `C:\Program Files\PostgreSQL\16\bin` to PATH |

---

## Clean environment / recreate DB

```bash
# Host DB
./scripts/local/setup-db.sh

# Compose DB
docker compose -f deploy/local/docker-compose.yml down -v
docker compose -f deploy/local/docker-compose.yml up --build
```

---

## Why VPS Compose is not for local

`docker compose -f deploy/vps/docker-compose.yml up --build` alone fails on a clean laptop because it expects:

1. `deploy/vps/.env` (not committed; copy from `.env.production.example` and fill real secrets)
2. TLS files under `deploy/vps/nginx/tls/` (`fullchain.pem`, `privkey.pem`)
3. External PostgreSQL **or** `--profile postgres` with `DATABASE_HOST=postgres` and a non-`postgres` password
4. Production fail-fast validation (strong JWT/OTP, CORS origins, forwarded networks)
5. No Vite frontends in that stack (API + Nginx only)

For local work use **host stack** or **`deploy/local/docker-compose.yml`**.

Production handoff: see `PRODUCTION_HANDOFF.md`.
