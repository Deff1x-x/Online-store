# Production Handoff

**Project:** Клуб Оптовых Цен (KOZ)  
**Version:** 1.0  
**Date:** July 2026  
**Purpose:** Enable a DevOps/production team to deploy and operate this system without contacting the development team.

---

## 1. System overview

Subscription-based grocery delivery from micro-darkstores (Almaty). Customers pay membership (3 900 ₸/month), order at wholesale prices. Two-part payment: 80% online preauth + remainder to courier POS after weighing.

**Components:**
- **Backend (primary):** ASP.NET (.NET 10) — `backend-dotnet/`
- **Backend (rollback):** Node.js/Express — `src/`
- **Frontend (client):** React SPA (mobile-first PWA) — `apps/client/`
- **Frontend (staff):** React SPA (desktop-first) — `apps/staff/`
- **Database:** PostgreSQL 16+
- **Reverse proxy:** Nginx 1.27
- **Containerization:** Docker Compose

## 2. Repository structure

```
.
├── apps/client/          # Client PWA (Vite + React)
├── apps/staff/           # Manager/Admin app (Vite + React)
├── packages/api/         # Shared API client
├── packages/ui/          # Shared UI components
├── backend-dotnet/       # .NET 10 API (primary)
│   ├── src/Koz.Api/      # Entry point
│   ├── Dockerfile        # Production multi-stage image
│   └── tests/            # Unit + integration tests
├── src/                  # Node.js API (rollback)
├── database/
│   ├── schema.sql        # Full schema
│   ├── migrations/       # 001–003 ordered migrations
│   └── seed.sql          # Test/development seed data
├── deploy/vps/           # Docker Compose + Nginx + env template
├── scripts/vps/          # Deployment, migration, backup, rollback scripts
├── scripts/tz/           # TZ compliance tests and evidence
├── docs/                 # Documentation
└── .github/workflows/    # CI pipeline
```

## 3. Runtime dependencies and supported versions

| Dependency | Version | Notes |
|---|---|---|
| .NET SDK | 10.0 | Build only; runtime image `mcr.microsoft.com/dotnet/aspnet:10.0` |
| Node.js | ≥ 20 | Rollback API + frontend build |
| PostgreSQL | 16+ | Primary data store |
| Docker Engine | ≥ 24 | Container runtime |
| Docker Compose | v2 plugin | Orchestration |
| Nginx | 1.27-alpine | Reverse proxy (runs in container) |

## 4. Required infrastructure

- **1 Linux VPS** (Ubuntu 22.04/24.04 recommended), ≥ 2 vCPU, ≥ 2 GB RAM, ≥ 20 GB disk
- **Public ports:** 80, 443 only
- **PostgreSQL:** external managed DB or co-located via Compose profile `postgres`
- **DNS:** A/AAAA record for API hostname
- **TLS:** Certbot (webroot) or operator-provided certificate

## 5. Production configuration variables

All configuration is via environment variables. Template: `deploy/vps/.env.production.example`.  
Full reference: `docs/dotnet/BACKEND_CONFIGURATION_REFERENCE.md`.

Copy template: `cp deploy/vps/.env.production.example deploy/vps/.env`  
Protect: `chmod 600 deploy/vps/.env`

| Variable | Required | Format | Sensitive | Provider |
|---|---|---|---|---|
| `ASPNETCORE_ENVIRONMENT` | Yes | `Production` | No | Set to `Production` |
| `ASPNETCORE_URLS` | Yes | URL | No | `http://+:8080` |
| `DATABASE_HOST` | Yes | hostname | No | Operator |
| `DATABASE_PORT` | Yes | 1–65535 | No | Default `5432` |
| `DATABASE_NAME` | Yes | identifier | No | Operator |
| `DATABASE_USER` | Yes | identifier | No | Operator |
| `DATABASE_PASSWORD` | Yes | ≥16 chars, ≠ `postgres` | **Yes** | Operator |
| `JWT_SECRET` | Yes | ≥32 chars, unique | **Yes** | Generate: `openssl rand -base64 48` |
| `OTP_SECRET` | Yes | ≥32 chars, ≠ JWT_SECRET | **Yes** | Generate: `openssl rand -base64 48` |
| `Cors__AllowedOrigins__0` | Yes | `https://your-domain.com` | No | Operator |
| `ForwardedHeaders__Enabled` | Yes | `true` | No | Set `true` behind Nginx |
| `ForwardedHeaders__KnownNetworks__0` | Yes | CIDR | No | Docker network CIDR |
| `PAYMENTS_ONLINE_INITIATION_ENABLED` | No | `true`/`false` | No | Default `true` (placeholder) |
| `KOZ_IMAGE_TAG` | Deploy | git SHA | No | `git rev-parse HEAD` |

**No source code changes required.** All environment differences are configured via `.env`.

## 6. Secret ownership matrix

| Secret | Generator | Rotator | Storage |
|---|---|---|---|
| `DATABASE_PASSWORD` | Operator | Operator | `.env` (chmod 600) |
| `JWT_SECRET` | Operator | Operator (requires session reset) | `.env` |
| `OTP_SECRET` | Operator | Operator | `.env` |
| TLS private key | Certbot / Operator | Certbot auto-renew | `deploy/vps/nginx/tls/` |
| Payment provider keys | Acquiring contract (future) | Provider portal | `.env` (when available) |

## 7. Build commands

```bash
# Backend (.NET Release)
dotnet restore backend-dotnet/Koz.sln
dotnet build backend-dotnet/Koz.sln -c Release
dotnet publish backend-dotnet/src/Koz.Api/Koz.Api.csproj -c Release -o publish

# Frontend
npm ci
npm run build --workspace=@koz/client    # → apps/client/dist/
npm run build --workspace=@koz/staff     # → apps/staff/dist/

# Tests
dotnet test backend-dotnet/tests/Koz.Api.Tests/Koz.Api.Tests.csproj -c Release
npm run test --workspace=@koz/client
```

## 8. Artifact/image creation

```bash
export KOZ_IMAGE_TAG="$(git rev-parse HEAD)"
./scripts/vps/build-artifacts.sh
# Creates: koz-api:$TAG, koz-node:$TAG
```

Images are multi-stage, Release-mode, non-root, health-checked.

## 9. Database creation and privileges

```sql
CREATE USER koz_api WITH PASSWORD '<strong-password>';
CREATE DATABASE online_store OWNER koz_api;
GRANT ALL PRIVILEGES ON DATABASE online_store TO koz_api;
```

## 10. Migration procedure

```bash
# Requires: psql, DATABASE_* env vars, BACKUP_CONFIRMED=yes
BACKUP_CONFIRMED=yes ./scripts/vps/migrate-production.sh
```

- Applies `database/schema.sql` + `database/migrations/001–003`
- Verifies `otp_challenges` table exists
- Refuses without `BACKUP_CONFIRMED=yes`
- Idempotent (IF NOT EXISTS guards)
- No destructive down migrations

Check current version: `SELECT to_regclass('public.otp_challenges') IS NOT NULL;`

## 11. Seed behavior

`database/seed.sql` creates test store, products, staff accounts.  
**Not for production.** Test passwords are weak.  
Production stores/products/staff are created via admin UI or direct SQL.

## 12. Frontend deployment

Frontend apps are compiled static assets served by Nginx.

Client: `apps/client/dist/` → SPA with `index.html` fallback  
Staff: `apps/staff/dist/` → SPA with `index.html` fallback

**Current setup:** API-only Nginx config proxies to backend. Frontend static hosting is a separate concern (CDN, S3, or Nginx static server block).

Build-time variable: `VITE_API_URL` (default from `.env`), `VITE_STORE_ID`.

## 13. Backend deployment

```bash
./scripts/vps/validate-host.sh           # Check prerequisites
./scripts/vps/validate-env.sh deploy/vps/.env  # Validate config
./scripts/vps/build-artifacts.sh          # Build images
./scripts/vps/start-stack.sh              # Start Compose stack
./scripts/vps/direct-smoke.sh dotnet-api 8080  # Bypass-Nginx smoke
```

Full cutover (includes backup + migration + build + start + switch + observe):
```bash
CUTOVER_CONFIRMED=yes BACKUP_DIR=/var/backups/koz ./scripts/vps/cutover.sh
```

## 14. Reverse proxy contract

Nginx handles:
- HTTP → HTTPS redirect
- TLS termination
- API proxying to active upstream (`koz_active`)
- `X-Forwarded-For/Proto/Host` headers
- `X-Request-ID` propagation
- `client_max_body_size: 2m`
- `server_tokens off`
- JSON structured access logs

Config: `deploy/vps/nginx/`

## 15. Forwarded headers / trusted proxies

.NET reads `X-Forwarded-*` only from `ForwardedHeaders__KnownNetworks__*`.  
Set to Docker bridge CIDR (inspect: `docker network inspect koz-prod_koz_internal`).

## 16. Health checks

| Endpoint | Backend | Purpose |
|---|---|---|
| `GET /health/ready` | .NET | Readiness (checks PostgreSQL) |
| `GET /api/health` | Node | Liveness |

Docker Compose health checks use these endpoints.

## 17. Smoke tests

```bash
# After deployment
./scripts/vps/direct-smoke.sh dotnet-api 8080
./scripts/vps/direct-smoke.sh node-api 3000
curl -fsS https://your-api-domain/api/health
```

## 18. Backup

```bash
./scripts/vps/backup-pre-cutover.sh /var/backups/koz
# Output: timestamped pg_dump, SHA256 hash
```

## 19. Restore

```bash
# Into SEPARATE verification DB (never overwrites production directly)
./scripts/vps/restore-verify.sh /path/to/file.dump verify_db_name
```

To restore into production: stop app → drop/recreate DB → pg_restore → migrate → start.

## 20. Rollback

```bash
./scripts/vps/rollback-to-node.sh
```

- Switches Nginx upstream to Node
- No schema changes (forward-compatible)
- OTP limitation: users must request new OTP after rollback (Node uses in-memory OTP, not DB table)
- Full docs: `docs/dotnet/BACKEND_ROLLBACK_RUNBOOK.md`

## 21. Payment placeholder and activation

Payment online initiation is a **placeholder** until acquiring contract with payment provider.

- `PAYMENTS_ONLINE_INITIATION_ENABLED=true` → placeholder (returns mock payment URL)
- `PAYMENTS_ONLINE_INITIATION_ENABLED=false` → kill-switch (503)
- Kaspi webhook → always 503 (placeholder)

**Activation procedure:** obtain acquiring contract → implement real provider in `payments/provider.ts` (frontend) and backend payment controller → set real provider credentials in `.env` → deploy.

## 22. OTP behavior

- Development: OTP code is always `1234`, printed to console
- Production: OTP code is HMAC-hashed, stored in `otp_challenges` table
- SMS delivery requires SMS provider integration (not implemented — console output only)
- OTP expires after 300 seconds

## 23. Expected ports and paths

| Port | Service | Network |
|---|---|---|
| 80 | Nginx HTTP | Public |
| 443 | Nginx HTTPS | Public |
| 8080 | .NET API | Internal (Docker) |
| 3000 | Node API | Internal (Docker) |
| 5432 | PostgreSQL | Internal |

## 24. Logs and troubleshooting

- **Nginx:** JSON structured logs in `nginx_logs` volume
- **.NET:** Console structured logs (stdout → Docker json-file driver)
- **Node:** Console logs (stdout)
- **Request correlation:** `X-Request-ID` header set by Nginx, available in logs
- **Troubleshooting:** `./scripts/vps/observe.sh 60` for live container stats + logs

## 25. Known external prerequisites

| Prerequisite | Status | Required for |
|---|---|---|
| Payment acquiring contract | **Not obtained** | Real payment processing |
| SMS provider | **Not integrated** | OTP delivery to users |
| Monitoring platform | **Not deployed** | Alerting (health endpoints ready) |
| Domain + DNS | **Operator provides** | Public access |
| TLS certificate | **Operator provides** | HTTPS |

## 26. Release checklist

1. ☐ Clone repository
2. ☐ Fill `deploy/vps/.env` from template
3. ☐ Validate: `./scripts/vps/validate-env.sh deploy/vps/.env`
4. ☐ Validate host: `./scripts/vps/validate-host.sh`
5. ☐ Create PostgreSQL database + user
6. ☐ Run migrations: `BACKUP_CONFIRMED=yes ./scripts/vps/migrate-production.sh`
7. ☐ Build images: `./scripts/vps/build-artifacts.sh`
8. ☐ Configure DNS + TLS
9. ☐ Update `server_name` in `deploy/vps/nginx/conf.d/koz-api.conf`
10. ☐ Start stack: `./scripts/vps/start-stack.sh`
11. ☐ Smoke test: `./scripts/vps/direct-smoke.sh dotnet-api 8080`
12. ☐ Verify public: `curl -fsS https://your-domain/api/health`
13. ☐ Create production admin user via SQL
14. ☐ Set up backup schedule
15. ☐ Set up TLS renewal

## 27. Post-deploy verification

```bash
# Health
curl -fsS https://your-domain/health/ready
# Guest catalog
curl -fsS https://your-domain/api/products/store/YOUR_STORE_ID
# Staff login
curl -fsS -X POST https://your-domain/api/auth/staff/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@your-domain","password":"your-admin-password"}'
```

## 28. Emergency contacts

> **Fill in by the receiving organization:**
>
> - On-call engineer: _______________
> - Database administrator: _______________
> - Network/infrastructure: _______________
> - Product owner: _______________
> - Payment provider support: _______________
