# NET-6 Goal (permanent)

**Goal ID:** NET-6  
**Type:** Permanent production certification goal (not a feature sprint)  
**Status:** Active certification record — see `FINAL_RELEASE_CERTIFICATION.md`

## Objective

Confirm that the ASP.NET Core backend is fully ready to replace the Node.js backend in production.

This goal does **not** add features, endpoints, schema changes, or intentional contract changes. Code changes are allowed only to fix confirmed defects discovered during certification.

## In scope

- Full mounted endpoint inventory (Node ↔ .NET)
- Contract / regression / security / performance audits
- Frontend Client + Staff (Admin) smoke against ASP.NET Core
- Production checklist (config, logging, health, shutdown, env, deploy, migrations, startup validation)
- Two consecutive successful full audits
- `FINAL_RELEASE_CERTIFICATION.md` as the release evidence pack

## Out of scope

- New endpoints or REST contract changes
- Database schema changes
- New business logic
- Cosmetic refactors
- Kaspi provider integration (tracked historically as NET-10; identical stub in Node)

## Exit criteria

Either:

1. **PROJECT READY FOR PRODUCTION** — ASP.NET Core can replace Node for the mounted API surface with documented cutover steps; or  
2. One confirmed production blocker that cannot be resolved without changing Node contract or DB schema.
