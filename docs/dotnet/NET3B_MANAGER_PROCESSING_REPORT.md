# NET-3B manager order processing

## Mounted contract

The migrated Node surface is `GET /api/my-store/orders`, `PUT /api/my-store/orders/:id/pick`, `PUT /api/my-store/orders/:id/actual-weight`, and `PUT /api/my-store/orders/:id/status`. Every route is `store_operator` only and gets the store only from the JWT. Cross-store and unknown ids share Node's `404 {"message":"Order was not found","code":"order_not_found"}` contract.

List responses are `{orders}`. Mutation responses are `{order}` and retain Node/pg string serialization for raw `orders` numeric columns. The list's JSONB `items` values are JSON numbers and use Node's canonical key order; items sort by product name.

## Processing and money rules

`pick` locks the store-scoped order and permits only `new → picked`. The status endpoint uses the mounted Node graph: `new → picked|failed|cancelled`, `picked → in_delivery|failed|cancelled`, and `in_delivery → delivered|failed`. Each successful status mutation creates exactly one history record. `failed` and `cancelled` return ordered item quantities to inventory. `delivered` marks the order `fully_paid`, timestamps it, and creates exactly one completed `pos_terminal` payment when `pos_terminal_topup > 0`.

Actual weight is deliberately the Node order-level calculation, not a new per-item algorithm:

`goods_actual = subtotal × actual_weight / estimated_weight`

`final_total = round(max(0, goods_actual − discount_total) + delivery_fee)`

`online_capture_amount = round(min(online_payment_amount, final_total))`

`pos_terminal_topup = round(max(0, final_total − online_capture_amount))`

No payment is created or changed by actual-weight processing. For A12 (subtotal `1563`, delivery `500`, estimated `1.5`, hold `1650.40`) at `1.42kg`, both backends return final `1979.64`, capture `1650.40`, POS `329.24`. At `1.00kg`, both return final/capture `1542.00` and POS `0`.

## Persistence, locking, and safety

`PostgresOrderRepository` uses parameterized Npgsql commands. Every mutation has one PostgreSQL transaction and locks the order with `SELECT … FOR UPDATE` scoped by `id` and JWT `store_id`; the rollback path covers all order/payment/history/inventory work. List hydration uses one joined query, avoiding N+1 reads. No endpoint accepts client totals, capture values, payment values, or a store id.

The NET-3B suite refuses any database other than `koz_dotnet_net3b_test`. It performs full fixture reset before each run and starts Node and .NET against the same reset state. Five repetitions cover double pick, different and identical actual-weight writes, pick+actual-weight, and actual-weight+in-delivery races. Observed Node outcome sets are used as the .NET oracle; final orders have no duplicate payments, no orphan records, and no partial state.

## Tests and scope boundary

`Net3bManagerProcessingIntegrationTests` covers list JSON/wrapper/type ordering, pick, A12, strong underweight, transition guards/RBAC, cancellation/delivery side effects, rollback-safe transactions, and five-reset concurrent races. The manager-only payment side effect is the delivered POS record; online provider/webhook migration remains outside NET-3B. No my-orders, admin reports, or unrelated inventory endpoints are migrated here.
