# Backend configuration reference

**Goal:** BACKEND-DEPLOYMENT-AND-CUTOVER-REHEARSAL  
Do not store real secrets in git. Placeholders only.

## Deployment units

| Unit | Detail |
|---|---|
| API project | `backend-dotnet/src/Koz.Api` |
| Runtime | .NET **10** (`net10.0`) |
| PostgreSQL | 16+ recommended (rehearsal used 16.14) |
| Schema | `database/schema.sql` |
| Migrations (ordered) | `001_standardize_user_roles.sql`, `002_expand_core_schema.sql`, `003_otp_challenges.sql` |
| Seed (non-prod) | `database/seed.sql` |
| Artifact | `dotnet publish` → `artifacts/dotnet-publish` **or** `backend-dotnet/Dockerfile` |
| Listen | `ASPNETCORE_URLS` (container default `http://+:8080`) |
| Liveness | `GET /api/health` |
| Readiness | `GET /health/ready` |
| Shutdown | `Host:ShutdownTimeoutSeconds` (default 30) |
| External deps | PostgreSQL only (no Redis/broker); payment provider absent (H2) |

## Environment variables

| Name | Required | Format | Sensitive | Startup validation | Restart to change | Example placeholder |
|---|---|---|---|---|---|---|
| `ASPNETCORE_ENVIRONMENT` | Yes (prod) | `Production` / `Staging` / … | No | Drives fail-fast rules | Yes | `Production` |
| `ASPNETCORE_URLS` | Recommended | URL list | No | Kestrel bind | Yes | `http://0.0.0.0:8080` |
| `DATABASE_HOST` | Prod yes | hostname | No | Yes | Yes | `db.internal` |
| `DATABASE_PORT` | Prod yes | 1–65535 | No | Yes | Yes | `5432` |
| `DATABASE_NAME` | Prod yes | identifier | No | Yes | Yes | `online_store` |
| `DATABASE_USER` | Prod yes | identifier | No | Yes | Yes | `koz_api` |
| `DATABASE_PASSWORD` | Prod yes | non-empty; **≠ `postgres` in Production** | **Yes** | Yes | Yes | `<set-at-runtime>` |
| `Database:ConnectionString` | Tests/opt | Npgsql CS | **Yes** | Prefer over ambient env when set | Yes | (tests only) |
| `DATABASE_MAX_POOL_SIZE` | No | 1–500 (default 100) | No | Yes | Yes | `100` |
| `DATABASE_MIN_POOL_SIZE` | No | 0–max (default 0) | No | Yes | Yes | `0` |
| `DATABASE_CONNECTION_TIMEOUT_SECONDS` | No | 1–120 (default 15) | No | Yes | Yes | `15` |
| `DATABASE_COMMAND_TIMEOUT_SECONDS` | No | 1–300 (default 30) | No | Yes | Yes | `30` |
| `DATABASE_CONNECTION_IDLE_LIFETIME_SECONDS` | No | 30–3600 (default 300) | No | Yes | Yes | `300` |
| `JWT_SECRET` | Outside Dev | ≥32; not weak/dev default | **Yes** | Yes | Yes | `<set-at-runtime>` |
| `OTP_SECRET` | Outside Dev | ≥32; **≠ JWT_SECRET** | **Yes** | Yes | Yes | `<set-at-runtime>` |
| `Cors__AllowedOrigins__N` | Production ≥1 | absolute http(s) origin; no `*` | No | Yes | Yes | `https://app.example.com` |
| `PAYMENTS_ONLINE_INITIATION_ENABLED` | No | `true`/`false` | No | Production **rejects `true`** until provider | Yes | unset → Production `false` |
| `Host:ShutdownTimeoutSeconds` | No | 5–120 (default 30) | No | Configured at start | Yes | `30` |
| `Database:ValidateOnStartup` | No | bool (default true) | No | Hosted `SELECT 1` | Yes | `true` |

Appsettings mirrors (non-secret): `Database:*`, `Cors:AllowedOrigins`, `Payments:OnlineInitiationEnabled`, `Host:ShutdownTimeoutSeconds`.

## Payment release gate (R1)

- **Production default:** online initiation **disabled** (`503` / `online_payment_disabled`).
- Enabling in Production throws at startup until a real provider contract exists.
- Non-production defaults **enabled** for Node parity tests.
- Kaspi webhook always fail-closed (`503` / `kaspi_webhook_disabled`).

## Known capacity notes

- H4: prefer carts ≤ 20 line items.
- OTP requires migration `003` + `OTP_SECRET`.
