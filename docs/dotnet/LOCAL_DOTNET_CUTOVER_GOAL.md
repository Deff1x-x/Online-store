# LOCAL-DOTNET-CUTOVER Goal (permanent)

**Goal ID:** LOCAL-DOTNET-CUTOVER  
**Type:** Permanent local-development cutover goal (not a feature sprint)  
**Status:** Ready for review — LOCAL DEVELOPMENT USES DOTNET BY DEFAULT

## Objective

Make ASP.NET Core the **default** backend for local host development and local Docker.

Node remains available only as an explicit legacy / parity / rollback mode.

## Constraints

- Do not recreate this Goal.
- Continue from the current working tree; do not restart migration from scratch.
- Do not change business logic or public API contracts.
- Do not delete the Node backend.
- Do not commit or push as part of this Goal.

## In scope

- Root npm scripts (`npm run dev` → .NET stack)
- Frontend default API URL → .NET port
- Local DB bootstrap independent of Node
- `deploy/local/docker-compose.yml` default → Postgres + .NET
- LOCAL_DEVELOPMENT.md primary path → .NET
- Product smoke / A7 / B7 / Playwright targeting .NET
- Explicit `dev:node` / Compose `legacy` profile for Node

## Out of scope

- Production VPS cutover (already tracked under release / cutover goals)
- Schema / contract / TZ changes
- Removing Node parity suites

## Exit criteria

Either:

1. **LOCAL DEVELOPMENT USES DOTNET BY DEFAULT** — verified host + Docker smoke, two consecutive clean self-review passes; or  
2. One confirmed blocker that cannot be resolved without changing approved API / schema / TZ.
