# BACKEND LOAD AND RESILIENCE — BASELINE

**Goal:** BACKEND-LOAD-AND-RESILIENCE-AUDIT  
**Captured:** 2026-07-24 (local Windows audit machine)  
**Note:** Figures below are **environment-specific**. Do not compare across machines without an explicit caveat.

## Environment

| Item | Value |
|---|---|
| OS | Windows 10.0.26200 |
| Shell | PowerShell |
| .NET SDK | 10.0.302 |
| Target framework | `net10.0` |
| PostgreSQL | 16.14 (Windows service `postgresql-x64-16`) |
| Build | Debug for runtime measurements; Release also builds clean with `-warnaserror` |
| Test DB | `koz_dotnet_load_test` (schema + migrations 001–003 + `seed.sql`) |
| Seed | Store `11111111-…`, products tomatoes/milk + load extra SKUs for H4 |
| Measurement method | Process start → first `GET /health/ready` 200; WorkingSet after ready |

## Build / test baseline (pre-fix API suite)

| Check | Result |
|---|---|
| `dotnet restore` / `dotnet build -warnaserror` | Pass |
| `Koz.Api.Tests` (cancellation/shutdown/pool options + prior remediation) | Pass |
| Load suite (`LoadResilienceIntegrationTests`) | Pass (10/10) |

## Runtime baseline (Debug, `koz_dotnet_load_test`)

| Metric | Value |
|---|---|
| Cold start → readiness | **1910 ms** |
| Idle working set | **~79 MB** |
| Liveness | `GET /api/health` → `{ status: ok }` (no DB) |
| Readiness | `GET /health/ready` → DB `SELECT 1` (2s timeout) + shutdown gate |

## Pool / request limits (code defaults after audit)

| Setting | Value | Source |
|---|---|---|
| Npgsql `Pooling` | true | `DatabaseOptions` |
| `MaxPoolSize` | **100** | explicit (Npgsql default made configurable) |
| `MinPoolSize` | **0** | explicit |
| Connection `Timeout` | **15 s** | explicit |
| `CommandTimeout` | **30 s** | explicit |
| `ConnectionIdleLifetime` | **300 s** | explicit |
| Kestrel request limits | ASP.NET defaults (unchanged) | no custom Kestrel limits |
| Host `ShutdownTimeout` | **30 s** (clamp 5–120 via `Host:ShutdownTimeoutSeconds`) | `Program.cs` |

## Cancellation behavior (baseline finding → fixed)

| Path | Before | After |
|---|---|---|
| `OperationCanceledException` when `RequestAborted` | Mapped to **500** `internal_error` | **499** + information log (not server fault) |

## Concurrency settings used in audit tests

| Scenario | Setting |
|---|---|
| Same-SKU order race | stock=10, buyers=50, **10 resets** |
| Multi-instance | 2× `WebApplicationFactory` + shared Postgres |
| Small pool | `MaxPoolSize=5`, connection timeout 2s, 20 concurrent buyers |

## Dataset notes

- Staff seed password in tests: `Manager123`
- Testing environment OTP code: `1234`
- Payments: placeholder initiation only; Kaspi webhook fail-closed
