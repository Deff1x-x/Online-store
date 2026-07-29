# KOZ TZ Implementation Plan (vertical slices)

**Goal:** KOZ-TZ-FULL-IMPLEMENTATION  
**TZ:** `docs/ЕДИНОЕ_ТЗ_КОЦ.md` v1.0 · июль 2026  
**Order:** INCORRECT invariants → MISSING DB → MISSING BE → MISSING FE → PARTIAL → E2E → deploy/docs → final audit.

Do not merge unrelated features in one slice.

---

## Slice S1 — Restore TZ payment placeholder (INCORRECT A5-09 / INV-01)

**Status:** DONE — Api.Tests 52/52 ×2 clean passes (2026-07-29)  
Changes: `PaymentsOptions` default-on placeholder; Production may set `true`; kill-switch `false` kept; env example + validate-env aligned to TZ.

| | |
|---|---|
| TZ | Инварианты 1; А5 payments pay-online «провайдер — плейсхолдер»; Б3.4 stub widget |
| Problem | .NET Production defaults initiation **off**, refuses `true`, returns 503 — contradicts TZ placeholder |
| Files | `PaymentsOptions.cs`, `PaymentsController.cs`, `PaymentsReleaseGateTests.cs`, `DeploymentPackageContractTests.cs`, `deploy/vps/.env.production.example`, `scripts/vps/validate-env.sh`, related docs under Goal scope only if needed for accuracy |
| Migration | No |
| API | pay-online returns 201 placeholder (Node parity) by default; optional kill-switch `false` still allowed |
| FE | Optional follow-up: call pay-online from checkout (S4) |
| Tests | Rewrite gate tests for TZ: default enabled placeholder; disabled still 503 when explicitly false |
| Acceptance | `dotnet test` Payments* + Integration payment initiate when enabled |
| Deps | None |

## Slice S2 — Enforce weighted qty step 0.1 (INCORRECT INV-08)

**Status:** DONE — Api.Tests 65/65 ×2 clean passes  
Node + .NET validate 0.1 kg step; `OrderQuantityRules` + unit tests; Net3a asserts 1.23 rejected (when DB env set).

## Slice S3 — GET /api/stores (MISSING A5-12)

| | |
|---|---|
| TZ | А5 `/api/stores` GET list |
| Files | .NET controller + Node mount; FE only if needed |
| Deps | S1–S2 |

## Slice S4 — Checkout calls pay-online + payment row (PARTIAL B3-04)

| | |
|---|---|
| TZ | А5 pay-online; Б3.4 provider.init after order |
| Files | `CheckoutPage.tsx`, `payments-api.ts` |
| Deps | S1 |

## Slice S5 — Auth alias routes if required (MISSING A5-02)

| | |
|---|---|
| TZ | А5 register-phone, verify-otp, login-admin |
| Note | If aliases of existing endpoints — add thin mounts; if distinct contracts undefined → **BLOCKED BY TZ** |
| Deps | — |

## Slice S6 — operator/orders legacy (MISSING A5-07)

| | |
|---|---|
| TZ | А5 legacy mount |
| Files | Mount Node + .NET parity |
| Priority | P3 after core |

## Slice S7 — FE E2E B7 journey + Lighthouse evidence (MISSING B7-01 / X-02)

| | |
|---|---|
| TZ | Б7 Definition of Done |
| Files | Playwright (or equivalent) scenarios 1–7; Lighthouse note |
| Deps | S1–S4 |

## Slice S8 — Frontend unit tests for critical UX (X-01)

| | |
|---|---|
| Cart quantity, 80/20 block, paywall, manager transitions | |
| Deps | — |

## Slice S9 — B4 receive path PO decision (BLOCKED BY TZ B4-02)

| | |
|---|---|
| Keep A5 `incoming` until PO confirms B4 typo or requires alias `receive` | |
| Deps | PO |

## Slice S10 — Docs/OpenAPI/matrix final + Stage 10–11 two clean passes

---

## Remediation slices (post-audit FINAL REPORT INCONSISTENT)

| Slice | ID | Action | Status |
|---|---|---|---|
| R1 | Docs | Exact 60/53→remediated counts; revoke FULLY COMPLIANT | DONE |
| R2 | A3-05 | Grace 3d + placeholder recurrent token + FE + tests | DONE |
| R3 | A7-01 | `docs/tz/evidence/A7_F0_ACCEPTANCE.md` + script | DONE |
| R4 | B1-01 | Tokens/fonts mandated; Figma reference only → IMPLEMENTED | DONE |
| R5 | B6-01 | Truthful phase outcome report (no fake PRs) | DONE |
| R6 | B7-01 | Playwright two contexts (`npm run test:b7-browser`) | DONE |
| R7 | X-03/04/05 | N/A (NOT REQUIRED FOR TZ) | DONE |
| R8 | Stage 10–11 | Recount + two clean full passes | IN PROGRESS |

**Authoritative recount after R1–R7:** unique 60 = IMPLEMENTED 57 + N/A 3; PARTIAL/MISSING/INCORRECT/BLOCKED = 0.

---

## Execution

Update matrix after each slice. Two clean self-review passes per slice before next. No commit without user OK.
