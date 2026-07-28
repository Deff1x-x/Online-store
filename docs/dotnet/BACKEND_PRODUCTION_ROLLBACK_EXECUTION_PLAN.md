# Production rollback execution plan (VPS Compose)

## Triggers

Readiness failure, sustained 5xx, DB/pool timeouts, inventory correctness, auth failure, inability to inspect logs.

## Steps

```bash
./scripts/vps/rollback-to-node.sh
# verifies Node /api/health, writes active-upstream → node-api:3000, nginx -t, reload
```

Then:

1. Public smoke via `https://api.example.com/api/health`  
2. Confirm orders/inventory readable on Node (shared DB)  
3. **OTP notice:** request new OTP; do **not** drop `otp_challenges`  
4. No down migration  
5. Capture nginx/docker logs for incident notes  

Rollback scripts **do not** run SQL schema changes.
