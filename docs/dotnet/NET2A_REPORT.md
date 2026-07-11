# NET-2A Public Read-only APIs report

## Scope

NET-2A moves only the mounted Node read endpoints below. Node remains the source of truth and the .NET API runs in parallel.

| Endpoint | Auth | Result |
|---|---|---|
| `GET /api/products/store/:store_id` | public | `200 {products}` with active, visible, in-stock inventory only; Node category/name sorting and effective price are preserved. |
| `GET /api/my-profile` | customer JWT | `200 {profile}` or Node-compatible auth/profile errors. |
| `GET /api/my-addresses` | customer JWT | `200 {addresses}` ordered by default then creation time. |

Node does not mount `GET /api/products`, `GET /api/products/:id` or `GET /api/my-addresses/:id`; NET-2A intentionally leaves them as the shared `404 {message,code}` fallback.

## Implementation and security

- `PostgresPublicReadRepository` uses parameterized Npgsql commands; no EF, migrations, schema changes or writes were added.
- Profile and addresses reuse NET-1 `customer` policy. Missing bearer token is `401 token_required`; invalid JWT is `403 invalid_token`; non-customer role is `403 access_denied`.
- Public catalog requires no JWT. Its SQL mirrors Node filtering (`is_active`, `is_visible`, `quantity > 0`) and sorting.
- Profile fields and address nullable fields are emitted with the same Node names. The nested customer subscription dates preserve Node JSONB `YYYY-MM-DD` strings, while the top-level profile date fields preserve Node `pg` ISO values. PostgreSQL numeric values are returned as string values with their schema scale, matching Node `pg` JSON output.

## Contract testing

`Net2aPublicReadIntegrationTests` starts Node and the .NET test host against the same isolated `koz_dotnet_net2a_test` database. It compares status, `Content-Type`, wrapper/object keys, nullable values, JSON types, scalar values and array order for the three endpoints. It also compares the intentionally unmounted GET routes and missing, malformed, invalid, expired and wrong-role bearer-token responses. Timestamp values are not compared, but their JSON types are.

Run the NET-2A contract suite:

```powershell
$env:KOZ_NET2A_TEST_CONNECTION_STRING = 'Host=localhost;Port=5432;Database=koz_dotnet_net2a_test;Username=postgres;Password=<password>'
dotnet test backend-dotnet/Koz.sln --filter FullyQualifiedName~Net2aPublicReadIntegrationTests
```
