# Backend release checklist

Owners: assign real names at execution time (not invent here).

## T-24h

- [ ] Database backup verified (restore smoke in non-prod)
- [ ] Secrets present in secret store (JWT, OTP, DB) — not in git/image
- [ ] CORS origins list approved
- [ ] Postgres capacity / `max_connections` vs replica × pool
- [ ] Image tag or publish artifact hash recorded
- [ ] Migrations 001–003 applied in staging twin
- [ ] Rollback artifact (previous Node revision + DB backup) available
- [ ] Payment initiation remains disabled in Production .NET
- [ ] H4 cart guidance communicated (≤20 lines)

## T-1h

- [ ] `dotnet test` / staging smoke green
- [ ] Deployment approval recorded
- [ ] Smoke fixtures (staff user, store, catalog) confirmed
- [ ] Monitoring dashboards/checklist open
- [ ] On-call / rollback owner identified

## Cutover

- [ ] Deploy .NET artifact
- [ ] `GET /health/ready` = 200 on all new instances
- [ ] Migrations already applied (no migrate-during-traffic without approval)
- [ ] Smoke (health, CORS, auth, catalog, manager reads, webhook 503, pay-online 503 in Production)
- [ ] Switch traffic to .NET
- [ ] Drain Node
- [ ] Observe error rate / latency / locks

## Post-cutover

- [ ] Business checks (order create sample in non-peak window if approved)
- [ ] DB consistency spot-check
- [ ] Logs: no secret leakage; cancelled requests not as 500
- [ ] Node retained until observation window ends

## Rollback

- [ ] Traffic to Node
- [ ] Node healthy
- [ ] Communicate OTP re-request requirement
- [ ] Confirm DB consistency
- [ ] Incident notes
