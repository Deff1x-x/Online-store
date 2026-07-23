# BACKEND-LOAD-AND-RESILIENCE-AUDIT Goal (permanent)

**Goal ID:** BACKEND-LOAD-AND-RESILIENCE-AUDIT  
**Type:** Permanent load / concurrency / failure-mode audit before production cutover  
**Status:** Ready for commit review (commit not performed)  
**Working tree rule:** Do not recreate this Goal. Do not restart the stage. Continue from incomplete checklist items only.

## Objective

Conduct a measurement-backed load, concurrency, and failure-mode audit of the ASP.NET Core backend. Fix only defects with measured evidence or reproducible failure scenarios. Do not change business logic, public API contracts, Node, frontend, or database schema.

## Exit criteria

Either:

1. Stage ready for commit (no commit in this Goal) after **two consecutive clean self-review passes**; or  
2. One real technical blocker requiring Node contract change, schema change, external infrastructure, payment specification, or approved production SLA.

## Checklist

- [x] 1. Baseline captured (`BACKEND_LOAD_AND_RESILIENCE_BASELINE.md`)
- [x] 2. Load test harness + documented run command
- [x] 3. Load profiles: smoke / normal / peak / stress / soak
- [x] 4. Mandatory metrics collected per scenario
- [x] 5. Order creation concurrency + multi-item atomicity
- [x] 6. H4 N+1 / lock duration measured; fix only if thresholds breached
- [x] 7. DB pool / timeouts / small-pool behavior
- [x] 8. Postgres failure modes
- [x] 9. Graceful shutdown
- [x] 10. Cancellation propagation
- [x] 11. Multi-instance correctness
- [x] 12. Auth / OTP load
- [x] 13. Read endpoints (EXPLAIN on test DB only; no blind indexes)
- [x] 14. Payment path (H2 out of scope for real provider)
- [x] 15. Logging / observability under load
- [x] 16. Failure injection tests
- [x] 17. Findings classified
- [x] 18. Allowed fixes only
- [x] 19. Post-fix verification + full regression (two clean passes)
- [x] 20. Docs: AUDIT_REPORT, CAPACITY_BASELINE, FAILURE_MODE_RUNBOOK + runbook update

## Audit thresholds (exploratory — not product SLA)

| Metric | Audit threshold |
|---|---|
| Order create p95 under normal load | ≤ 2s |
| Health/ready p95 | ≤ 200ms |
| Catalog list p95 | ≤ 500ms |
| Concurrent same-SKU orders | successes ≤ stock; qty never negative |
| Pool wait under small pool | bounded error/timeout; no infinite hang |
| Shutdown | process exits within HostOptions.ShutdownTimeout |
| Soak (local) | no unbounded memory growth over run window |

## Self-review passes

| Pass | Date | Result | Notes |
|---|---|---|---|
| 1 | 2026-07-24 | **Clean** | Api 33/33 + Integration 78/78; build -warnaserror; no further code fixes |
| 2 | 2026-07-24 | **Clean** | Repeat full Api+Integration green; `git diff --check` clean (CRLF warnings only) |
