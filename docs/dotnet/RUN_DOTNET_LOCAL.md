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
| `JWT_SECRET` | required for Auth in production; development uses the same non-production fallback as Node only when it is absent |

`Database:ValidateOnStartup` defaults to `true`; it runs `SELECT 1` with Npgsql and logs only host, port and database — never the password. Development CORS permits exactly `http://localhost:5173` and `http://localhost:5174`. Production origins must be supplied through `Cors__AllowedOrigins__0`, etc.; credentials are not enabled.

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

Customer login and registration use the current OTP contract. The OTP is logged only in `Development`; never copy a real token, OTP or secret into a tracked file. Production requires a non-development `JWT_SECRET` of at least 32 characters.

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
