# Backend pre-production deployment checklist

Use before any production traffic switch. Owners/window assigned at execution time (not invented here).

## Pre-deploy

- [ ] Immutable artifact identity recorded (git SHA + publish checksum and/or image digest)
- [ ] Backup created and restore-validated
- [ ] Rollback artifact available (Node revision + DB backup)
- [ ] Migrations 001–003 confirmed on target DB
- [ ] `ASPNETCORE_ENVIRONMENT=Production`
- [ ] Strong distinct `JWT_SECRET` / `OTP_SECRET`
- [ ] Explicit CORS origins (no `*`)
- [ ] `PAYMENTS_ONLINE_INITIATION_ENABLED` false / unset in Production
- [ ] DB connection budget: `replicas × MaxPoolSize + ops < max_connections`
- [ ] Health paths known: `/api/health`, `/health/ready`
- [ ] Smoke commands ready (`scripts/dotnet/smoke-api.ps1` / `preprod-validate.ps1`)
- [ ] Monitoring dashboards available on **production** platform
- [ ] Logging destination confirmed

## Deploy

- [ ] Deploy artifact
- [ ] All replicas `GET /health/ready` = 200
- [ ] `/__test/*` absent
- [ ] CORS allow/deny verified
- [ ] Auth/OTP smoke (including cross-replica if multi-instance)
- [ ] Business smoke (catalog, order, manager, admin, RBAC)
- [ ] Pay-online 503 `online_payment_disabled`
- [ ] Webhook 503 `kaspi_webhook_disabled`
- [ ] Limited concurrency check on isolated SKU (optional but recommended)

## Cutover dry-run (non-prod traffic only)

- [ ] .NET ready outside traffic
- [ ] Partial then full test traffic to .NET
- [ ] Node drain
- [ ] .NET-only smoke
- [ ] Rollback to Node rehearsed
- [ ] OTP re-request communication ready

## Abort if

- Backup/restore not verified
- Readiness false-positive / flapping
- Pool budget unsafe
- Payment gate accidentally enabled
- Inventory correctness failure
- Rollback path broken
