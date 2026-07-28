# BACKEND-PRODUCTION-INFRASTRUCTURE-IMPLEMENTATION Goal (permanent)

**Goal ID:** BACKEND-PRODUCTION-INFRASTRUCTURE-IMPLEMENTATION  
**Type:** Production deployment package for approved VPS path  
**Status:** Completed — ready for review  
**Working tree rule:** Do not recreate. Continue incomplete checklist only. No production deploy. No real secrets. No commit.

## Approved topology

- One Linux VPS
- Docker Compose
- Nginx reverse proxy + traffic switch
- ASP.NET Core in Docker (existing Dockerfile)
- PostgreSQL: **external** to Compose by default (managed **or** host-installed on the same VPS); optional Compose profile `postgres` for co-located container
- TLS: **Certbot** (Let's Encrypt) with placeholders
- Secrets: server-side `.env` (mode 600)
- Online payment: **disabled**
- Node kept as rollback backend
- Cutover: Nginx upstream switch

## Checklist

- [x] 1. Production Compose
- [x] 2. Nginx configs + switch
- [x] 3. ForwardedHeaders + tests
- [x] 4. Env contract + gitignore
- [x] 5. Pool budget doc
- [x] 6. Migration script
- [x] 7. Backup/restore scripts
- [x] 8. Deployment/cutover/rollback scripts
- [x] 9. Observability minimum
- [x] 10. TLS/DNS runbook
- [x] 11–12. Cutover + rollback plans
- [x] 13. Payment decision locked disabled
- [x] 14. Deployment contract tests
- [x] 15. Documentation
- [x] 16. Two clean verification passes (Api.Tests 52/52 ×2)

## Self-review passes

| Pass | Result | Notes |
|---|---|---|
| A | **Clean** | Api.Tests 52/52; build -warnaserror |
| B | **Clean** | Api.Tests 52/52 consecutive; `git diff --check` clean |

## Docker runtime

**Unverified** — Docker daemon not running on implementation host. Static compose/Dockerfile/nginx/script tests cover the package.
