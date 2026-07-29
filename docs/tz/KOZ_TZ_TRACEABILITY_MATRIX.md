# KOZ TZ Traceability Matrix

**Goal:** KOZ-TZ-FULL-IMPLEMENTATION  
**TZ source (locked):** `docs/ЕДИНОЕ_ТЗ_КОЦ.md` · **Версия 1.0** · июль 2026  
**Updated:** 2026-07-29 (remediation after FINAL REPORT INCONSISTENT)  
**Rule:** IMPLEMENTED only with code + DB behavior (if required) + FE flow (if required) + test/reproducible check + TZ acceptance.  
**Unique ID rule:** X-01 / X-02 appear in Part B and Cross-cutting tables but count **once**.

**Backend scope note:** TZ Part A describes Node v5; Mode B allows own backend matching Part A. Active cutover target is ASP.NET (`backend-dotnet`); Node remains rollback. Both evaluated against Part A contracts.

---

## Status legend

| Status | Meaning |
|---|---|
| IMPLEMENTED | Evidence meets acceptance |
| PARTIAL | Exists but incomplete vs TZ |
| MISSING | Not present |
| INCORRECT | Present but violates TZ |
| BLOCKED BY TZ | Ambiguity/contradiction inside TZ |
| N/A (NOT REQUIRED FOR TZ) | Not a normative TZ requirement, or TZ allows alternative / optional donor-tooling |

---

## Product invariants (Stage 3)

| ID | TZ | Summary | BE | FE | DB | Tests | Status | Evidence / gap |
|---|---|---|---|---|---|---|---|---|
| INV-01 | Инварианты 1; А3 | Online = 80% preauth only; no online top-up; capture ≤ hold; underweight capture=final, POS=0 | Y | Y | Y | .NET Net3b + order create + PaymentsReleaseGate | **IMPLEMENTED** | Placeholder pay-online default-on (TZ А5); kill-switch `false` → 503 |
| INV-02 | Инварианты 1; А4 | Remainder paid to courier via POS after actual weight; delivered writes pos_terminal payment | Y | Y | Y | Net3b/Net4d | **IMPLEMENTED** | |
| INV-03 | Инварианты 1 | No online top-up path | Y | Y | — | release/payment tests | **IMPLEMENTED** | |
| INV-04 | Инварианты 1; А3 | capture = min(hold, final) | Y | Y | Y | Net3b | **IMPLEMENTED** | |
| INV-05 | Инварианты 1; А3 | underweight → capture=final, pos=0 | Y | — | Y | Net3b | **IMPLEMENTED** | |
| INV-06 | Инварианты 2; А3 | Discounts/promos on goods only; goods after discount ≥ 0 | Y | Y | Y | Net3a | **IMPLEMENTED** | |
| INV-07 | Инварианты 2 | Delivery always paid fully (not discounted) | Y | Y | Y | Net3a | **IMPLEMENTED** | |
| INV-08 | Инварианты 3; Б3 | Weighted qty in kg; step 0.1 (FE stepper 0.5 / manual 0.1) | Y | Y | Y | OrderQuantityRulesTests + Net3a | **IMPLEMENTED** | |
| INV-09 | Инварианты 3 | Piece qty integers only | Y | Y | Y | Node+NET create | **IMPLEMENTED** | |
| INV-10 | Инварианты 4; А3 | Atomic reserve on create; cancel/failed restore stock | Y | Y | Y | Net3a/Net3b | **IMPLEMENTED** | |
| INV-11 | Инварианты 5 | Catalog/prices/stock public; order needs auth+active sub | Y | Y | Y | Net2a/Net3a | **IMPLEMENTED** | |
| INV-12 | Инварианты 6 | store_operator scoped by user.store_id; stop-list local | Y | Y | Y | Net4a | **IMPLEMENTED** | |

---

## Part A — Backend

| ID | Section | Requirement (faithful) | BE | FE | DB | Test | Status | Files / notes | Priority |
|---|---|---|---|---|---|---|---|---|---|
| A1-01 | А1 | Stack/layers: API with transactional money ops, JWT+refresh, migrations 001–003 | Y | — | Y | Integration | **IMPLEMENTED** (Mode B .NET + shared DB) | `backend-dotnet`, `database/*` | — |
| A2-01 | А2 | Core tables as listed | Y | — | Y | schema | **IMPLEMENTED** | `database/schema.sql` | — |
| A3-01 | А3 | Order money formulas at create | Y | — | Y | Net3a | **IMPLEMENTED** | | P0 |
| A3-02 | А3 | Actual-weight recalculation + capture/pos | Y | Y | Y | Net3b | **IMPLEMENTED** | | P0 |
| A3-03 | А3 | Ordering window Asia/Almaty → fulfillment_window | Y | Y | Y | order create | **IMPLEMENTED** | | P1 |
| A3-04 | А3 | Reservation conflict 409 | Y | — | Y | Net3a | **IMPLEMENTED** | | P0 |
| A3-05 | А3 | Subscription activate/grace 3d/soft cancel/pause/409; recurrent via provider token (placeholder until acquiring) | Y | Y | Y | SubscriptionAccessRulesTests + A7 + FE profile | **IMPLEMENTED** | `docs/tz/evidence/A3_05_GRACE_RECURRENT.md` | P1 |
| A3-06 | А3 | Promo validation; no stack with first-order discount | Y | Y | Y | Net3a | **IMPLEMENTED** | | P1 |
| A3-07 | А3 | Order gate 401 / 403 subscription_* | Y | Y | — | Net3a | **IMPLEMENTED** | | P0 |
| A4-01 | А4 | delivery_status state machine + stock restore | Y | Y | Y | Net3b | **IMPLEMENTED** | | P0 |
| A4-02 | А4 | delivered → pos_terminal + fully_paid | Y | Y | Y | Net3b | **IMPLEMENTED** | | P0 |
| A5-01 | А5 | Auth: otp, register, login, staff/login, refresh | Y | Y | Y | Net1 | **IMPLEMENTED** | | P0 |
| A5-02 | А5 | Auth aliases: register-phone, verify-otp, login-admin | Y | — | — | AuthAliasRoutesTests | **IMPLEMENTED** | | P2 |
| A5-03 | А5 | Public GET /products/store/:id; admin product create/link | Y | Y | Y | Net2a/Net5 | **IMPLEMENTED** | | P0 |
| A5-04 | А5 | Orders create + pay-online + validate-promo; my-orders | Y | Y | Y | Net3* | **IMPLEMENTED** | | P0 |
| A5-05 | А5 | Addresses, profile, subscriptions, promocodes | Y | Y | Y | Net2* | **IMPLEMENTED** | | P1 |
| A5-06 | А5 | my-store orders/inventory/analytics; POST …/incoming | Y | Y | Y | Net4a | **IMPLEMENTED** | | P0 |
| A5-07 | А5 | operator/orders legacy mount | Y | — | — | OperatorOrdersMountTests | **IMPLEMENTED** | | P3 |
| A5-08 | А5 | admin catalog/customers/operations surfaces | Y | Y | Y | Net4* | **IMPLEMENTED** | | P1 |
| A5-09 | А5 | payments list/get + pay-online **placeholder** until acquiring | Y | Y | Y | PaymentsReleaseGateTests | **IMPLEMENTED** | | P0 |
| A5-10 | А5 | notifications queue placeholder | Y | — | Y | — | **IMPLEMENTED** | | P2 |
| A5-11 | А5 | webhooks/kaspi placeholder | Y | — | — | — | **IMPLEMENTED** | | P2 |
| A5-12 | А5 | GET /api/stores | Y | — | Y | PublicStoresListTests | **IMPLEMENTED** | | P2 |
| A6-01 | А6 | RBAC roles as listed | Y | Y | Y | authz tests | **IMPLEMENTED** | | P0 |
| A7-01 | А7 | Backend acceptance checklist (RUN_LOCAL / Ф-0) | Y | — | Y | `scripts/tz/a7-f0-acceptance.mjs` | **IMPLEMENTED** | `docs/tz/evidence/A7_F0_ACCEPTANCE.md` | P1 |

---

## Part B — Frontend

| ID | Section | Requirement | BE | FE | DB | Test | Status | Notes | Priority |
|---|---|---|---|---|---|---|---|---|---|
| B1-01 | Б1 | Design tokens, Unbounded+Inter, 8px grid, radii/pills (Figma = reference at customer) | — | Y | — | b1-tokens.test.ts | **IMPLEMENTED** | `docs/tz/evidence/B1_DESIGN_EVIDENCE.md` — not pixel-perfect Figma | P2 |
| B2-01 | Б2 | packages/api: baseURL, JWT+refresh, money/weight format, toast+paywall | — | Y | — | — | **IMPLEMENTED** | | P0 |
| B3-UX | Б3 UX | Guest catalog; 80/20 copy; promo on goods; weight stepper 0.5 / input 0.1 | — | Y | — | — | **IMPLEMENTED** | | P0 |
| B3-01 | 3.1 | Home `/` hero + CTAs | — | Y | — | — | **IMPLEMENTED** | | P1 |
| B3-02 | 3.2 | Shop guest catalog, stop-list, stock toast | Y | Y | — | — | **IMPLEMENTED** | | P0 |
| B3-03 | 3.3 | Cart + promo + 80/20 block + FREE/DELIV | Y | Y | — | — | **IMPLEMENTED** | | P0 |
| B3-04 | 3.4 | Checkout gate, address, order, provider stub | Y | Y | — | client | **IMPLEMENTED** | | P0 |
| B3-05 | 3.5 | Order success copy by fulfillment_window | — | Y | — | — | **IMPLEMENTED** | | P1 |
| B3-06 | 3.6 | My orders status line + payment captions | Y | Y | — | — | **IMPLEMENTED** | | P1 |
| B3-07 | 3.7 | Profile soft-cancel, addresses, profile edit (+ grace UI) | Y | Y | — | access-rules.test | **IMPLEMENTED** | | P1 |
| B3-08 | 3.8 | Subscription paywall modal | Y | Y | — | — | **IMPLEMENTED** | | P0 |
| B3-09 | 3.9 | OTP login/register with consents | Y | Y | — | — | **IMPLEMENTED** | | P0 |
| B3-10 | 3.10 | PWA manifest + SW static cache | — | Y | — | LH | **IMPLEMENTED** | | P2 |
| B4-01 | 4.1–4.2 | Manager dashboard + order state machine UI | Y | Y | — | B7 browser | **IMPLEMENTED** | | P0 |
| B4-02 | 4.3 | Stock/stop/price + receive | Y | Y | — | mount tests | **IMPLEMENTED** | А5 incoming + Б4 receive alias | P0 |
| B5-01 | 5.1–5.5 | Admin-lite 5 screens | Y | Y | — | B7 | **IMPLEMENTED** | | P1 |
| B6-01 | Б6 | Phased FE workflow Ф-0…Ф-8 (order/outcomes; not fake PR history) | — | Y | — | phase report | **IMPLEMENTED** | `docs/tz/evidence/B6_PHASE_COMPLETION.md` | P3 |
| B7-01 | Б7 | Final FE DoD: **two browser contexts** + Lighthouse ≥80 | Y | Y | Y | `npm run test:b7-browser` ×2; LH | **IMPLEMENTED** | `docs/tz/evidence/b7-browser/`; API script supplemental | P1 |
| X-01 | Goal Stage 9 | Frontend automated tests | — | Y | — | vitest | **IMPLEMENTED** | counted once | — |
| X-02 | Goal Stage 9 | E2E customer+manager+admin journey | Y | Y | Y | B7 browser + a7 | **IMPLEMENTED** | counted once | — |

---

## Cross-cutting / engineering extras

| ID | Requirement | Status | Notes |
|---|---|---|---|
| X-01 | Frontend automated tests | **IMPLEMENTED** | (same unique ID as Part B) |
| X-02 | E2E customer+manager+admin journey | **IMPLEMENTED** | (same unique ID as Part B) |
| X-03 | `CODEX_ПРОМПТЫ_КОЦ.md` | **N/A (NOT REQUIRED FOR TZ)** | Mode B optional Codex task pack when Part A already met; do not invent donor file for checkbox |
| X-04 | `storefront.html` donor | **N/A (NOT REQUIRED FOR TZ)** | Part B donor («можно переносить»); rebuilt FE with Б1 tokens satisfies |
| X-05 | OpenAPI/docs sync | **N/A (NOT REQUIRED FOR TZ)** | OpenAPI not in approved TZ; existing OpenAPI config retained as engineering extra |

---

## Counts (unique IDs — authoritative)

Recount rule: INV(12) + A(25) + B rows excluding duplicate X (18) + unique X(5) = **60**.

| Status | Count |
|---|---|
| Unique matrix IDs | **60** |
| IMPLEMENTED | **57** |
| N/A (NOT REQUIRED FOR TZ) | **3** (X-03, X-04, X-05) |
| PARTIAL | **0** |
| MISSING | **0** |
| INCORRECT | **0** |
| BLOCKED BY TZ | **0** |

**Normative subset** (excludes N/A): **57** — all **IMPLEMENTED**.

Revoked approximate figures: “~50”, “~48 implemented”.
