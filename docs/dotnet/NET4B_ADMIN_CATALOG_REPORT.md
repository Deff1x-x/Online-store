# NET-4B — Admin Catalog

## Scope and mounted routes

The implementation covers the 18 routes mounted under `/api/admin/catalog`: store list/create/update/delete, coverage upsert, product list/create/update/delete, store inventory read/upsert/incoming, promo list/create/update/delete, and delivery-settings read/upsert. No legacy catalog routes, Admin Customers, Admin Operations, notifications, or webhooks were added.

## Contract and persistence

All operations require the `admin_catalog` JWT role. Responses retain Node wrappers (`stores`, `store`, `coverage`, `products`, `product`, `inventory`, `promo_codes`, `promo_code`, `delivery_settings`) and `{message,code}` failures. PostgreSQL `numeric` is emitted as Node `pg` strings; IDs and enum strings retain their Node forms. Lists use Node SQL order: stores/products/promos newest-first and inventory category/name.

Store creation inserts default delivery settings atomically. Coverage and inventory use the Node uniqueness keys for upsert. Store/product/promo deletes are soft state changes; rows remain. Inventory status and integer stock derive from submitted decimal quantity, and incoming stock updates are single statements. Promo code uniqueness returns `duplicate_entity`.

## Concurrency and security

The contract test has five barrier/`Task.WhenAll` runs for duplicate store and promo creation, coverage upsert and inventory mutation. Node and .NET produce the same HTTP outcome sets; duplicate promos yield one 201 and one 409, while upserts leave no duplicate rows. Only `admin_catalog` is authorized; customer, store operator, admin-customers and admin-operations are denied. UUID/reference, validation, not-found and duplicate failures use safe Node-shaped errors.

## Architecture and rollback

`AdminCatalogController` is HTTP-only; `AdminCatalogService` contains validation/orchestration and `PostgresAdminCatalogRepository` owns parameterized Npgsql SQL and the store transaction. It is isolated from Orders/Commerce and uses no EF or generic repository. Rollback follows Node: failed store default-settings creation rolls the store back; PostgreSQL single-statement upserts/soft-deletes are atomic. Reverting traffic to Node requires only routing, because the schema and Node code were unchanged.

## Test coverage

`Net4bAdminCatalogIntegrationTests` checks list/read contracts, stores, coverage, delivery settings, products, inventory/incoming, promo CRUD, authorization/validation and five-run concurrency against Node on `koz_dotnet_net4b_test`. The test fixture refuses any other database name.
