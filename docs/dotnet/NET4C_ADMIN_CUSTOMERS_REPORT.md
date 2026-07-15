# NET-4C — Admin Customers

The .NET Admin Customers module covers all eight routes mounted by Node under `/api/admin/customers`. It is isolated as controller, application service/contracts and parameterized PostgreSQL repository. No Node, frontend, API package or schema changes were made.

List uses Node page/limit normalization, store/status/search filtering and `created_at DESC`; detail returns the customer, newest-first addresses and ten newest orders. Subscription renew, pause and cancel use transactions and row locks. Cancel retains Node's soft-default behavior: it only disables auto-renew unless `immediate` is exactly true. Consent logs and export use the Node SQL projections.

All routes use `admin_customers`; user-controlled IDs are validated and failures remain `{message,code}`. The test database is `koz_dotnet_net4c_test`.
