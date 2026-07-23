# Backend pre-production environment inventory

**Goal:** BACKEND-PREPROD-DEPLOYMENT-VALIDATION  
**Captured:** 2026-07-24  
**Scope:** Facts observed on the validation host. No invented cloud/staging infrastructure.

## Host

| Item | Fact |
|---|---|
| OS | Microsoft Windows NT 10.0.26200.0 (`win-x64`) |
| CPU | 11th Gen Intel Core i5-11400H @ 2.70GHz, 12 logical processors |
| Memory | ~15.74 GB RAM |
| Disk | C: ~45 GB free at inventory time |
| Deployment platform | Local host (no Kubernetes/VM/cloud staging account available to this Goal) |
| Container runtime | **Absent** (`docker` not installed) |
| Reverse proxy / LB | **Absent** |
| DNS / hostname | Loopback `127.0.0.1` only |
| TLS termination | **Not present** (HTTP only) |

## Data plane

| Item | Fact |
|---|---|
| PostgreSQL | 16.14 (Visual C++ build 1944, 64-bit) |
| Host / network | `localhost:5432` (same host) |
| `max_connections` | **100** |
| Pre-prod database | `koz_dotnet_preprod` |
| Restore-test database | `koz_dotnet_preprod_restore` |
| App DB role | `koz_preprod` (non-default password; value not recorded here) |

## Application runtime

| Item | Fact |
|---|---|
| Deployment mechanism | `dotnet publish` Release artifact + `dotnet Koz.Api.dll` processes |
| Replica count (validation) | **2** (`:18181`, `:18182`) |
| Ports | App 18181/18182; Node dry-run `:3000`; Postgres `5432` |
| .NET host runtime | Microsoft.AspNetCore.App **10.0.10** |
| Logging destination | Process stdout/stderr captured under `artifacts/preprod/logs/` (best-effort) |
| Monitoring platform | **Absent** on this host |
| Secret injection | Process environment variables at start (not baked into publish output) |

## Sensitive configuration (no values)

| Variable | Present | Source | Format validity | Rotation owner |
|---|---|---|---|---|
| `DATABASE_PASSWORD` | present (runtime) | process env | non-default for Production role | not defined in repo docs |
| `JWT_SECRET` | present (runtime) | process env | ≥32, distinct from OTP | not defined in repo docs |
| `OTP_SECRET` | present (runtime) | process env | ≥32, ≠ JWT | not defined in repo docs |
| Admin `postgres` password (ops only) | present locally | existing test env | local-only; **not** used by Production app role | local operator |

## Implications for production

This Goal validated a **local production-like** process deployment because no separate managed staging stack (TLS, LB, metrics, Docker) was available. Production cutover still requires mapping these facts onto the real target platform (see GO / NO-GO doc).
