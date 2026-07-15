# NET-4A — Manager Dashboard + Inventory

Mounted Node surface migrated: `GET /api/my-store/inventory`, `PUT /api/my-store/inventory/:product_id`, `POST /api/my-store/inventory/:product_id/incoming`, and `GET /api/my-store/analytics`. All require `store_operator`; store scope is exclusively the JWT `store_id`.

Inventory preserves Node category/name order, nullable selling price, effective price fallback, quantity/status rules, visibility, incoming delivery date, and store-scoped not-found/error contracts. Mutations use parameterized SQL and one PostgreSQL transaction. Analytics preserves the date range default and aggregates: delivery funnel, delivered GMV, POS, average order value, stopped/out-of-stock/low-stock counts.

No Admin, notifications, webhooks, frontend, Node, package API, or schema work is included.
