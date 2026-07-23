# BACKEND LOAD AND RESILIENCE AUDIT REPORT

**Goal ID:** BACKEND-LOAD-AND-RESILIENCE-AUDIT  
**Date:** 2026-07-24  
**Verdict:** Stage ready for commit review (commit not performed in this Goal)  
**Self-review:** two consecutive clean passes required — see Goal checklist.

> Audit thresholds in this document are **exploratory** and are **not** an approved product SLA.

## 1. Environment & methodology

See `BACKEND_LOAD_AND_RESILIENCE_BASELINE.md` and `BACKEND_CAPACITY_BASELINE.md`.

- Harness: `backend-dotnet/tools/Koz.LoadHarness` (`smoke|normal|peak|stress|soak`)
- Correctness suite: `LoadResilienceIntegrationTests` against `koz_dotnet_load_test`
- Node used only as prior parity reference (not modified)

### Commands

```powershell
# API tests (no Postgres required for most)
dotnet test backend-dotnet/tests/Koz.Api.Tests/Koz.Api.Tests.csproj

# Load correctness suite
$env:KOZ_LOAD_TEST_CONNECTION_STRING = 'Host=localhost;Port=5432;Database=koz_dotnet_load_test;Username=postgres;Password=<password>'
dotnet test backend-dotnet/tests/Koz.IntegrationTests/Koz.IntegrationTests.csproj --filter FullyQualifiedName~LoadResilience

# External harness (API already running)
$env:KOZ_LOAD_BASE_URL = 'http://127.0.0.1:5055'
# optional: $env:KOZ_LOAD_DURATION_SEC = '120'
dotnet run --project backend-dotnet/tools/Koz.LoadHarness -- smoke
```

## 2. Findings

### L1 — Cancellation mapped to 500 (FIXED)

| Field | Value |
|---|---|
| ID | L1 |
| Severity | **HIGH** |
| File/method | `NodeCompatibleExceptionMiddleware.InvokeAsync` |
| Reproduction | Throw `OperationCanceledException` while `HttpContext.RequestAborted` is cancelled |
| Evidence | Unit test `Request_abort_is_not_mapped_to_internal_error_500` |
| Business impact | Client disconnects inflated error rate / false incidents |
| Fix | Map to HTTP **499**; Information log (not Error) |
| Fixed in Goal | **Yes** |
| Before/after | 500 `internal_error` → 499 |
| Confidence | High |

### L2 — Readiness ignored shutdown (FIXED)

| Field | Value |
|---|---|
| ID | L2 |
| Severity | **MEDIUM** |
| File/method | `Program.cs` health mapping; new `ShutdownReadinessHealthCheck` |
| Reproduction | Stop host → readiness should fail before drain completes |
| Evidence | `Shutdown_readiness_becomes_unhealthy_when_stopping` |
| Business impact | LB could keep sending traffic during shutdown |
| Fix | Readiness check unhealthy on `ApplicationStopping`; `HostOptions.ShutdownTimeout` default 30s |
| Fixed in Goal | **Yes** |
| Confidence | High |

### L3 — Pool/timeouts implicit only (FIXED / hardened)

| Field | Value |
|---|---|
| ID | L3 |
| Severity | **MEDIUM** |
| File/method | `DatabaseOptions` |
| Reproduction | Inspect connection string — MaxPoolSize/Timeouts were unset |
| Evidence | Defaults now explicit; `Database_options_expose_explicit_pool_and_timeout_defaults` |
| Business impact | Operators could not tune bounded pool wait |
| Fix | Explicit Max/Min pool, connection/command/idle timeouts via config/env |
| Fixed in Goal | **Yes** |
| Confidence | High |

### H4 — Order create N+1 / lock duration (DOCUMENTED CONDITION)

| Field | Value |
|---|---|
| ID | H4 |
| Severity | **MEDIUM** (capacity) |
| File/method | `PostgresOrderRepository.CreateAsync` |
| Reproduction | Cart sizes 1/5/20/50 via `H4_order_create_latency_scales_with_cart_size_under_audit_thresholds` |
| Evidence | 50-item &lt; 5s audit threshold; ratio 50/1 &lt; 100× |
| Business impact | Longer customer `FOR UPDATE` hold for large carts |
| Recommended fix | Batch product lookup + set-based reserve/insert **after** release if production carts are large |
| Fixed in Goal | **No** — measurements within audit thresholds; schema unchanged |
| Confidence | High |

### H2 — Kaspi provider (DOCUMENTED / OUT OF SCOPE)

Unchanged. Webhook fail-closed. Placeholder initiation remains Node-compatible.

### R1 — Production online payment initiation incompletable (RELEASE CONDITION)

| Field | Value |
|---|---|
| ID | R1 |
| Severity | **HIGH** (release condition, not code defect vs Node) |
| Evidence | `InitiateAsync` returns placeholder URL; webhook disabled |
| Recommendation | Feature-disable online initiation in Production until provider spec exists |
| Fixed in Goal | **No** — would diverge from Node without cutover decision |

### O1 — OTP table growth without cleanup (DOCUMENTED)

Correctness OK (expire/consume predicates). Operational monitoring recommended; no unbounded query degradation measured on current volume.

### L4 — Test host DB selection hardened (FIXED)

| Field | Value |
|---|---|
| ID | L4 |
| Severity | **MEDIUM** (test reliability / operator footgun) |
| File/method | `DatabaseOptions.Load`; `Net1ApiFactory` |
| Reproduction | Ambient `DATABASE_NAME` overrides `UseSetting` and poisons multi-suite runs |
| Evidence | Cross-DB pollution during parallel `dotnet test`; fixed by `Database:ConnectionString` bypass |
| Business impact | False regression failures; risk of writing to wrong DB in misconfigured local runs |
| Fix | Prefer explicit `Database:ConnectionString` when set (tests); production still uses discrete env vars |
| Fixed in Goal | **Yes** |
| Confidence | High |

## 3. Scenario results

### Order concurrency

- 50 concurrent buyers, stock 10, **10/10 resets**: created=10, conflict=40, qty=0, never negative, code=`product_reservation_conflict`
- Multi-item atomicity: rollback restores inventory
- Multi-instance A/B: OTP + orders correct

### Load harness (local)

| Profile | Notes |
|---|---|
| smoke | 0 failures; health/ready/catalog/otp p95 ≪ audit thresholds |
| peak | ~6.3 rps/scenario mix, 0 failures |
| normal/stress/soak | harness profiles; duration overridable via `KOZ_LOAD_DURATION_SEC` |

### Pool

Small pool (5) + concurrent orders: bounded completion (&lt;60s), readiness recovers.

### DB failure

Broken host readiness → 503 without password leak; liveness 200.

### Graceful shutdown

Shutdown readiness unhealthy when stopping; host timeout bounded.

### Read paths

`EXPLAIN (ANALYZE, BUFFERS)` on catalog join: seq scan on ~54 seed rows, **0.15 ms** — no index proposal (schema freeze).

## 4. Fixes shipped

1. Cancellation → 499 mapping  
2. Shutdown readiness gate + `ShutdownTimeout`  
3. Explicit Npgsql pool/timeout configuration  
4. Load harness + `LoadResilienceIntegrationTests`  
5. Documentation set (baseline, capacity, failure runbook, this report)

## 5. Deployment conditions

1. Apply OTP migration; set distinct `OTP_SECRET` / `JWT_SECRET`  
2. Use `/health/ready` for LB readiness; `/api/health` for liveness  
3. Size Postgres `max_connections` for replica × pool  
4. Treat H2/R1 before promising online payments to customers  
5. Monitor `otp_challenges` growth  

## 6. Test totals (this Goal)

| Suite | Pass 1 | Pass 2 |
|---|---|---|
| `Koz.Api.Tests` | 33/33 | 33/33 |
| `Koz.IntegrationTests` (incl. LoadResilience 10 + NET-* + OTP) | 78/78 | 78/78 |
| Load harness smoke/normal/peak/stress/soak | 0 failures | n/a (profiles re-used) |

## 7. H4 verdict

**No code change.** Measured within exploratory audit thresholds. Documented capacity condition for large carts. Batching deferred to avoid pre-release contract risk.

## 8. Self-review

Two consecutive clean passes completed on 2026-07-24 with no additional code fixes between passes.
