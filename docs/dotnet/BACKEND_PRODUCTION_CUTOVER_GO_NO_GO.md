# Production cutover GO / NO-GO

**Goal:** BACKEND-PREPROD-DEPLOYMENT-VALIDATION  
**Date:** 2026-07-24  
**Artifact:** commit `bba8edb84ebc412556bc833f3caf64798096f66d` / `Koz.Api.dll` SHA-256 `4848CF46329E1DA9CF612F48719787DD588AAAB4243B11FD2BA89FADCD5913C8`

## Decision

### GO FOR PRODUCTION CUTOVER WITH CONDITIONS

Pre-production validation on the available production-like host **passed two consecutive clean cycles**. Application correctness, payment gate, Node-off behavior, backup/restore, migrations, multi-replica OTP/orders, and rollback rehearsal are evidenced.

This is **not** an unconditional GO for an arbitrary cloud platform that was never exercised.

## GO criteria status

| Criterion | Status |
|---|---|
| Immutable artifact defined | **Met** (git SHA + DLL checksum; no `latest`) |
| Backup verified (restore) | **Met** |
| Migrations 001–003 confirmed | **Met** |
| Production config correct | **Met** (on validated runtime) |
| Readiness stable | **Met** |
| Node-off smoke | **Met** |
| Rollback verified | **Met** (~435 ms Node restart rehearsal) |
| Payment disabled | **Met** |
| Secrets not disclosed in reports | **Met** |
| Order/inventory correctness | **Met** (10/25 concurrency) |
| DB connection budget safe | **Met** when pool sized (2×20); **must** be set in prod |
| Mandatory monitoring available | **Not met on this host** → **condition** |
| Two clean passes | **Met** (A+B) |

## Mandatory production conditions (before traffic switch)

1. Map deployment to the **real** production platform (process **or** container). If production is Docker-only, complete image build/run/SIGTERM verification there before switch.  
2. Terminate TLS at a trusted reverse proxy/LB; document trusted networks. Do not open ForwardedHeaders to the world without a proxy policy (app currently has no ForwardedHeaders middleware).  
3. Provide operator monitoring: readiness, 4xx/5xx, latency, restarts, DB connections/locks, OTP failures, `online_payment_disabled` counts.  
4. Set `DATABASE_MAX_POOL_SIZE` so `replicas × pool + ops < max_connections`.  
5. Keep online payment **disabled** unless a real provider contract is approved.  
6. Communicate OTP re-request on Node rollback; do not drop `otp_challenges`.  
7. Keep H4 guidance (≤20 cart lines) in ops notes.  
8. Execute `BACKEND_PREPROD_DEPLOYMENT_CHECKLIST.md` / `BACKEND_RELEASE_CHECKLIST.md` with named owners and a real change window.

## Explicit NO-GO triggers (still apply)

- Unverified backup/restore on the **production** DB  
- Broken rollback artifact  
- Unsafe pool vs `max_connections`  
- Accidental payment enablement  
- Inventory correctness regression  
- Docker required by platform but image unverified  
- Missing secrets / weak secrets / CORS `*`

## What this decision does **not** authorize

- Immediate production traffic switch without the conditions above  
- Kaspi enablement  
- Schema changes  
- Official RTO/SLA claims from the ~435 ms rehearsal figure
