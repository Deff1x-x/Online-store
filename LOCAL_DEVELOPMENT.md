# Local Development

Single entry point for running KOZ on a clean machine **without editing source code**.

**Default backend for local work is ASP.NET Core** (host stack and `deploy/local` Docker).

Node is **legacy / parity / rollback only** — start it explicitly via `npm run dev:node` or Compose profile `legacy`. Do not use Node for ordinary product verification.

> `deploy/vps/docker-compose.yml` is the **production VPS** stack. It requires a filled `.env`, TLS certificates, and either an external database or the `postgres` profile. It is **not** a one-command local developer path. See [Why VPS Compose is not for local](#why-vps-compose-is-not-for-local).

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | ≥ 20 |
| npm | ≥ 10 (comes with Node) |
| .NET SDK | 10.x |
| PostgreSQL | 16+ (or Docker for DB / full local API stack) |
| Docker Desktop | optional — for `deploy/local` |

Free local ports: **5000** (.NET API), **5173** (client), **5174** (staff), **5432** (host Postgres) or **5433** (Compose Postgres). Port **3000** is reserved for explicit Node legacy only.

---

## A. Recommended full local run (host)

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

Prepare the database (host Postgres on `localhost:5432`):

```bash
# Linux / macOS
./scripts/local/setup-db.sh

# Windows PowerShell
.\scripts\local\setup-db.ps1

# Cross-platform
npm run db:setup
```

Start the default stack (**.NET API + client + staff**):

```bash
npm run dev
```

| Surface | URL |
|---|---|
| Client | http://localhost:5173 |
| Staff | http://localhost:5174 |
| .NET API | http://localhost:5000/api |
| Health | http://localhost:5000/api/health |
| Ready | http://localhost:5000/health/ready |
| Swagger | http://localhost:5000/swagger |

Confirm frontends use `VITE_API_URL=http://localhost:5000/api` (from `.env.example`). There is no silent fallback to Node `:3000`.

---

## B. Manual split run

1. PostgreSQL running; `npm run db:setup` once.
2. API:

```bash
npm run dev:api
# or:
dotnet run --project backend-dotnet/src/Koz.Api/Koz.Api.csproj --urls http://127.0.0.1:5000
```

3. Frontends:

```bash
npm run dev:client
npm run dev:staff
```

`.NET` does not read `.env` itself. Prefer `npm run dev` / `npm run dev:api` (they load root `.env`), or export `DATABASE_*`, `JWT_SECRET`, `OTP_SECRET`, and `ASPNETCORE_ENVIRONMENT=Development` before `dotnet run`. In Development, JWT/OTP may fall back to built-in non-production placeholders when unset; `Database:Password` defaults via `appsettings.Development.json` to local `postgres`.

---

## C. Docker local run

From repository root (ports **5000** and **5433** must be free):

```bash
docker compose -f deploy/local/docker-compose.yml up --build
```

Default services: **postgres** + **dotnet-api**. Node is **not** started.

| Surface | URL |
|---|---|
| .NET API (host) | http://localhost:5000/api |
| Health | http://localhost:5000/api/health |
| Ready | http://localhost:5000/health/ready |
| Swagger | http://localhost:5000/swagger |
| Compose Postgres | localhost:5433 (`postgres` / `postgres` / `online_store`) |

Schema, migrations `001`–`003`, and seed run on **first** volume init. Reset:

```bash
docker compose -f deploy/local/docker-compose.yml down -v
docker compose -f deploy/local/docker-compose.yml up --build
```

Logs:

```bash
docker compose -f deploy/local/docker-compose.yml logs -f dotnet-api
docker compose -f deploy/local/docker-compose.yml ps
```

Then start frontends on the host (`npm run dev:client` / `npm run dev:staff`) with `VITE_API_URL=http://localhost:5000/api`.

---

## D. Legacy Node mode (parity / rollback only)

Do **not** use Node for normal product checks.

```bash
# Host — Node alone on :3000 (does not start .NET or Vite)
npm run dev:node

# Host — Node :3000 + .NET :5000 for contract comparison (no Vite)
npm run dev:parity

# Compose — add Node beside default Postgres + .NET
docker compose -f deploy/local/docker-compose.yml --profile legacy up --build
```

Point a frontend at Node only when intentionally testing legacy:

```bash
# temporary shell override
VITE_API_URL=http://localhost:3000/api npm run dev:client
```

Product A7/B7/Playwright default to `.NET :5000`. To force Node for a parity run: `KOZ_E2E_ALLOW_NODE=1` and `KOZ_E2E_API_URL=http://127.0.0.1:3000/api`.

---

## Environment

Root `.env` (scripts + Node legacy; copied into Vite apps via app `.env`):

| Variable | Local default | Notes |
|---|---|---|
| `DATABASE_HOST` | `localhost` | Compose API uses `postgres` |
| `DATABASE_PORT` | `5432` | Use `5433` from host → Compose Postgres |
| `DATABASE_NAME` | `online_store` | |
| `DATABASE_USER` | `postgres` | |
| `DATABASE_PASSWORD` | `postgres` | Local only |
| `JWT_SECRET` | development placeholder | ≥32 chars |
| `OTP_SECRET` | development placeholder | Required for .NET; must ≠ `JWT_SECRET` |
| `PORT` | `3000` | Legacy Node only |
| `VITE_API_URL` | `http://localhost:5000/api` | **.NET** default |
| `VITE_STORE_ID` | `11111111-1111-1111-1111-111111111111` | Seed store |

Do **not** commit real `.env` files. Example files contain development placeholders only.

---

## .NET Development contract

| Concern | Local Development |
|---|---|
| Environment | `ASPNETCORE_ENVIRONMENT=Development` |
| Port | `5000` (host) / container `8080` published as `5000` |
| DB | Host Postgres or Compose `postgres` |
| JWT / OTP | Env or Development built-in placeholders (not valid in Production) |
| CORS | `localhost` / `127.0.0.1` on `:5173` and `:5174` |
| Swagger | http://localhost:5000/swagger |
| Liveness | `GET /api/health` |
| Readiness | `GET /health/ready` |
| OTP | Fixed local code **`1234`** (Development + Testing). Plaintext OTP is **not** logged. |
| Payments | Non-production placeholder behavior per TZ (Production keeps initiation disabled by default) |
| Testing-only routes | `/__test/*` mapped only in `Testing`, not Development |

Production validation is unchanged and remains fail-closed for weak secrets, `postgres` DB password, empty CORS, etc.

---

## Migrations and seed

| Step | Command |
|---|---|
| Full reset | `npm run db:setup` / `./scripts/local/setup-db.sh` / `.\scripts\local\setup-db.ps1` |
| Schema only | `psql ... -f database/schema.sql` |
| Migrations | `001` → `002` → `003` in order |
| Seed | `psql ... -f database/seed.sql` (idempotent staff upserts) |

Scripts verify the Postgres connection first, apply SQL (not EF), seed, and exit non-zero on failure. They do not start Node.

Destructive down migrations are **not** run automatically.

---

## Local URLs

| Surface | URL |
|---|---|
| Client app | http://localhost:5173 |
| Staff app | http://localhost:5174 |
| **.NET API (default)** | http://localhost:5000/api |
| .NET health | http://localhost:5000/api/health |
| .NET ready | http://localhost:5000/health/ready |
| .NET Swagger | http://localhost:5000/swagger |
| Node API (legacy only) | http://localhost:3000/api |
| Node health (legacy) | http://localhost:3000/api/health |
| Host Postgres | localhost:5432 |
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
| Customer | any phone via OTP | Client → OTP; Development code **`1234`** |

Seed store id: `11111111-1111-1111-1111-111111111111`

These credentials are development-only and come from `database/seed.sql`. There is no separate “operator” user beyond `store_operator` (manager).

### Customer OTP (local .NET)

1. Call `POST /api/auth/otp` with `{ "phone": "…" }` (or use the Client OTP screen).
2. Enter code **`1234`** in Development (and Testing).
3. Production uses random codes; they are never returned in the API body and are never logged.

---

## Root npm scripts

| Script | Purpose |
|---|---|
| `npm run dev` | .NET + client + staff |
| `npm run dev:api` | .NET API only |
| `npm run dev:client` | Client Vite |
| `npm run dev:staff` | Staff Vite |
| `npm run dev:node` | Legacy Node only |
| `npm run dev:parity` | Node + .NET (no Vite) |
| `npm run db:setup` | Recreate DB + schema + migrations + seed |

---

## Stop everything

```bash
# Frontends / .NET / Node: Ctrl+C in each terminal (or the npm run dev process)

# Local Compose
docker compose -f deploy/local/docker-compose.yml down
```

---

## Typical errors

| Symptom | Fix |
|---|---|
| `EADDRINUSE :::5000` | Stop the other process/container using port 5000 |
| `EADDRINUSE :::3000` | Only expected for legacy Node — stop the other process |
| `password authentication failed` | Match `DATABASE_PASSWORD` to your Postgres role |
| Empty catalog | Run seed; confirm `VITE_STORE_ID` matches seed store |
| Staff login 401 | Password is `Manager123` after seed; API must be .NET `:5000` |
| CORS errors | Origins must be `http://localhost:5173` / `5174` (or `127.0.0.1`); restart API after CORS changes |
| .NET fails on JWT/OTP | Set `JWT_SECRET` and distinct `OTP_SECRET` (≥32 chars) or use Development defaults |
| OTP rejected | Use `1234` against Development .NET; do not expect Node console codes |
| Compose Postgres init skipped | Volume already exists — `down -v` then `up --build` |
| `psql` not found (Windows) | Add `C:\Program Files\PostgreSQL\16\bin` to PATH |
| Frontend still hits `:3000` | Recopy `.env.example` → `.env` / app `.env` files; restart Vite |

---

## Clean environment / recreate DB

```bash
# Host DB
npm run db:setup

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

For local work use **host `npm run dev`** or **`deploy/local/docker-compose.yml`**.

Production handoff: see `PRODUCTION_HANDOFF.md`.
