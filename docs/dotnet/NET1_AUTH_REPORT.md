# NET-1 Auth report

## Scope and rollback

Implemented only the five mounted routes under `/api/auth`; no logout/revoke route is mounted by Node and none was added. Node on port 3000 remains the production source of truth. A rollback is a routing decision back to Node; both implementations use the same existing PostgreSQL schema and no SQL migration was created.

| Endpoint | Node/.NET behaviour |
|---|---|
| `POST /api/auth/otp` | `{phone}` → `200 {message,expires_in_seconds:300}`; 4-digit OTP is in-process, one-time and expires after 300 seconds. |
| `POST /api/auth/register` | Requires phone, code, name, store_id and both consents; returns `201 {token,refresh_token,user}`. |
| `POST /api/auth/login` | Customer OTP login, not password login; returns the customer token wrapper. |
| `POST /api/auth/staff/login` | Email/password for non-customer active users; returns `{token,user}` with no refresh token. |
| `POST /api/auth/refresh` | Opaque refresh token rotation; returns a new customer token wrapper. |

## JWT parity

- Algorithm: HS256; no issuer or audience.
- Lifetime: 15 minutes, zero clock skew in validation.
- Payload: `id`, `role`, `iat`, `exp`, plus only present `store_id`, `customer_id`, `email`, `phone`.
- `MapInboundClaims=false`; no ASP.NET claim-name remapping.
- Roles: `customer`, `store_operator`, `admin_catalog`, `admin_operations`, `admin_customers`. Test-only protected endpoints exercise the equivalent RBAC policies without exposing diagnostics outside `Testing`.
- `JWT_SECRET` is never logged. Production fails fast for missing, short, default or development JWT secrets.

## Refresh and database behaviour

Refresh tokens are 48 random bytes encoded base64url, not JWTs. SHA-256 lowercase hexadecimal hashes only are stored in `user_sessions`; their lifetime is 30 days. Refresh locks the current row using `FOR UPDATE OF s`, revokes it, inserts the replacement session and commits as one transaction. A reused, expired, revoked or access token-as-refresh returns `401 {message,code:"invalid_refresh_token"}`.

Registration uses one transaction for active-store validation (`FOR SHARE`), users, customers (initial `expired` subscription), first-order discount and user-consent records. Session creation deliberately remains after that transaction, matching Node.

Tables used: `stores`, `users`, `customers`, `first_order_discounts`, `user_consents`, `user_sessions`. No schema change, EF migration, cookie, Identity, provider or notification queue implementation was added.

## Password and OTP compatibility

Existing Node bcrypt/bcryptjs hashes are verified with `BCrypt.Net-Next`; seed hashes in `$2a$10$...` format work unchanged. Node creates future bcrypt hashes at cost 12; no password is migrated or rehashed in this stage.

OTP matches Node's in-memory Map semantics. `Testing` uses its fixed `1234` code solely to make isolated contract tests deterministic. Development logs the OTP; Production does not log or return it.

## RBAC and error matrix

| Condition | HTTP response |
|---|---|
| Missing bearer token | `401 token_required` |
| Invalid header | `401 invalid_authorization_header` |
| Invalid/expired JWT | `403 invalid_token` (the actual mounted Node middleware behaviour) |
| Valid token, wrong role | `403 access_denied` |
| Customer invalid/expired OTP | `403 invalid_otp` |
| Invalid refresh | `401 invalid_refresh_token` |
| Staff invalid password | `401 invalid_credentials` |

NET-1 deliberately preserves the mounted Node middleware behaviour: invalid or expired JWT returns `403 invalid_token`.

## Tests

Use an isolated database named exactly `koz_dotnet_net1_test`, prepared with `schema.sql`, migrations 001/002 and `seed.sql`.

```powershell
$env:KOZ_NET1_TEST_CONNECTION_STRING = 'Host=localhost;Port=5432;Database=koz_dotnet_net1_test;Username=postgres;Password=<password>'
dotnet test backend-dotnet/Koz.sln
dotnet test backend-dotnet/Koz.sln --filter Category=Integration
```

The integration suite verifies bcrypt seed login, all staff roles, JWT claims/types/lifetime, RBAC, OTP registration/login/reuse, registration side effects in `users`, `customers`, `user_consents`, `first_order_discounts` and `user_sessions`, refresh hashing/rotation/reuse/expiry/access-token rejection/concurrency, and launches Node in `NODE_ENV=test` to compare mounted Node and .NET response keys, statuses, error shapes and JWT claim shapes. Tokens and database-generated customer identifiers are intentionally not compared byte-for-byte across the two implementations; each token is independently checked against its own response.
