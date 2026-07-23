# BACKEND CAPACITY BASELINE

**Goal:** BACKEND-LOAD-AND-RESILIENCE-AUDIT  
**Environment:** local Windows + PostgreSQL 16.14 + .NET 10.0.302  
**Important:** Values are **audit thresholds / measured capacity**, **not** an approved product SLA.

## Recommended initial replica / pool settings

| Component | Recommendation | Rationale |
|---|---|---|
| API replicas | Start with **2** behind LB | OTP/orders are DB-backed; no sticky sessions required |
| Npgsql `MaxPoolSize` | **50–100** per instance | Default 100; do not raise to hide N+1 |
| PostgreSQL `max_connections` | ≥ `replicas × MaxPoolSize + admin headroom` | Avoid server-side connection storms |
| Connection timeout | **15 s** | Bounded pool wait |
| Command timeout | **30 s** | Fail slow queries without infinite hang |
| Shutdown timeout | **30 s** | Drain in-flight; readiness flips unhealthy on stop |

## Measured harness profiles (unauthenticated mix: health/ready/otp/catalog)

Machine-local; `KOZ_LOAD_BASE_URL=http://127.0.0.1:5055`.

| Profile | Duration | Workers | Approx RPS/scenario | p95 health | p95 catalog | Failures |
|---|---|---|---|---|---|---|
| smoke | 15s | 5 | ~0.5 | 52 ms | 65 ms | 0 |
| normal | 120s* | 20 | ~2.0 | 1 ms | 5 ms | 0 |
| peak | 45s | 60 | ~6.3 | 30 ms | 31 ms | 0 |
| stress | 90s* | 120 | ~10.0 | 6 ms | 22 ms | 0 |
| soak | 120s* | 15 | ~1.5 | 2 ms | 2 ms | 0 |

\*Duration shortened via `KOZ_LOAD_DURATION_SEC` for this audit machine window; default soak profile remains 10 minutes.

Authenticated order/manager/admin paths were exercised by `LoadResilienceIntegrationTests` (correctness-first), not by anonymous harness RPS.

## Order-create capacity (H4)

Code statement model for `PostgresOrderRepository.CreateAsync`:

- Fixed ~8–10 statements (customer `FOR UPDATE`, address, discounts/promo/settings, order, history)
- **+2 per cart line** (product lookup + inventory reserve)
- **+1 per cart line** (item insert)

| Cart size | Audit observation |
|---|---|
| 1 / 5 / 20 / 50 | Latency ratio 50÷1 **&lt; 100×**; 50-item single-shot **&lt; 5 s** (audit threshold) |
| Verdict | **No batching change shipped** — within audit thresholds; document as capacity condition |

**Capacity condition:** Prefer operational carts ≤ **20** line items for comfortable p95 under contention. Carts of **50** remain correct but hold the customer row lock longer (linear SQL).

## Order concurrency capacity

| Test | Result |
|---|---|
| 50 buyers, stock 10, 10 resets | successes = 10; conflicts = 40; qty never negative; stable `product_reservation_conflict` |
| Multi-item atomicity | insufficient 2nd SKU → full rollback; first SKU qty unchanged |
| Two API instances | OTP create on A / register on B OK; split order traffic OK |

## Known limits

1. **H2** — real Kaspi provider not implemented; webhook fail-closed.
2. **Online pay initiation** returns placeholder URL even though capture cannot complete — **release condition** (feature-disable proposed; not enabled to preserve Node parity).
3. **OTP table growth** — no background purge; correctness OK via expire predicate; monitor `otp_challenges` row count.
4. **H4** — linear per-item SQL under customer `FOR UPDATE` (documented, not batched).
5. Catalog EXPLAIN on seed-sized data uses sequential scans (~54 rows, &lt;1 ms) — **no new index** without schema approval.
