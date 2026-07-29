# BACKEND-VPS-RUNTIME-VALIDATION Goal (permanent)

**Goal ID:** BACKEND-VPS-RUNTIME-VALIDATION  
**Type:** Runtime validation of the production deployment package on a real Linux VPS (pre-cutover)  
**Status:** Stopped — **one infrastructure/access blocker**  
**Working tree rule:** Do not recreate. Do not restart the stage. Continue from incomplete checklist items and current VPS/working-tree state only. No production traffic switch. Do not stop Node production. No commit without user confirmation.

## Objective

Validate the prepared VPS deployment package (`deploy/vps/*`, `scripts/vps/*`, Dockerfiles) on a real Linux VPS outside public traffic, then produce GO / GO-WITH-CONDITIONS / blocker.

## Exit criteria

1. BACKEND-VPS-RUNTIME-VALIDATION completed (with GO or GO WITH CONDITIONS); or  
2. One concrete infrastructure/access blocker.

## Checklist

- [ ] 1. VPS access & host inventory — **BLOCKED** (no SSH/host credentials)
- [ ] 2. Repository & release identity
- [ ] 3. Env file validation
- [ ] 4. Docker network & ForwardedHeaders
- [ ] 5. Static config validation
- [ ] 6. Image build
- [ ] 7. PostgreSQL connectivity & pool budget
- [ ] 8. Backup & restore validation
- [ ] 9. Migration validation
- [ ] 10. Start .NET outside public traffic
- [ ] 11. Node rollback runtime
- [ ] 12. Nginx & TLS
- [ ] 13. Direct .NET smoke
- [ ] 14. Multi-container / restart
- [ ] 15. Nginx switch rehearsal (no public traffic)
- [ ] 16. Observability minimum
- [ ] 17. Security validation
- [ ] 18. Resource validation
- [ ] 19. Two clean validation passes A→B
- [ ] 20. Documentation (reports written with blocker evidence)

## Outcome

See `BACKEND_VPS_RUNTIME_VALIDATION_REPORT.md` and `BACKEND_VPS_GO_NO_GO.md`.
