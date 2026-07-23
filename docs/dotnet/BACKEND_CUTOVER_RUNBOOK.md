# Backend cutover runbook

Companion to `BACKEND_DEPLOYMENT_AND_CUTOVER_REHEARSAL_REPORT.md`.

## Pre-cutover

1. Backup database (`pg_dump` / platform backup). Template (no secrets):

```powershell
pg_dump -h <host> -U <user> -d <db> -F c -f backup.dump
```

2. Apply schema path or ordered migrations (`scripts/dotnet/prepare-db.ps1` for rehearsal; production use approved migrator/ops process).
3. Ensure `003_otp_challenges.sql` applied.
4. Publish or build image:

```powershell
./scripts/dotnet/publish-api.ps1
# or: docker build -f backend-dotnet/Dockerfile -t koz-api:<tag> backend-dotnet
```

5. Configure Production env per `BACKEND_CONFIGURATION_REFERENCE.md` (JWT/OTP/CORS/DB; never bake secrets into image).

## Cutover steps

1. Keep Node serving traffic.
2. Start .NET instance(s); wait until `GET /health/ready` = 200.
3. Smoke: liveness, readiness, CORS, staff login, catalog, manager inventory (see report).
4. Switch LB / reverse-proxy base URL to .NET.
5. Drain Node (finish in-flight; remove from rotation).
6. Observe errors/latency/locks for the agreed observation window.
7. Do **not** remove Node binaries until rollback window closes.

## Local LB equivalent (no production LB)

Run Node on `:3000` and .NET on `:8080`. Point client/`KOZ_LOAD_BASE_URL` from Node → .NET after readiness. Document the switch time.

## Overlap rules

- JWT: shared `JWT_SECRET` required for session continuity across instances.
- OTP: .NET uses Postgres `otp_challenges`; do not rely on sticky sessions.
- Inventory/orders: single Postgres is source of truth.
- Online pay: Production .NET returns `online_payment_disabled` (safer than Node placeholder).

## Rollback trigger examples (relative, not SLA)

- Sustained readiness unhealthy
- Sharp rise in 5xx vs pre-cutover baseline
- Persistent DB pool/timeouts
- Inventory/order correctness failures
