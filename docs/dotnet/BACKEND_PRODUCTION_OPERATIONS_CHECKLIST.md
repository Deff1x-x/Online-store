# Production operations checklist (VPS)

## Pre-cutover

- [ ] Fill `deploy/vps/.env` (mode 600); validate-env passes  
- [ ] DNS `api.example.com` → `SERVER_IP`; frontend origin matches CORS  
- [ ] TLS cert installed under `nginx/tls/`  
- [ ] Pool budget reviewed (`BACKEND_PRODUCTION_POOL_BUDGET.md`)  
- [ ] Backup created + restore-verify on separate DB  
- [ ] Migrations 001–003 verified/applied (`BACKUP_CONFIRMED=yes`)  
- [ ] Images tagged with git SHA  
- [ ] Direct smoke on `dotnet-api` (payment webhook 503)  
- [ ] Node container healthy for rollback  
- [ ] Observation commands ready (`observe.sh`)

## Cutover

- [ ] `CUTOVER_CONFIRMED=yes ./scripts/vps/cutover.sh` (or step through runbook)  
- [ ] Nginx active = .NET  
- [ ] Public HTTPS health OK  
- [ ] Observe 5xx / readiness / DB  
- [ ] Keep Node up during window  

## Rollback triggers

- Readiness unhealthy; sustained 5xx; pool/DB timeouts; inventory correctness; auth failure; cannot read logs  

## Rollback

- [ ] `./scripts/vps/rollback-to-node.sh`  
- [ ] Communicate OTP re-request  
- [ ] Do not drop `otp_challenges`  

## Post

- [ ] Centralized metrics/alerts still required as ongoing production condition  
- [ ] Capture incident / cutover notes
