# .NET migration plan

The order keeps the Node API as the contract source, moves only a module after its contract and E2E coverage exist, and uses the same PostgreSQL schema through Npgsql. Each module must retain URLs, JSON casing, nullable values, errors and authorization before traffic can be switched.

| Order | Module | Dependencies | Transactional risk / complexity | Ready when | Required tests |
|---:|---|---|---|---|---|
| 0 | System / Health | configuration, Npgsql | Low / low | `GET /api/health` shape and startup DB validation match Node | health contract, invalid config redaction, test DB connection |
| 1 | Auth | users, roles, JWT, OTP | high: token security and refresh; high | customer/staff token claims and Node errors match | OTP/register/login/refresh contract; auth negative cases; JWT E2E |
| 2 | Products | products, stores, inventory | medium: catalogue visibility; medium | public catalogue + admin product operations match | anonymous catalogue, admin RBAC, inventory price/nullability |
| 3 | Profile | users, customers, subscriptions | low / low | read/update preserves nullable name/email | customer contract and RBAC E2E |
| 4 | Addresses | customers, coverage, stores | medium: ownership/default-address rules | address CRUD has identical ownership/errors | CRUD + cross-customer denial E2E |
| 5 | Subscriptions | customers, payments, admin customers | high: lifecycle and future billing | statuses/dates/renew/cancel semantics match | lifecycle transitions, role matrix, duplicate/expired cases |
| 6 | Promocodes | promo codes, orders, store scope | medium: limits and money rounding | validation calculation and admin mutations match | valid/expired/limit/minimum contract tests |
| 7 | Orders | addresses, inventory, discounts, promos, delivery settings, payments | **critical**: stock reservation, money and state transitions; very high | create/my-orders exactly match and SQL operations are transactional | create/order failure rollback, weighted items, promo, ownership E2E |
| 8 | Payments | orders, subscriptions, provider contract | **critical**: idempotency and payment state | online initiation and payment records match | provider stub, retry/idempotency, capture/rollback E2E |
| 9 | Manager | orders, inventory, store operator | high: pick/weight/status/inventory updates | all manager transitions and analytics match | state-machine, store isolation, receive/stock E2E |
| 10 | Admin Catalog | products, stores, coverage, inventory, promos, delivery settings | high: cross-store mutations | all status codes captured and CRUD parity proven | CRUD matrix, role denial, nullable fields contract tests |
| 11 | Admin Customers | customers, subscriptions, audit logs | medium: subscription side effects/export | filters/detail/export keep response shape | query/filter, lifecycle, export E2E |
| 12 | Admin Operations | orders, payments, promos, reports | high: analytics consistency | reports and operations have reconciled totals | filters, status change, report reconciliation E2E |
| 13 | Notifications | queued notification storage | medium: delivery retry/visibility | 202 queueing semantics and records match | SMS/email queue contract, admin RBAC |
| 14 | Kaspi Webhook | payments, external provider contract | **critical**: signed/idempotent external events | provider contract approved and prod guard intentionally replaced | payload verification, duplicate event, failure/retry E2E |

## Cross-cutting exit criteria for every module

1. Add a Node-vs-.NET contract test with realistic PostgreSQL data, including success, validation failure, unauthenticated and forbidden responses.
2. Use explicit Npgsql transactions only for an existing multi-step Node transaction; no generic repository or new schema/migration.
3. Verify CORS/auth/error `{message,code}` behaviour at the HTTP boundary.
4. Switch no frontend base URL until the complete module's contract/E2E suite passes against both implementations.

## Rollback rule for every migration stage

Node remains the production implementation through RC-2. A module is enabled only behind an explicit, reversible routing/configuration switch after its exit criteria pass. If contract, transaction or operational monitoring diverges, route that module back to Node immediately, retain the same PostgreSQL schema, and investigate with the captured contract test. No NET stage may make a schema change that prevents this rollback.

## NET-1 scope

NET-1 should start Auth discovery and its contract tests only. It must not begin Orders, Admin or a frontend switch before Auth is demonstrably compatible.
