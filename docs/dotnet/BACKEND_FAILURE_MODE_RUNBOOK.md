# BACKEND FAILURE MODE RUNBOOK

**Goal:** BACKEND-LOAD-AND-RESILIENCE-AUDIT  
Companion to `RUN_DOTNET_LOCAL.md` / production cutover notes.

## Probe model

| Probe | Path | Expectation |
|---|---|---|
| Liveness | `GET /api/health` | 200 even if DB is down |
| Readiness | `GET /health/ready` | 200 only if Postgres answers and app is **not** shutting down; else 503 `{ status: "not_ready" }` |

Never put DB credentials or SQL text in client-visible readiness bodies.

## Startup

1. `DatabaseConnectionValidator` runs `SELECT 1` unless `Database:ValidateOnStartup=false`.
2. Failure → host fails fast with `DatabaseConfigurationException` (no password in message).
3. Production refuses missing DB env vars and password `postgres`.

## DB unavailable after startup

| Symptom | Behavior |
|---|---|
| Readiness | 503 `not_ready` (2s check timeout) |
| Liveness | stays 200 |
| Business endpoints | contract/500 mapping without leaking connection string |
| Recovery | when Postgres returns, readiness becomes healthy again (no permanently poisoned singleton state observed) |

## Pool exhaustion

| Knob | Default |
|---|---|
| `Database:MaxPoolSize` / `DATABASE_MAX_POOL_SIZE` | 100 |
| `Database:ConnectionTimeoutSeconds` | 15 |

Under small-pool audit (`MaxPoolSize=5`, timeout 2s) concurrent traffic completed in a **bounded** time; after load, readiness and catalog recovered. **Do not** “fix” slow SQL by only raising pool size.

## Command timeout / slow query

- Default command timeout **30s**.
- Cancelled client requests must not be counted as 500 (middleware maps abort → 499).

## Graceful shutdown

1. Host `ShutdownTimeout` default **30s** (`Host:ShutdownTimeoutSeconds`).
2. `ShutdownReadinessHealthCheck` marks readiness unhealthy when `ApplicationStopping` fires so LB stops new traffic.
3. In-flight work drains until timeout; process must not wait forever.

## OTP / multi-instance

- Challenges live in Postgres `otp_challenges` (HMAC only).
- Create on instance A, consume on instance B is supported.
- No sticky sessions.

## Payments

| Path | Behavior |
|---|---|
| `POST /api/payments/orders/{id}/pay-online` | Creates pending placeholder payment (Node-compatible) |
| `POST /api/webhooks/kaspi` | Always 503 `kaspi_webhook_disabled` |

**Release condition:** disable online initiation in production until a real provider contract exists (proposed config flag; keep Node parity until cutover decision).

## Incident checklist

1. Check liveness vs readiness split.
2. Check Postgres connectivity / `pg_stat_activity` waiting.
3. Check Npgsql pool settings vs Postgres `max_connections`.
4. Check for deadlocks (`pg_stat_database.deadlocks`) during order bursts.
5. Confirm cancelled-client noise is not flooding error logs (expect Information/Debug, not Error for abort).
