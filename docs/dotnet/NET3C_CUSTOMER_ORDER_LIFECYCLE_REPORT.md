# NET-3C — customer order lifecycle

## Mounted Node scope

Node mounts exactly two customer order reads: `GET /api/my-orders` and `GET /api/my-orders/:id`. Both require a customer JWT. No customer cancellation endpoint is mounted, so NET-3C intentionally adds no cancel handler, inventory return, refund, payment mutation, or cancel race. Manager cancellation remains NET-3B.

## Parity

Identity comes only from JWT user id, which is mapped to `customers.id`. List is empty without a customer record and uses Node's SQL projection with `created_at DESC`. Detail scopes order id and customer id together; foreign and unknown IDs both return `404 {"message":"Order was not found","code":"order_not_found"}`. Items use `name ASC`. Numeric database values remain JSON strings; timestamps and fixed +05:00 date-only values retain Node formatting.

The read surface exposes NET-3B's persisted final customer view: A12 is `final_total=1979.64`, `online_capture_amount=1650.40`, `pos_terminal_topup=329.24`, `delivery_status=delivered`, and `payment_status=fully_paid`. Payments are not returned by mounted Node reads and are not invented in .NET.

## Tests, transaction, rollback

`Net3cCustomerOrderLifecycleIntegrationTests` accepts only `KOZ_NET3C_TEST_CONNECTION_STRING` with database name `koz_dotnet_net3c_test`, starts Node/.NET on the same fixture, and compares raw response JSON, headers, exact key order, sorting, ownership, RBAC, not-found behavior, and final A12 customer values. The routes are read-only, so no transaction/stock/payment side effects exist in this scope. Existing NET-3B covers the real manager cancellation transaction, stock restore, rollback, and write races.

No Admin, notification, webhook, payments API, schema, frontend, or cutover changes are included. Rollback is keeping the frontend on Node and stopping the .NET API.
