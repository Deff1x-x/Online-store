# NET-3A — POST /api/orders

## Scope and source of truth

The implementation is limited to the mounted Node route `POST /api/orders` (`src/app.js` and `src/modules/orders/orders.routes.js`). Node remains the source of truth. No online-payment capture, manager actions, cancellation, delivery completion, or order reads are included.

## Contract

Only a `customer` JWT is accepted. The request is `{payment_method:"online",delivery_address_id,items,promo_code?}`; customer identity is taken from the JWT. The response is Node's `{order_id,order_number,breakdown,payment_options,order}` wrapper. Monetary values in `breakdown` and `payment_options` are JSON numbers without artificial trailing scale; database-backed numeric fields in `order` and `order.items` are strings, matching Node `pg` serialization.

## Transaction and calculations

`PostgresOrderRepository` executes customer lock, subscription/address checks, per-item inventory decrement, discount lookup, order/item/history inserts, and the winning discount side effect in one PostgreSQL transaction. Inventory reservation uses the Node conditional update (`quantity >= requested`) so a failed second line rolls back the earlier reservation.

Calculation order is effective DB price → rounded line totals/subtotal → larger of first-order and promo discounts (first-order wins equal amounts) → fee based on pre-discount subtotal → final total → 80% preauth → POS remainder. A12 verifies tomatoes `1.5` kg plus milk `2`: subtotal `1563`, fee `500`, final `2063`, preauth `1650.4`, remainder `412.6`, and tomatoes `48.500` after one order. Fixed promo checks cover `3025 - 1500 + 500 = 2025` and a capped `5000` promo producing final `500`.

No `payments` row is created by Node order creation, so .NET does not create one either.

## Fulfillment and concurrency

The Node fixed UTC+5 / Almaty rule is reproduced: `[open, close)` is `same_day`; otherwise `next_morning` and `morning_from_11:00`. Node's `DATE` response representation is also preserved: `delivery_date` is an ISO UTC timestamp at the fixed +05:00 date boundary. Every real race uses `Task.WhenAll` behind a barrier and five full fixture resets: last-stock produces one `201` and one `409 product_reservation_conflict`; duplicate creates by one customer produce Node's two orders; global and per-customer promo-limit races produce one accepted use; concurrent first-order requests use the discount once. In every observed Node/.NET outcome, inventory stayed non-negative, no payment was created, and no orphan row remained.

## Tests

`Net3aOrderCreateIntegrationTests` runs Node and .NET against only `koz_dotnet_net3a_test`; it verifies A12 response/type/side effects, fulfillment response fields, fixed and capped promo usage, first-order selection, validation/error parity, customer-only RBAC and address IDOR, rollback on second-item reservation failure, and five-reset concurrency for every required race.

Rollback to Node is operational: leave the frontend on Node and stop the .NET process. No Node route, frontend, packages/api, or database schema was changed.
