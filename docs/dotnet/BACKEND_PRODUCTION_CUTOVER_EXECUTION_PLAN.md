# Production cutover execution plan (VPS Compose)

**Status:** Executable on a prepared VPS after placeholders are filled. **Not run in this Goal.**

## Sequence

1. Freeze `KOZ_IMAGE_TAG=$(git rev-parse HEAD)`  
2. `./scripts/vps/validate-host.sh`  
3. `./scripts/vps/validate-env.sh deploy/vps/.env`  
4. `./scripts/vps/backup-pre-cutover.sh "$BACKUP_DIR"` + checksum  
5. `./scripts/vps/restore-verify.sh <dump> <verify_db>` (optional but recommended)  
6. `BACKUP_CONFIRMED=yes ./scripts/vps/migrate-production.sh`  
7. `./scripts/vps/build-artifacts.sh`  
8. `./scripts/vps/start-stack.sh` (.NET + Node up; Nginx present)  
9. `./scripts/vps/wait-ready.sh dotnet-api /health/ready`  
10. `./scripts/vps/direct-smoke.sh` + verify pay-online disabled / webhook 503  
11. OTP/order spot checks on fixtures  
12. `./scripts/vps/nginx-switch-dotnet.sh` (`nginx -t` + reload)  
13. `./scripts/vps/observe.sh 120`  
14. Drain public reliance on Node; **keep Node container available**  
15. After observation window: stop Node only when accepted  

Or: `CUTOVER_CONFIRMED=yes BACKUP_DIR=... ./scripts/vps/cutover.sh`

## Placeholders operator must fill

- `SERVER_IP`, `api.example.com`, `https://app.example.com`  
- All `REPLACE_*` values in `.env`  
- TLS material under `deploy/vps/nginx/tls/`  
- Real `DATABASE_HOST` (managed or VPS Postgres)  
- Compose network CIDR for ForwardedHeaders after `docker network inspect`
