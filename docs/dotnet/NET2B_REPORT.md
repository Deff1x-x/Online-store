# NET-2B Commerce report

## Scope completed

Node remains the source of truth. NET-2B implements only these mounted contracts without changes to Node, frontend, `packages/api`, or the PostgreSQL schema:

- `GET /api/subscriptions`
- `POST /api/subscriptions`
- `POST /api/subscriptions/:customerId/renew`
- `POST /api/subscriptions/:customerId/cancel`
- `POST /api/promocodes/validate`

`GET /api/subscriptions` returns the Node wrapper and exact subscription key order, including `customer_name`, `customer_phone`, `customer_email`, and `store_id`. Numeric database amounts remain Node-compatible JSON strings with two decimals; payment and promo amounts remain JSON numbers. Dates retain Node's ISO millisecond format, including the Node/PostgreSQL local-date conversion for `next_billing_date`.

## Contract and lifecycle coverage

`Net2bCommerceIntegrationTests` runs Node and the .NET API against **only** `koz_dotnet_net2b_test`. It compares status, content type, wrappers, ordered keys, JSON kinds, nullable fields, money, dates, errors, and database effects.

- Subscription list: filters, ordering, customer fields, null email, money and date formatting.
- Renew and cancel: active, paused, cancelled, expired, no subscription, repeat soft/immediate cancellation, customer state, and the absence of payment rows.
- RBAC/token matrix: customer, store operator, all three admin roles, missing, invalid, expired, and malformed credentials for each NET-2B endpoint.
- IDOR: customer A against customer B, unknown UUID, and malformed UUID. The Node ordering is preserved: an unknown customer is reported before ownership denial.
- Promo validation: fixed and percentage discounts, inactive/expired/future/global/store scope, minimum/boundary, maximum uses, per-customer use, cap-to-total, zero total, unknown code, and trim/case normalisation.
- `Task.WhenAll` concurrency for create, renew, and immediate cancel. It compares outcome distributions, duplicate subscription counts, payments, and orphan subscriptions between implementations.
- `renew` plus immediate `cancel` uses a shared start barrier and `Task.WhenAll`, five fresh fixtures per backend. The seed is one active monthly subscription with a fixed id snapshot, `created_at`, `customers.subscription_start_date`, `expires_at`, `auto_renew=true`, `cancelled_at=null`, one subscription row, and no payments. The schema has no `starts_at` or subscription payment foreign key; the real equivalents are `subscription_start_date` and the total `payments` count. Node establishes the allowable final set: cancelled with request-time expiry/cancellation timestamps, or active with either the seeded-expiry renewal (renew read first) or request-time renewal (cancel read first). .NET must produce only an outcome Node observed; every request is `200`, and every run asserts one subscription, at most one active subscription, no new payments, and no orphan row.

The authorization parser also preserves Node's split behaviour for a `Bearer` header with additional whitespace-separated segments: Node validates the second segment rather than rejecting the header shape first.

## Run

```powershell
$env:KOZ_NET2B_TEST_CONNECTION_STRING = 'Host=localhost;Port=5432;Database=koz_dotnet_net2b_test;Username=postgres;Password=<password>'
dotnet test backend-dotnet/tests/Koz.IntegrationTests/Koz.IntegrationTests.csproj --filter FullyQualifiedName~Net2bCommerceIntegrationTests
```
