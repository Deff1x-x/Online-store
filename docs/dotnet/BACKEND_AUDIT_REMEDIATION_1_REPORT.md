# BACKEND-AUDIT-REMEDIATION-1 Report

## Scope

Permanent Goal `BACKEND-AUDIT-REMEDIATION-1`: remediate confirmed production risks from the independent backend audit without changing business logic, REST contracts, database schema, Node, or frontend.

## Finding status

| ID | Confirmed | Remediation | Status |
|---|---|---|---|
| H1 | Yes — empty Production CORS allowed startup | `CorsOptions.Load` fails Production when origins empty; rejects `*`; normalizes/validates absolute http(s) origins; Development keeps `appsettings.Development.json` localhost list | **Done** |
| H2 | Yes — Kaspi incomplete | Out of scope (needs real payment provider) | **Deferred** |
| H3 | Yes — `AuthService` used process `ConcurrentDictionary` OTP store | Closed by Goal `BACKEND-OTP-SHARED-STORAGE`: table `otp_challenges`, HMAC storage, atomic consume | **Done** (see `BACKEND_OTP_SHARED_STORAGE_REPORT.md`) |
| H4 | Yes — order-create N+1 | Out of scope (needs load evidence) | **Deferred** |
| H5 | Yes — development JWT secret usable outside Development | `JwtOptions.Load` allows built-in secret only in Development; Staging/Testing/Production require explicit strong secret; secrets never appear in exceptions | **Done** |
| H6 | Yes — unsigned Kaspi webhook mutated state outside Production | `PaymentsController.Kaspi` fail-closed in all environments (`503` / `kaspi_webhook_disabled`); no body handling, no repository calls | **Done** |
| M2 | Yes — `PostgresAdminCustomerRepository.Array` opened a connection then called `Scalar` (second open) | `Array` executes on the opened connection | **Done** |
| M3 | Yes — `/api/health` does not check PostgreSQL readiness | Kept `/api/health` contract; added internal `GET /health/ready` with `SELECT 1`, 2s timeout, `{status}` JSON, HTTP 503 when unhealthy | **Done** |
| M4 | Yes — no NET-4A Node↔.NET contract suite | Added `Net4aManagerInventoryIntegrationTests` against `koz_dotnet_net4a_test` | **Done** |
| M6 | Yes — Development logged plaintext OTP | Removed plaintext OTP/phone logging; logs only `OTP challenge created` | **Done** |
| L1 | N/A | Architectural refactor of LegacyCatalog controller | **Out of scope** |

## Exact fixes

### H1 — Production CORS
- File: `backend-dotnet/src/Koz.Api/Configuration/CorsOptions.cs`
- Wired in `Program.cs`; Production empty list throws `CorsConfigurationException` at startup.
- Tests: `CorsConfigurationTests` (empty Production failure, valid origin load, wildcard reject, allowed/denied origin + OPTIONS preflight).

### H5 — JWT secret
- File: `backend-dotnet/src/Koz.Api/Auth/JwtOptions.cs`
- Tests: `JwtEnvironmentTests` (+ existing Production JWT guard in `HealthEndpointTests`).
- Integration hosts continue to set `Jwt:Secret` explicitly (`Net1ApiFactory`, `ProductionKozApiFactory`).

### H6 — Kaspi webhook
- File: `backend-dotnet/src/Koz.Api/Controllers/PaymentsController.cs` method `Kaspi`
- Tests: `KaspiWebhookSecurityTests` (missing/wrong/malformed signature, all environments, no side-effect path because handler returns before service/DB).

### M2 — Admin customers connection
- File: `backend-dotnet/src/Koz.Infrastructure/AdminCustomers/PostgresAdminCustomerRepository.cs` method `Array`
- Test: `AdminCustomerArrayConnectionRegressionTests`.

### M3 — Readiness
- Files: `PostgresReadinessHealthCheck.cs`, `Program.cs` maps `/health/ready`
- Tests: `ReadinessHealthTests`.

### M4 — NET-4A contracts
- File: `backend-dotnet/tests/Koz.IntegrationTests/Net4aManagerInventoryIntegrationTests.cs`
- Covers inventory list (shared fields + wrappers), visibility/price update + incoming parity, analytics aggregates/date filter, RBAC, store isolation, DB state, five-reset concurrency.
- Also fixed `.NET` quantity-status assignment to cast `CASE ... END` to `inventory_status` in `PostgresOrderRepository.UpdateInventoryAsync` (Node still has the untyped `CASE` and fails quantity updates; Node was not changed).
- Quantity-update races are asserted on .NET only for that reason.

### M6 — OTP logging
- Files: `IAuthRuntime.LogOtpChallengeCreated`, `AspNetAuthRuntime`, `AuthService.CreateOtpChallenge`
- Test: `OtpLoggingTests` (asserts challenge log without phone/`1234`).

## H3 status

**Resolved** by `BACKEND-OTP-SHARED-STORAGE`:

- Migration `database/migrations/003_otp_challenges.sql` + `schema.sql` table `otp_challenges`
- HMAC via dedicated `OTP_SECRET` (≠ `JWT_SECRET`)
- Atomic consume with PostgreSQL `NOW()` for TTL/single-use
- Evidence: `NetOtpSharedStorageIntegrationTests` (migration, overwrite, concurrency, multi-host, plaintext absence)

## Remaining conditions

### H2
Real Kaspi (or other) payment provider integration and signature specification. Until then webhooks stay fail-closed (H6 remediation).

### H4
Order-create path performance work only after measurements and an agreed load profile.

## Production deployment requirements

1. **CORS:** set one or more absolute origins (`Cors__AllowedOrigins__0`, …). Empty Production config fails startup. No `*`.
2. **JWT:** set strong `JWT_SECRET` (≥32, not development/default strings) in Staging/Production.
3. **OTP:** apply migration `003_otp_challenges.sql`; set `OTP_SECRET` (≥32, distinct from `JWT_SECRET`).
4. **Readiness probe:** use `GET /health/ready` for DB readiness; keep `GET /api/health` for liveness/parity.
5. **Kaspi webhook:** disabled/fail-closed until provider signature contract is configured; unsigned requests must not mutate payment/order state.

## Verification notes

Remediation unit/API tests live in `Koz.Api.Tests`. OTP shared storage suite: `KOZ_OTP_TEST_CONNECTION_STRING` → `koz_dotnet_otp_test`. NET-4A suite requires `KOZ_NET4A_TEST_CONNECTION_STRING`.
