# Backend pre-production deployment validation report

**Goal:** BACKEND-PREPROD-DEPLOYMENT-VALIDATION  
**Date:** 2026-07-24  
**Prior signoff:** READY FOR PRODUCTION CUTOVER WITH CONDITIONS (`BACKEND_FINAL_RELEASE_SIGNOFF.md`)  
**This Goal type:** factual deployment validation (not a new code audit)

## Environment

See `BACKEND_PREPROD_ENVIRONMENT.md`.

Summary: Windows 10 host; PostgreSQL 16.14 localhost; **no Docker**; **no reverse proxy/TLS**; **no metrics platform**. Validation used Release `dotnet publish` + two Production process replicas.

## Artifact identity (immutable)

| Field | Value |
|---|---|
| Git commit | `bba8edb84ebc412556bc833f3caf64798096f66d` |
| Build | **Release** |
| Publish path | `artifacts/preprod/publish-bba8edb84ebc412556bc833f3caf64798096f66d` |
| `Koz.Api.dll` SHA-256 | `4848CF46329E1DA9CF612F48719787DD588AAAB4243B11FD2BA89FADCD5913C8` |
| Runtime | Microsoft.AspNetCore.App **10.0.10** |
| Image tag / digest | **N/A** (Docker daemon absent; process deployment is the validated path) |
| Mutable `latest` tag | Not used |

Manifest: `artifacts/preprod/artifact-manifest.json`.

## Backup / restore

| Check | Result |
|---|---|
| `pg_dump -Fc` | success |
| Size | 65529 bytes (non-empty) |
| SHA-256 | `9A2B6958CD371E69EC3F06904C626C8B39720D5A6619656B5E3FEBAB880E93E6` |
| Restore DB | `koz_dotnet_preprod_restore` via `pg_restore` |
| Post-restore | stores=1, users=4, products=4, inventory=4, orders=0, `otp_challenges` present |

Credentials were not written into reports.

## Migrations

Target DB created from `schema.sql` + ordered `001`–`003` + `seed.sql`.

| Migration | Status on preprod |
|---|---|
| 001 roles | applied (via clean install path) |
| 002 expand | applied / no-op when current |
| 003 OTP | table+index present (`IF NOT EXISTS`) |

No destructive down migrations executed.

## Runtime / container

| Check | Result |
|---|---|
| Start | 2× `dotnet Koz.Api.dll` Production |
| Startup | ~1.1s to dual readiness |
| Non-root container | N/A (process mode) |
| Port | 18181 / 18182 |
| Restart loop | none observed |
| Secrets in publish dir | none injected into files |
| Docker build/run | **unverified** (daemon absent) |

## Production config

Confirmed at runtime: `ASPNETCORE_ENVIRONMENT=Production`; pool 20 / connect 15s / command 30s; JWT+OTP present strong distinct; CORS one allow origin; payment initiation **false**; webhook fail-closed; shutdown 30s; `/__test/*` → 404; no in-memory OTP DI in Production path.

## TLS / proxy

**Not applicable on this host** — no reverse proxy, no TLS. `ForwardedHeaders` middleware is **not** implemented in `Koz.Api`. Production platforms that terminate TLS at an LB must define trusted proxy policy before relying on HTTPS scheme/client IP inside the app (today the API does not depend on generating absolute HTTPS URLs).

## CORS

Browser-like checks (Pass A/B):

- Allowed origin echoed on `/api/health`
- Denied origin not echoed
- OPTIONS preflight **204**
- No wildcard

## Auth / OTP

| Scenario | Result |
|---|---|
| Overwrite | hash changed |
| Wrong OTP | 403 |
| Create on A / consume on B | register **201** |
| Restart between create/consume | covered (A restarted) |
| Reuse | 403 |
| Expired | 403 |
| Plaintext in DB | **0** rows |
| Staff JWT | issued |

OTP recovery for validation used offline HMAC brute-force of 4-digit codes against DB hash with the runtime OTP secret (ops-only technique; production auth logic unchanged; plaintext never logged).

## Business smoke (Pass A/B)

| Probe | Status |
|---|---|
| Catalog | 200 |
| Profile | 200 |
| Order create | 201 |
| My orders / detail | 200 |
| Inventory / analytics | 200 |
| Admin customers | 200 |
| RBAC deny (manager→ops) | 403 |
| Ownership deny | 404 |
| Pay-online | **503** `online_payment_disabled` |
| Webhook | **503** |
| Payment side effects | none |

## Order concurrency

Isolated SKU stock **10**, **25** concurrent buyers (both passes): **10**×201, **15** conflicts, inventory **0**, no negative stock.

## Multi-replica

2 replicas; JWT valid on both; OTP A→B OK; sticky sessions **not** required.

## Failure / recovery

| Test | Result |
|---|---|
| Stop replica B | A readiness stays 200 |
| Restart B | recovered |
| Bad DB host process | readiness **503**, liveness **200** |

## Resource / DB connection budget

`max_connections=100`; validation used **2 × MaxPoolSize 20 = 40** (+ ops headroom) → **safe**.

Default MaxPoolSize **100** with ≥2 replicas against `max_connections=100` would be **unsafe** — must be configured per environment (documented in `BACKEND_CONFIGURATION_REFERENCE.md`).

## Observability

| Item | Status |
|---|---|
| Metrics platform | **absent** |
| Request ID correlation | **not configured** in app |
| Console log capture | best-effort; secrets not observed in evidence checks |

This is a **production cutover condition**, not an application correctness failure on this host.

## Payment gate

Production-gated: pay-online 503; webhook 503; no placeholder URL; no payment row changes. Kaspi not connected (accepted product limitation).

## Cutover dry run

1. Node started on `:3000` against same DB → health 200, catalog 200  
2. .NET dual replicas ready outside “traffic”  
3. Node drain/stop → .NET-only smoke continued  
4. Rollback simulation: Node restart  

Observed rollback duration (Node stop→healthy again): **~435 ms** (Pass A) — rehearsal evidence only, **not** an official RTO/SLA.

OTP limitation confirmed: .NET-issued OTP rejected by Node login (**403**); new OTP required after rollback.

## Two clean passes

| Pass | Result | Evidence |
|---|---|---|
| A | OK | `artifacts/preprod/pass-A-evidence.json` |
| B | OK | `artifacts/preprod/pass-B-evidence.json` |

No code/config changes between A and B. Script: `scripts/dotnet/preprod-validate.ps1`.

## Known limitations / unresolved conditions

1. No managed staging TLS/LB on validation host  
2. Docker image build/run still unverified  
3. No production-grade metrics/alerting on this host  
4. Online payment remains disabled (H2/R1)  
5. OTP rollback communication still required  
6. H4 cart ≤20 lines guidance unchanged  
7. Connection pool must be sized to replica count vs `max_connections`

## Final verdict

**PRE-PRODUCTION VALIDATION PASSED** → see `BACKEND_PRODUCTION_CUTOVER_GO_NO_GO.md`.
