# Production Acceptance Checklist

**For:** DevOps / Production team receiving the KOZ codebase  
**Date:** _______________  
**Reviewer:** _______________

---

## Code Guarantees (verified by development team)

- [x] TZ compliance: 57/57 normative requirements IMPLEMENTED, 3 N/A
- [x] Backend unit tests: 75/75 pass
- [x] Frontend tests: 9/9 pass
- [x] Integration tests: 12/12 pass (66 skipped — require dual Node+.NET harness)
- [x] Browser E2E (two contexts): pass
- [x] A7/Ф-0 acceptance: all criteria pass
- [x] TypeScript typecheck: clean
- [x] Docker images: multi-stage, non-root, health-checked
- [x] Startup validation: JWT, OTP, DB, CORS, ForwardedHeaders fail-fast
- [x] Secret scan: no secrets in tracked files
- [x] CI workflow: `.github/workflows/ci.yml`

## Production Team Must Provide

- [ ] VPS or cloud instance (Linux, Docker-capable)
- [ ] PostgreSQL 16+ instance (managed or co-located)
- [ ] DNS records (A/AAAA for API hostname)
- [ ] TLS certificate (Certbot or provided)
- [ ] Strong `DATABASE_PASSWORD` (≥16 chars)
- [ ] Strong `JWT_SECRET` (≥32 chars): `openssl rand -base64 48`
- [ ] Strong `OTP_SECRET` (≥32 chars, different from JWT_SECRET)
- [ ] CORS origin(s) for frontend domains
- [ ] Backup storage location and retention policy
- [ ] Monitoring/alerting integration (health endpoints available)

## Requires External Provider Contract

- [ ] Payment acquiring (Kaspi or equivalent) — placeholder active until contract
- [ ] SMS provider for OTP delivery — console output in development

## Post-Deploy Verification (by production team)

- [ ] `./scripts/vps/validate-env.sh deploy/vps/.env` passes
- [ ] `./scripts/vps/validate-host.sh` passes
- [ ] Docker images build successfully
- [ ] Database schema + migrations applied
- [ ] `.NET` container starts and passes `/health/ready`
- [ ] Node container starts and passes `/api/health`
- [ ] Nginx routes traffic correctly
- [ ] TLS certificate valid
- [ ] CORS works from frontend origin
- [ ] Admin staff login works
- [ ] Guest catalog returns products
- [ ] Backup script produces valid dump
- [ ] Restore-verify succeeds on test database
- [ ] Rollback to Node works and traffic switches

## Only Verifiable After Deploy

- [ ] DNS propagation complete
- [ ] Public HTTPS access works
- [ ] Real user OTP delivery (requires SMS provider)
- [ ] Real payment processing (requires acquiring contract)
- [ ] Performance under production load
- [ ] Backup schedule automated
- [ ] TLS renewal automated
- [ ] Log aggregation connected
- [ ] Alerting on health check failures
