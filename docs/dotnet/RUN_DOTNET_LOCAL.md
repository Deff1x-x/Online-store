# Local .NET backend runbook

## Prerequisites

- .NET SDK **10.0.301** (or another .NET 10 LTS SDK).
- PostgreSQL with the existing schema loaded from `database/schema.sql` and the existing SQL migrations. Do not create EF migrations.
- Node backend setup remains as documented in `docs/RUN_LOCAL.md`.

## Configuration

The API uses standard `appsettings.json`, `appsettings.Development.json` and environment variables. It deliberately does **not** read `.env`, so no dotenv package or `backend-dotnet/.env.example` exists.

The Node-compatible variables take precedence over appsettings:

| Node-compatible variable | appsettings equivalent |
|---|---|
| `DATABASE_HOST` | `Database:Host` / `Database__Host` |
| `DATABASE_PORT` | `Database:Port` / `Database__Port` |
| `DATABASE_NAME` | `Database:Name` / `Database__Name` |
| `DATABASE_USER` | `Database:User` / `Database__User` |
| `DATABASE_PASSWORD` | `Database:Password` / `Database__Password` |
| `JWT_SECRET` | required outside local Development; Development may use the built-in non-production fallback only when unset |
| `OTP_SECRET` | required outside local Development; HMAC key for OTP hashes; must differ from `JWT_SECRET` (≥32 chars) |
| `Cors__AllowedOrigins__N` | required in Production (≥1 absolute http/https origin; `*` rejected) |

`Database:ValidateOnStartup` defaults to `true`; it runs `SELECT 1` with Npgsql and logs only host, port and database — never the password. Development CORS permits exactly `http://localhost:5173` and `http://localhost:5174` via `appsettings.Development.json`. Production refuses to start with an empty origin list; credentials are not enabled; wildcards are rejected.

Load balancers should probe process liveness via `GET /api/health` (unchanged contract) and DB readiness via internal `GET /health/ready` (`{ "status": "ready"|"not_ready" }`, HTTP 503 when PostgreSQL is unavailable).

OTP challenges are stored in PostgreSQL table `otp_challenges` (HMAC hash only). Apply migration `database/migrations/003_otp_challenges.sql` (or use updated `schema.sql`). Do not rely on sticky sessions.

Kaspi webhooks are fail-closed in every environment (`503` / `kaspi_webhook_disabled`) until a real provider signature contract is configured.

## Load / resilience audit harness

Isolated DB `koz_dotnet_load_test` (schema + migrations + seed):

```powershell
$env:KOZ_LOAD_TEST_CONNECTION_STRING = 'Host=localhost;Port=5432;Database=koz_dotnet_load_test;Username=postgres;Password=<password>'
dotnet test backend-dotnet/tests/Koz.IntegrationTests/Koz.IntegrationTests.csproj --filter FullyQualifiedName~LoadResilience
```

External load profiles (API must already be listening):

```powershell
$env:KOZ_LOAD_BASE_URL = 'http://127.0.0.1:5055'
# optional shorter/longer window: $env:KOZ_LOAD_DURATION_SEC = '120'
dotnet run --project backend-dotnet/tools/Koz.LoadHarness -- smoke
dotnet run --project backend-dotnet/tools/Koz.LoadHarness -- normal
dotnet run --project backend-dotnet/tools/Koz.LoadHarness -- peak
dotnet run --project backend-dotnet/tools/Koz.LoadHarness -- stress
dotnet run --project backend-dotnet/tools/Koz.LoadHarness -- soak
```

Pool / timeout knobs: `Database:MaxPoolSize`, `Database:ConnectionTimeoutSeconds`, `Database:CommandTimeoutSeconds`, `Host:ShutdownTimeoutSeconds` (see `BACKEND_FAILURE_MODE_RUNBOOK.md`).

## Windows PowerShell

```powershell
# one-time (when dotnet is installed globally)
dotnet --info

# from repository root
dotnet restore backend-dotnet/Koz.sln
dotnet build backend-dotnet/Koz.sln --no-restore
dotnet test backend-dotnet/Koz.sln --no-build --no-restore

# configuration for the same local database used by Node
$env:DATABASE_HOST = 'localhost'
$env:DATABASE_PORT = '5432'
$env:DATABASE_NAME = 'online_store'
$env:DATABASE_USER = 'postgres'
$env:DATABASE_PASSWORD = '<local password>'
$env:JWT_SECRET = '<development secret>'
$env:ASPNETCORE_ENVIRONMENT = 'Development'

dotnet run --project backend-dotnet/src/Koz.Api/Koz.Api.csproj
Invoke-RestMethod http://localhost:5000/api/health
```

The local launch profile binds the .NET API to `http://localhost:5000`; Node remains on `http://localhost:3000`. Start Node in one terminal (`npm.cmd start`) and the .NET API in another. Do not point either Vite app at port 5000 in NET-1.

Swagger UI is available only in Development at `http://localhost:5000/swagger`; it is an aid, not the contract source. The mounted .NET surface currently includes health, NET-1 Auth, NET-2A reads and NET-2B commerce endpoints.

## Auth smoke checks (NET-1)

Do not point the frontend at port 5000. Use a separate PowerShell terminal after starting the .NET API:

```powershell
$otp = @{ phone = 'customer-phone' } | ConvertTo-Json
Invoke-RestMethod http://localhost:5000/api/auth/otp -Method Post -ContentType 'application/json' -Body $otp

$staff = @{ email = 'manager@koz.kz'; password = '<seed password>' } | ConvertTo-Json
Invoke-RestMethod http://localhost:5000/api/auth/staff/login -Method Post -ContentType 'application/json' -Body $staff

$refresh = @{ refresh_token = '<opaque refresh token>' } | ConvertTo-Json
Invoke-RestMethod http://localhost:5000/api/auth/refresh -Method Post -ContentType 'application/json' -Body $refresh
```

Customer login and registration use the current OTP contract. Application logs record only that an OTP challenge was created — never the code or full phone. OTP hashes use `OTP_SECRET` (HMAC), never `JWT_SECRET`. Never copy a real token, OTP or secret into a tracked file. Staging/Testing/Production require explicit non-development `JWT_SECRET` and `OTP_SECRET` of at least 32 characters.

## Public read smoke checks (NET-2A)

NET-2A adds only the mounted Node reads: `GET /api/products/store/:store_id`, `GET /api/my-profile` and `GET /api/my-addresses`. There is deliberately no .NET `GET /api/products`, `GET /api/products/:id` or `GET /api/my-addresses/:id`, because Node does not mount those GET routes.

```powershell
Invoke-RestMethod http://localhost:5000/api/products/store/11111111-1111-1111-1111-111111111111

$headers = @{ Authorization = 'Bearer <NET-1 customer JWT>' }
Invoke-RestMethod http://localhost:5000/api/my-profile -Headers $headers
Invoke-RestMethod http://localhost:5000/api/my-addresses -Headers $headers
```

## Legacy NET-0 integration database check

Use an isolated database, never a shared development database:

```powershell
$env:KOZ_TEST_DATABASE_CONNECTION_STRING = 'Host=localhost;Port=5432;Database=koz_dotnet_net0_test;Username=postgres;Password=<password>'
dotnet test backend-dotnet/tests/Koz.IntegrationTests/Koz.IntegrationTests.csproj
```

Without that variable the integration test is explicitly skipped; API contract tests still run without PostgreSQL by disabling startup validation in their test host.

For NET-1 Auth tests, create the separate `koz_dotnet_net1_test` database from the same schema, 001/002 migrations and `database/seed.sql`, then set `KOZ_NET1_TEST_CONNECTION_STRING`. The Auth suite refuses every other database name.

For NET-2A tests, create the separate `koz_dotnet_net2a_test` database from the same schema, 001/002 migrations and `database/seed.sql`, then set `KOZ_NET2A_TEST_CONNECTION_STRING`. The NET-2A suite refuses every other database name.

For NET-2B, create only the isolated `koz_dotnet_net2b_test` database from the same schema, migrations and seed. The suite starts Node and .NET against that database and refuses every other name:

```powershell
$env:KOZ_NET2B_TEST_CONNECTION_STRING = 'Host=localhost;Port=5432;Database=koz_dotnet_net2b_test;Username=postgres;Password=<password>'
dotnet test backend-dotnet/tests/Koz.IntegrationTests/Koz.IntegrationTests.csproj --filter FullyQualifiedName~Net2bCommerceIntegrationTests
```

## NET-3A order-create smoke check

`POST /api/orders` is mounted only for a customer JWT. The customer must have an active subscription and an address belonging to that customer in the store coverage.

```powershell
$headers = @{ Authorization = 'Bearer <customer JWT>' }
$order = @{
  payment_method = 'online'
  delivery_address_id = '<customer address UUID>'
  items = @(
    @{ product_id = '33333333-3333-3333-3333-333333333333'; quantity = 1.5 }
    @{ product_id = '55555555-5555-5555-5555-555555555555'; quantity = 2 }
  )
} | ConvertTo-Json -Depth 4
Invoke-RestMethod http://localhost:5000/api/orders -Method Post -Headers $headers -ContentType 'application/json' -Body $order
```

For Node↔.NET NET-3A integration/contract tests, create only `koz_dotnet_net3a_test` from `database/schema.sql`, migrations `001`/`002`, and `database/seed.sql`. The test suite refuses every other database name and resets only deterministic test fixture rows:

```powershell
$env:KOZ_NET3A_TEST_CONNECTION_STRING = 'Host=localhost;Port=5432;Database=koz_dotnet_net3a_test;Username=postgres;Password=<password>'
dotnet test backend-dotnet/tests/Koz.IntegrationTests/Koz.IntegrationTests.csproj --filter FullyQualifiedName~Net3aOrderCreateIntegrationTests
```

## NET-3B manager processing smoke check

Use a manager JWT issued by the staff login; its store is taken solely from the JWT.

```powershell
$manager = Invoke-RestMethod http://localhost:5000/api/auth/staff/login -Method Post -ContentType 'application/json' -Body (@{ email = 'manager@koz.kz'; password = '<seed password>' } | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($manager.token)" }
$orderId = '<order UUID for the manager store>'

Invoke-RestMethod "http://localhost:5000/api/my-store/orders/$orderId/pick" -Method Put -Headers $headers -ContentType 'application/json' -Body '{}'
Invoke-RestMethod "http://localhost:5000/api/my-store/orders/$orderId/actual-weight" -Method Put -Headers $headers -ContentType 'application/json' -Body (@{ actual_weight = 1.42 } | ConvertTo-Json)
Invoke-RestMethod "http://localhost:5000/api/my-store/orders/$orderId/status" -Method Put -Headers $headers -ContentType 'application/json' -Body (@{ delivery_status = 'in_delivery' } | ConvertTo-Json)
```

The NET-3B contract suite creates and accepts only `koz_dotnet_net3b_test`; it resets its deterministic rows and starts Node and .NET against the same database:

```powershell
$env:KOZ_NET3B_TEST_CONNECTION_STRING = 'Host=localhost;Port=5432;Database=koz_dotnet_net3b_test;Username=postgres;Password=<password>'
dotnet test backend-dotnet/tests/Koz.IntegrationTests/Koz.IntegrationTests.csproj --filter FullyQualifiedName~Net3bManagerProcessingIntegrationTests
```

## NET-3C customer order reads

## NET-4B Admin Catalog smoke checks

## OTP shared storage suite

```powershell
$env:KOZ_OTP_TEST_CONNECTION_STRING = 'Host=localhost;Port=5432;Database=koz_dotnet_otp_test;Username=postgres;Password=<password>'
# ensure migration 003 applied
psql -U postgres -h localhost -d koz_dotnet_otp_test -f database/migrations/003_otp_challenges.sql
dotnet test backend-dotnet/tests/Koz.IntegrationTests/Koz.IntegrationTests.csproj --filter FullyQualifiedName~NetOtpSharedStorageIntegrationTests
```

## NET-4A Manager inventory/analytics contract suite

```powershell
$env:KOZ_NET4A_TEST_CONNECTION_STRING = 'Host=localhost;Port=5432;Database=koz_dotnet_net4a_test;Username=postgres;Password=<password>'
dotnet test backend-dotnet/tests/Koz.IntegrationTests/Koz.IntegrationTests.csproj --filter FullyQualifiedName~Net4aManagerInventoryIntegrationTests
```

## NET-4C Admin Customers smoke checks

## NET-4D Admin Operations smoke checks

```powershell
$headers = @{ Authorization = 'Bearer <admin_operations JWT>' }
$orderId = '<order UUID>'
Invoke-RestMethod 'http://localhost:5000/api/admin/operations/orders?page=1&limit=20' -Headers $headers
Invoke-RestMethod "http://localhost:5000/api/admin/operations/orders/$orderId" -Headers $headers
Invoke-RestMethod "http://localhost:5000/api/admin/operations/orders/$orderId/status" -Method Put -Headers $headers -ContentType 'application/json' -Body (@{ delivery_status = 'picked' } | ConvertTo-Json)
Invoke-RestMethod 'http://localhost:5000/api/admin/operations/analytics/revenue' -Headers $headers
```

The Node↔.NET NET-4D suite rejects every database except `koz_dotnet_net4d_test`:

```powershell
$env:KOZ_NET4D_TEST_CONNECTION_STRING = 'Host=localhost;Port=5432;Database=koz_dotnet_net4d_test;Username=postgres;Password=<password>'
dotnet test backend-dotnet/tests/Koz.IntegrationTests/Koz.IntegrationTests.csproj --filter FullyQualifiedName~Net4dAdminOperationsIntegrationTests
```

```powershell
$headers = @{ Authorization = 'Bearer <admin_customers JWT>' }
Invoke-RestMethod 'http://localhost:5000/api/admin/customers/customers?page=1&limit=20&search=Ali' -Headers $headers
Invoke-RestMethod 'http://localhost:5000/api/admin/customers/customers/<customer UUID>' -Headers $headers
Invoke-RestMethod 'http://localhost:5000/api/admin/customers/customers/<customer UUID>/subscription/renew' -Method Put -Headers $headers
Invoke-RestMethod 'http://localhost:5000/api/admin/customers/customers/<customer UUID>/subscription/pause' -Method Put -Headers $headers
Invoke-RestMethod 'http://localhost:5000/api/admin/customers/customers/<customer UUID>/subscription/cancel' -Method Put -Headers $headers -ContentType 'application/json' -Body (@{ immediate = $false } | ConvertTo-Json)
```

Use a staff JWT issued to an `admin_catalog` user; do not store a token or password in a script.

```powershell
$headers = @{ Authorization = 'Bearer <admin_catalog JWT>' }
$storeId = '11111111-1111-1111-1111-111111111111'
$productId = '33333333-3333-3333-3333-333333333333'

Invoke-RestMethod http://localhost:5000/api/admin/catalog/stores -Headers $headers
Invoke-RestMethod "http://localhost:5000/api/admin/catalog/stores/$storeId/inventory" -Headers $headers
Invoke-RestMethod "http://localhost:5000/api/admin/catalog/stores/$storeId/inventory/$productId" -Method Put -Headers $headers -ContentType 'application/json' -Body (@{ quantity = 10; selling_price = 900; is_visible = $true } | ConvertTo-Json)
Invoke-RestMethod http://localhost:5000/api/admin/catalog/promo-codes -Headers $headers
```

The Node↔.NET suite accepts only `koz_dotnet_net4b_test` and must be initialized from `database/schema.sql`, migrations `001` and `002`, and `database/seed.sql`:

```powershell
$env:KOZ_NET4B_TEST_CONNECTION_STRING = 'Host=localhost;Port=5432;Database=koz_dotnet_net4b_test;Username=postgres;Password=<password>'
dotnet test backend-dotnet/tests/Koz.IntegrationTests/Koz.IntegrationTests.csproj --filter FullyQualifiedName~Net4bAdminCatalogIntegrationTests
```

Node mounts no customer cancellation URL. With a customer JWT:

```powershell
$headers = @{ Authorization = 'Bearer <customer JWT>' }
Invoke-RestMethod http://localhost:5000/api/my-orders -Headers $headers
Invoke-RestMethod 'http://localhost:5000/api/my-orders/<order UUID>' -Headers $headers
```

```powershell
$env:KOZ_NET3C_TEST_CONNECTION_STRING = 'Host=localhost;Port=5432;Database=koz_dotnet_net3c_test;Username=postgres;Password=<password>'
dotnet test backend-dotnet/tests/Koz.IntegrationTests/Koz.IntegrationTests.csproj --filter FullyQualifiedName~Net3cCustomerOrderLifecycleIntegrationTests
```
