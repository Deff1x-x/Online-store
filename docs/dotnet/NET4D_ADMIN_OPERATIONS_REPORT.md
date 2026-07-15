# NET-4D — Admin Operations

## Mounted contracts

The ten Node-mounted `/api/admin/operations` endpoints are implemented: orders list/detail/status, payments, revenue analytics, delivery analytics, store report, order export, promo usage, and first-order discounts. All require `admin_operations` only.

## Contract and side-effect parity

The module preserves Node pagination defaults (1/20, maximum 100), SQL sorting, filters, wrappers, string money values, nullable values, UTC millisecond timestamps, and `{message,code}` errors. Status transition locking is one database transaction. Failed/cancelled returns inventory once; delivered marks the order fully paid, creates the Node POS payment when required, and appends status history.

## Verification

`Net4dAdminOperationsIntegrationTests` runs Node and ASP.NET Core against `koz_dotnet_net4d_test`, rejects all other DB names, compares read contract bodies/RBAC/filters, and runs a five-iteration shared-barrier `Task.WhenAll` status race with stock and POS assertions. Full-gate results are recorded after the final two green runs.

## Rollback

The frontend remains on Node. Rolling back is routing-only: continue serving the mounted Node module; no schema or Node changes were made.
