# BACKEND-DEPLOYMENT-AND-CUTOVER-REHEARSAL Goal (permanent)

**Goal ID:** BACKEND-DEPLOYMENT-AND-CUTOVER-REHEARSAL  
**Type:** Permanent deployment / cutover rehearsal  
**Status:** Ready for commit review (commit not performed)  
**Working tree rule:** Do not recreate this Goal. Do not restart the stage. Continue from incomplete checklist items only.

## Objective

Prove ASP.NET Core can be deployed from a clean install, migrated, started with Production-like config, receive cutover traffic, and be rolled back safely. Rehearsal evidence required — not theory alone.

## Exit criteria

1. Stage ready for commit (no commit in this Goal) after **two consecutive clean self-review passes**; or  
2. One real technical blocker requiring external infrastructure, production credentials, payment specification, schema change, or approved cutover policy.

## Checklist

- [x] 1. Release inventory + env reference
- [x] 2. Reproducible deploy artifact (Dockerfile + publish)
- [x] 3. Clean install rehearsal (schema.sql path)
- [x] 4. Migration rehearsal (esp. 003)
- [x] 5. Production-like config fail-fast matrix
- [x] 6. Online payment feature disable (R1)
- [x] 7. Startup smoke
- [x] 8. Node-off rehearsal
- [x] 9. Cutover simulation
- [x] 10. Rollback simulation + OTP limitation
- [x] 11. Backup/restore
- [x] 12. Failure-during-deploy matrix
- [x] 13. Zero-downtime classification
- [x] 14. Observability cutover checklist
- [x] 15. Release checklist
- [x] 16. Artifact security review
- [x] 17. CI/CD command scripts
- [x] 18. Mandatory verification × 2 clean passes
- [x] 19. Documentation set
- [x] 20. Constraints respected (no Node/FE/real Kaspi/commit)

## Self-review passes

| Pass | Date | Result | Notes |
|---|---|---|---|
| 1 | 2026-07-24 | **Clean** | Api 37/37 + Integration 78/78; no further fixes |
| 2 | 2026-07-24 | **Clean** | Repeat Api 37/37 + Integration 78/78; publish OK; `git diff --check` clean |
