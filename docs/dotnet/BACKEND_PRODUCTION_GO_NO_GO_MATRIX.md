# Production GO / NO-GO matrix (post package)

**Date:** 2026-07-29  
**Package:** VPS Docker Compose + Nginx  

| Area | Status | Evidence | Required action |
|---|---|---|---|
| Artifact | READY WITH ACTION | Dockerfile + build-artifacts.sh | Tag with git SHA on VPS |
| Host/runtime | READY WITH ACTION | Compose + validate-host | Provision real VPS; start Docker |
| Proxy | READY WITH ACTION | Nginx configs + switch scripts | Install TLS; set server_name |
| TLS | READY WITH ACTION | Certbot runbook | Issue certs for real hostname |
| DNS | READY WITH ACTION | Runbook placeholders | Point A/AAAA to SERVER_IP |
| CORS | READY WITH ACTION | Env template | Set exact frontend origin |
| DB | READY WITH ACTION | External DB env + optional profile | Provision DB; set DATABASE_* |
| Migrations | READY WITH ACTION | migrate-production.sh | Run with BACKUP_CONFIRMED after backup |
| Pool budget | READY | Documented 1×20 + Node 10 + reserve | Keep MaxPoolSize aligned |
| Secrets | READY WITH ACTION | .env.example + validate-env | Fill on server; chmod 600 |
| Backup | READY WITH ACTION | backup + restore-verify scripts | Schedule + prove restore once |
| Monitoring | READY WITH ACTION | observe.sh minimum | Add centralized metrics later (**condition**) |
| Payment | READY | Disabled locked in env + tests | Keep false |
| Cutover method | READY | Nginx upstream switch | Operator executes scripts |
| Rollback | READY | rollback-to-node.sh | Keep Node image/container |
| ForwardedHeaders | READY | Code + tests | Set KnownNetworks to real bridge CIDR |
| Access | READY WITH ACTION | Package complete | Operator SSH to VPS |

**Verdict for package review:** ready for operator fill-in and VPS rehearsal.  
**Not** an authorization to switch production traffic until checklist owners complete READY WITH ACTION rows on the live host.
