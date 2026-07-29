# A7 / Ф-0 Backend Acceptance Evidence

**Requirement:** `docs/ЕДИНОЕ_ТЗ_КОЦ.md` · **А7** (= гейт **Ф-0**) · Версия 1.0  
**Goal:** KOZ-TZ-FULL-IMPLEMENTATION  
**Date:** 2026-07-29  
**Commit:** not performed  

## Exact TZ criteria (А7 / RUN_LOCAL.md)

Чек-лист: гостевая витрина → OTP-регистрация с согласиями → подписка (дубль 409) → заказ (весовой 1,5 кг + штучный; доставка +500 ниже порога; холд ровно 80%) → остаток списался → pick → actual-weight (partial capture) → in_delivery → delivered (fully_paid + pos_terminal) → отчёт точки (GMV) → отмена нового заказа → остаток вернулся.

## Environment

| Item | Value |
|---|---|
| API | Node `src/server.js` @ `http://127.0.0.1:3000` |
| DB | PostgreSQL with schema + seed (Точка №1, coverage, products, staff) |
| OTP | Development code `1234` |
| Staff | `manager@koz.kz` / `Manager123`; `admin@koz.kz` / `Manager123` |
| Store | `11111111-1111-1111-1111-111111111111` |

## Reproducible command

```bash
node scripts/tz/a7-f0-acceptance.mjs
```

Machine-readable output: `docs/tz/evidence/A7_F0_ACCEPTANCE.json`

Automated items: all А7 checklist steps that are API-observable (guest catalog through report/cancel). Manual packaging is the evidence file itself sent to the product owner (Ф-0 «прислать вывод»).

## Results (executed 2026-07-29)

| ID | Criterion | Expected | Actual | Result |
|---|---|---|---|---|
| A7-1 | Гостевая витрина | 200 + products | PASS | **PASS** |
| A7-2 | OTP-регистрация с согласиями | 201 | PASS | **PASS** |
| A7-3 | Подписка + дубль 409; grace_days=3; placeholder recurrent token | 201 + 409 + payment fields | PASS | **PASS** |
| A7-4 | Заказ 1,5 кг + шт; delivery=500; hold 80% | 201 + formulas | PASS | **PASS** |
| A7-5 | Остаток списался | qty decrease | PASS | **PASS** |
| A7-6 | pick → actual-weight partial capture | capture ≤ hold | PASS | **PASS** |
| A7-7 | delivered → fully_paid | payment_status fully_paid | PASS | **PASS** |
| A7-8 | Отмена → остаток вернулся | qty restore | PASS | **PASS** |
| A7-9 | Отчёт точки | 200 report | PASS | **PASS** |

**Overall:** **PASS** (all criteria)

## Code / tests linkage

- Orders / subscription gate: `src/modules/orders/orders.service.js` (grace +3d); `SubscriptionAccessRules` (.NET)
- Subscription payment placeholder: `src/modules/subscriptions/subscriptions.service.js`
- Integration suites: Net3a/Net3b/Net2b; Api unit `SubscriptionAccessRulesTests`
- Script: `scripts/tz/a7-f0-acceptance.mjs`

## Manual vs automated

А7 is a **manual acceptance procedure** against a running backend. Automation here **executes the same checklist** and records output; it does not replace the procedure with an unrelated unit test.
