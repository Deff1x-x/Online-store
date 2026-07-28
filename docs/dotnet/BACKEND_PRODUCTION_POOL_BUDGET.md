# Pool budget — VPS Compose topology

## Approved defaults (starting values, not an SLA)

| Parameter | Value |
|---|---|
| .NET replicas | **1** (Compose service `dotnet-api`) |
| .NET `DATABASE_MAX_POOL_SIZE` | **20** |
| Node rollback instances | **1** (`node-api`) |
| Node `pg` pool | library default (**10** unless overridden) |
| Operational / admin / migrate reserve | **10** |
| PostgreSQL `max_connections` (starter) | **100** (raise only after RAM review) |

## Formula

```
safe_budget ≈ max_connections - superuser_reserved (default 3) - admin_reserve
overlap = (node_instances × node_pool) + (dotnet_replicas × MaxPoolSize) + ops_reserve

Require: overlap < safe_budget
```

## Example with defaults

```
overlap = (1 × 10) + (1 × 20) + 10 = 40
safe_budget ≈ 100 - 3 - 5 = 92
40 < 92 → OK
```

## Cutover overlap window

During observation both Node and .NET may be connected:

```
(1×10) + (1×20) + 10 = 40  (still OK at max_connections=100)
```

If scaling .NET to 2 replicas with MaxPoolSize 20:

```
(1×10) + (2×20) + 10 = 60  (still OK)
```

**Do not** run `MaxPoolSize=100` with multiple replicas against `max_connections=100`.

## Optional Compose Postgres

When using `docker-compose.postgres.yml`, set `POSTGRES_MAX_CONNECTIONS` consistently with the budget above. Prefer managed PostgreSQL when available.
