# A3-05 Subscription Grace / Recurrent Evidence

**TZ А3 (quote):** «POST активирует сразу (первый платёж подтверждает вебхук провайдера, grace 3 дня; рекуррент — токеном у провайдера); повторная активная → 409; отмена по умолчанию МЯГКАЯ …; пауза (админом) блокирует заказы.»

**Provider API:** not invented. Until acquiring contract, placeholder adapter only (allowed by А5 pay-online / webhook placeholders and Б3.4 stub).

## Domain behavior implemented

| Rule | Implementation |
|---|---|
| Grace 3 days | `SubscriptionAccessRules.GraceDays = 3`; Node `orders.service.js` end+3 |
| Access during grace | Orders allowed while `status=active` and `today ≤ end+3` |
| Access after grace | Denied → `403 subscription_required` |
| Soft cancel | `auto_renew=false`, access until period end (existing) |
| Pause | Non-active status blocks orders |
| Duplicate active | 409 (existing Net2b) |
| Recurrent token (placeholder) | `provider=kaspi_placeholder`, `provider_token=placeholder-recurring:{customerId}` on create payment payload |
| First charge | `pending_provider_confirmation` + note about webhook |

## FE

Profile shows «Льготный период (3 дня)» when `isSubscriptionInGracePeriod` is true (`apps/client/src/pages/ProfilePage.tsx`).

## Tests

- `backend-dotnet/tests/Koz.Api.Tests/SubscriptionAccessRulesTests.cs`
- `apps/client/src/subscription/access-rules.test.ts`
- A7 script asserts `grace_days=3` + placeholder token on POST /subscriptions
