# BACKEND-FINAL-RELEASE-SIGNOFF

**Goal:** BACKEND-FINAL-RELEASE-SIGNOFF  
**Auditor role:** Independent Senior Backend Release Auditor  
**Date:** 2026-07-24  
**Question:** Can production traffic switch to the ASP.NET Core backend under documented deployment conditions?

## Exact commit / working tree

| Item | Value |
|---|---|
| HEAD | `ae73b300ea7acc09d710ef3c265b1c27f5ec8b83` — `release(dotnet): add deployment and cutover rehearsal` |
| Branch | `main` |
| Signoff deltas (uncommitted, no commit performed) | `scripts/dotnet/smoke-api.ps1` (param block order fix + webhook 503 assert); `docs/dotnet/RUN_DOTNET_LOCAL.md` (pool default numbers); this Goal + report |
| Secrets / debug / generated in git | None observed; `artifacts/` ignored; no test secrets committed |
| Environment | Windows 10; .NET 10; PostgreSQL 16 (`psql` at `C:\Program Files\PostgreSQL\16\bin\psql.exe`); Docker daemon **not installed** |

## Verification evidence (two consecutive clean passes after last fix)

| Pass | Command | Api.Tests | IntegrationTests | `git diff --check` |
|---|---|---|---|---|
| A (post-fix) | `dotnet test -c Release` | 37 passed / 0 failed / 0 skipped | 78 passed / 0 failed / 0 skipped | clean |
| B (consecutive) | `dotnet restore` + `build -warnaserror` + `test --no-build` | 37 / 0 / 0 | 78 / 0 / 0 | clean |

**Totals:** **115 / 115** tests passed; **0** skipped in this environment (all `KOZ_*_TEST_CONNECTION_STRING` set).

Additional rehearsals this signoff:

- Production fail-fast matrix: **10/10** cases exited non-zero before listen; messages matched class of fault; secrets not echoed (`artifacts/signoff-prod-matrix.json`).
- Publish: `scripts/dotnet/publish-api.ps1` → `artifacts/dotnet-publish`.
- Production publish smoke (Node port 3100 idle): readiness 200, liveness 200, products 200, webhook **503**, `smoke-api.ps1` OK.
- Schema equality `koz_dotnet_cutover_fresh` vs `koz_dotnet_cutover_migrate`: **SCHEMA_DIFF_COUNT=0**.

## Endpoint inventory summary

| Surface | Count / status |
|---|---|
| Business controller endpoints | **74** (matches `Net5MountedEndpointInventoryTests`) |
| Infra | `GET /api/health` (liveness), `GET /health/ready` (readiness), fallback `route_not_found` |
| Testing-only | 5× `/__test/auth/*` — registered **only** when `Environment == Testing` |
| Node mounted → .NET | Inventory test green: no `route_not_found` gaps |
| Duplicate / conflict | None found in controller route attributes |
| Unexpected anonymous (prod) | Auth OTP/register/login/staff/refresh; public store products; health; Kaspi webhook (fail-closed 503); readiness |
| Node runtime dependency | **None** for production path (Postgres OTP store in DI) |

Production-required surface is served with Node process/port off (rehearsed).

## Security status

| Gate | Result | Evidence |
|---|---|---|
| JWT secret validation (non-Dev) | Pass | `JwtOptions.Load` fail-fast; matrix `no_JWT` / `weak_JWT` |
| OTP secret validation; ≠ JWT | Pass | `OtpOptions.Load`; matrix `no_OTP` / `OTP_eq_JWT` |
| OTP shared storage | Pass | `Program.cs` → `PostgresOtpChallengeStore` only |
| In-memory OTP in production path | Pass | `MemoryOtpChallengeStore` exists only inside test assemblies |
| OTP atomic consume / NOW() TTL | Pass | OTP integration suite (78 includes OTP facts) |
| CORS fail-fast Production | Pass | matrix `empty_CORS` / `malformed_CORS` |
| RBAC / IDOR / store / customer scope | Pass | NET-1…NET-6 + certification suites |
| SQL parameterization | Pass | Npgsql parameters throughout repositories (prior audit + no raw string concat findings this pass) |
| Exception leakage | Pass | Node-compatible wrappers; model-state → generic 500 body |
| Secret/OTP logging | Pass | validators log host/port/db only |
| Payment webhook fail-closed | Pass | always `503` / `kaspi_webhook_disabled` |
| Online payment Production gate | Pass | default off; `true` rejected at startup; handler `503` / `online_payment_disabled` |
| Swagger | Pass | Development only |
| Cancellation → 499 | Pass | middleware + resilience tests |
| Dev fallbacks in Production | Pass | matrix + Production smoke |

## Database / migration status

| Item | Result |
|---|---|
| `schema.sql` includes `otp_challenges` | Yes |
| Migrations 001→002→003 ordered | Yes |
| 003 idempotent (`IF NOT EXISTS`) | Yes |
| Clean vs migrate structural equality | **0** column diffs (cutover DBs) |
| OTP rollback | Operational limitation: do **not** drop `otp_challenges`; Node cannot consume .NET OTP rows — new OTP after rollback |

## Auth / OTP status

Covered by `NetOtpSharedStorageIntegrationTests` + NET-1 auth (executed in Integration 78): request, overwrite, verify success/fail, expiry, reuse, concurrent consume, multi-instance persistence via Postgres, HMAC stability, no plaintext OTP in DB. Public error wrappers preserved.

## Order / inventory concurrency

`OrderConcurrency_fifty_buyers_never_oversell_stock_across_ten_resets` (stock 10, 50 buyers, 10 resets): successful orders = 10; no negative inventory; conflicts stable. Multi-instance factory covered in load suite. **H4:** documented capacity preference **≤20 cart lines** (measured, not “fixed”).

## Payment release state

| Behavior | Production |
|---|---|
| Online initiation | **Disabled** by default |
| Enable without provider | Startup refuse |
| Pay-online when disabled | `503` / `online_payment_disabled`; no placeholder URL; no side effects |
| Kaspi webhook | Always `503` / `kaspi_webhook_disabled` |
| Product day-1 online pay | External product decision — **not** a code regression; listed as release condition |

## Load / capacity conditions

- Pool defaults: max **100**, connect **15s**, command **30s**.
- ShutdownTimeout default **30s**.
- H4 cart line guidance ≤20.
- Postgres `max_connections` must accommodate instances × pool (ops checklist).

## Health / failure / shutdown

| Probe | Path |
|---|---|
| Liveness | `GET /api/health` |
| Readiness | `GET /health/ready` (postgres + shutdown gate) |
| Startup DB validate | `DatabaseConnectionValidator` (default on) |
| Client cancel | **499**, not 500 |
| Middleware order | Exception/cancellation mapping before endpoint failures; CORS + auth + health as configured in `Program.cs` |

Load suite covers DB down after start, recovery, pool wait, graceful transaction rollback, shutdown readiness.

## Deployment artifact

| Artifact | Status |
|---|---|
| `backend-dotnet/Dockerfile` | Multi-stage; non-root `koz` 10001; `ASPNETCORE_URLS=http://+:8080`; Production env; no secrets baked |
| `.dockerignore` | Excludes tests/tools/docs/.env |
| `publish-api.ps1` | Release publish verified this signoff |
| Startup | `dotnet Koz.Api.dll` |
| **Docker runtime** | **`container runtime unverified`** (no Docker daemon on auditor host) |

If production deploys only via Docker: **mandatory pre-cutover condition** — real `docker build` + `docker run` + readiness/smoke/SIGTERM on the deployment host/CI.

## Configuration matrix (Production)

| Case | Result |
|---|---|
| no DB | fail-fast |
| default DB password `postgres` | fail-fast |
| no/weak JWT | fail-fast |
| no OTP / OTP==JWT | fail-fast |
| empty / `*` CORS | fail-fast |
| invalid pool size | fail-fast |
| payment enabled in Production | fail-fast |
| bad DB host / invalid timeout | covered by DatabaseOptions validation + readiness (same class) |

Mandatory variables: see `BACKEND_CONFIGURATION_REFERENCE.md` (DB_*, JWT_SECRET, OTP_SECRET, Cors origins, ASPNETCORE_ENVIRONMENT=Production).

## Node-off

Node not listening on `:3100` during Production publish smoke. .NET alone served health, readiness, catalog read, OTP, webhook fail-closed. No proxy/fallback to Node in ASP.NET pipeline.

## Rollback

Documented in `BACKEND_ROLLBACK_RUNBOOK.md`. Compatibility: shared schema; JWT if same secret; migration 003 harmless to Node; **OTP re-request required** after rollback to Node. Do not drop `otp_challenges`.

## Skips

In this signoff run: **zero skips**. Conditional skips when env vars unset are documented in `RUN_DOTNET_LOCAL.md` (per-suite `KOZ_*_TEST_CONNECTION_STRING`). `PostgresConnectionTests` uses `KOZ_TEST_DATABASE_CONNECTION_STRING` — executed here; if unset, skip is acceptable because readiness/DB suites elsewhere cover connectivity when their vars are set, and production has separate readiness validation.

## Findings (this Goal)

| ID | Severity | Location | Reproduction | Impact | Fix | Confidence | Status |
|---|---|---|---|---|---|---|---|
| S1 | Medium (tooling) | `scripts/dotnet/smoke-api.ps1` | `param` after `$ErrorActionPreference` → PowerShell parse error | Release smoke script unusable | Move `param` first; assert webhook 503 | High | **Fixed** |
| S2 | Low (docs) | `RUN_DOTNET_LOCAL.md` | Pool defaults omitted vs config reference | Operator ambiguity | Restate 100/15/30 | High | **Fixed** |

No open code defects in approved backend scope. No artificial findings.

## Known limitations

1. Real Kaspi / online provider absent (H2) — Production initiation disabled by design (R1).
2. OTP rollback: Node cannot consume `.NET` OTP rows — communicate re-request.
3. H4: prefer ≤20 cart lines.
4. Docker image build/run not verified on this host.
5. Cutover classified near-zero downtime **with limitations**, not proven zero-downtime multi-region.

## Mandatory release conditions (pre-traffic)

- [ ] Production DB backup (+ restore smoke in non-prod)
- [ ] Migrations **001–003** applied
- [ ] Valid non-default DB credentials
- [ ] Strong `JWT_SECRET` (≥32)
- [ ] Strong distinct `OTP_SECRET`
- [ ] Explicit CORS origins
- [ ] Verified `GET /health/ready` on all instances
- [ ] Online payment remains **disabled** in Production (or product accepts 503)
- [ ] Node drain plan
- [ ] Rollback artifact (Node revision + DB backup)
- [ ] OTP rollback communication prepared
- [ ] Monitoring (errors, readiness, pool, locks, `online_payment_disabled` counts)
- [ ] Smoke commands (`smoke-api.ps1` / checklist)
- [ ] Cart line capacity condition communicated (≤20)
- [ ] **If Docker is the deploy path:** verified image build/run + SIGTERM before switch

Owners/window: assign at execution time (not invented here). Checklist: `BACKEND_RELEASE_CHECKLIST.md`.

## Final verdict

**READY FOR PRODUCTION CUTOVER WITH CONDITIONS**

Traffic may switch to the ASP.NET Core backend when the mandatory release conditions above are satisfied. Conditions are operational / product / platform (payment provider, Docker verification if used, capacity/OTP communication)—not unresolved code regressions in the audited .NET release scope.
