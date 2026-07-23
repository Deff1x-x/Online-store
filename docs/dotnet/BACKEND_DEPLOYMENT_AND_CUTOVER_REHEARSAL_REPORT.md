# BACKEND DEPLOYMENT AND CUTOVER REHEARSAL REPORT

**Goal:** BACKEND-DEPLOYMENT-AND-CUTOVER-REHEARSAL  
**Date:** 2026-07-24  
**Verdict:** Stage ready for commit review (commit not performed)  
**Classification:** **Near-zero downtime with documented limitations** (not proven zero-downtime)

## Environment

| Item | Value |
|---|---|
| OS | Windows 10 / local PostgreSQL 16.14 |
| .NET | 10.0.302 |
| Docker | **Not installed** on rehearsal machine — Dockerfile provided; runtime rehearsal used `dotnet publish` |
| Fresh DBs | `koz_dotnet_cutover_fresh`, `koz_dotnet_cutover_migrate`, restore → `koz_dotnet_cutover_restore` |

## Artifact

| Path | Result |
|---|---|
| `scripts/dotnet/publish-api.ps1` | Release publish → `artifacts/dotnet-publish` (no secrets in output) |
| `backend-dotnet/Dockerfile` + `.dockerignore` | Multi-stage SDK→aspnet, non-root `koz`, port 8080, no SDK in final image |
| Container start | **Skipped** — Docker unavailable; not a product blocker for publish-based deploy |

## Clean install

- Mode `schema`: empty DB → `schema.sql` → migrations 001–003 → seed — **OK**
- Mode `migrate`: same ordered apply (schema + migrations; 002 skips when current; 003 idempotent) — **OK**
- `003` re-apply after `DROP TABLE otp_challenges`: **94 ms** on seed-sized DB; table+index restored

## Production configuration

| Check | Result |
|---|---|
| Production start with non-default DB user/password, JWT, OTP, CORS | **ready=true**; CORS allow; staff login; inventory/analytics/catalog 200 |
| Production rejects DB password `postgres` | Existing `DatabaseOptions` fail-fast |
| Production online pay disabled | `PaymentsOptions` default false; cannot set true without provider |
| Staging publish smoke | health/ready/otp/webhook 503/catalog 200 |

## Payment release condition (R1) — closed for .NET Production

- `POST /api/payments/orders/{id}/pay-online` → **503** `online_payment_disabled` when disabled
- No placeholder URL; no payment insert when gated
- Webhook remains `kaspi_webhook_disabled`
- Non-production remains enabled for Node parity tests
- **Intentional Production divergence from Node placeholder** — documented cutover safety gate (H2 still blocks real provider)

## Node-off

- Publish + Production/Staging smoke used **only** .NET on `:8080`
- No Node process required for cutover smoke
- Node remains for offline parity suites only

## Cutover simulation (local equivalent)

1. Node historically on `:3000`; .NET started alongside on `:8080` after readiness
2. Traffic switch = client base URL change (LB substitute)
3. Shared Postgres; JWT secret shared for continuity
4. Overlap: no process-local OTP/inventory (DB-backed)

## Rollback

- Schema 003 left in place; Node can read .NET-written business rows
- **OTP limitation:** .NET OTP rows are not consumable by Node memory Map — users must request a **new OTP** after rollback
- No destructive down-migration

## Backup/restore

```text
pg_dump -Fc koz_dotnet_cutover_fresh → artifacts/cutover_fresh.dump
pg_restore → koz_dotnet_cutover_restore
otp_challenges present; stores count = 1
```

Local `pg_dump` only — **not** claimed as production backup platform.

## Failure-during-deploy matrix (summary)

| Scenario | Detection | Action |
|---|---|---|
| Build/publish fail | CI non-zero | Do not deploy |
| Migration fail | psql ON_ERROR_STOP | Restore backup; do not switch traffic |
| Startup fail / wrong secret | Process exit / fail-fast | Fix config; no traffic |
| Readiness never healthy | Probe 503 | Keep Node; investigate DB |
| Instance crash after switch | 5xx / restarts | Rollback traffic to Node |

## Zero-downtime classification

**Near-zero downtime with limitations:**

- Requires readiness before switch and graceful drain
- Migration applied **before** traffic (003 is online-safe / short)
- OTP rollback limitation
- Not proven multi-region LB drain in this rehearsal

## Observability checklist

Request rate, 4xx/5xx, p95/p99, readiness, restarts, DB connections waiting, pool timeouts, locks/deadlocks, order conflicts, inventory errors, OTP failures, `online_payment_disabled` / webhook 503 counts. Rollback on sustained readiness failure or correctness breaks.

## Commands

```powershell
./scripts/dotnet/prepare-db.ps1 -ConnectionString 'Host=...;Database=koz_dotnet_cutover_fresh;...' -Mode schema
./scripts/dotnet/publish-api.ps1
./scripts/dotnet/validate-release.ps1
# run published API from artifacts/dotnet-publish with Production env (see configuration reference)
```

## Test totals (verification)

Documented in Goal self-review passes after final fixes.

## Changed files (this Goal)

See final response list.
