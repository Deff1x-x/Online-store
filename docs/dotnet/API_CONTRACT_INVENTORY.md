# API contract inventory (NET-0)

Дата инвентаризации: 2026-07-11. Источник истины на этом этапе — фактически смонтированные вызовы `app.use` и `app.get` из `src/app.js`, а не одноимённые legacy-файлы. Найдено **74 endpoint'а**: 15 route-prefix mounts и `/api/health`.

| Module | Mounted endpoints |
|---|---:|
| System / Health | 1 |
| Auth | 5 |
| Products | 3 |
| Profile | 2 |
| Addresses | 3 |
| Subscriptions | 4 |
| Promocodes | 3 |
| Orders / My Orders | 3 |
| Payments | 3 |
| Manager | 8 |
| Admin Catalog | 18 |
| Admin Customers | 8 |
| Admin Operations | 10 |
| Notifications | 2 |
| Kaspi Webhook | 1 |
| **Total** | **74** |

## Общие правила, подтверждённые Node

- Ошибка `AppError`: `{ "message": string, "code": string }`; unhandled ошибка: `{ "message":"Internal server error", "code":"internal_error" }`. Неизвестный URL: `404 {message:"Route not found",code:"route_not_found"}` (`src/middleware/errorHandler.js`, `src/app.js`).
- Auth — `Authorization: Bearer <JWT>`; отсутствует токен: `401 token_required`, неверная схема: `401 invalid_authorization_header`, недействительный токен: `403 invalid_token`, роль: `403 access_denied`. Роли: `customer`, `store_operator`, `admin_catalog`, `admin_operations`, `admin_customers` (`src/middleware/auth.js`, `src/utils/roles.js`).
- В таблицах `—` означает, что query/body отсутствует. `id`, `store_id`, `customerId`, `product_id` в URL — строки UUID, если TypeScript-потребитель не допускает также number. Все прочие error status — только те, которые выдаёт проверка конкретного Node service; набор и текст нужно сохранять при переносе и покрыть contract tests.
- Общие enum: `DeliveryStatus = new|picked|in_delivery|delivered|failed|cancelled`; `OrderPaymentStatus = pending|online_paid|fully_paid|cancelled`; `PaymentMethod = online|pos_terminal|kaspi`; `PaymentRecordStatus = pending|completed|failed|refunded|cancelled`; `SubscriptionStatus = active|paused|cancelled|expired`; `InventoryStatus = available|low_stock|out_of_stock`; `BillingPeriod = monthly|yearly` (`packages/api/src/modules/shared.ts`).
- Типы с точным набором полей, nullability и enum находятся в названном файле `packages/api/src/modules/*-api.ts`. Для endpoint'ов без TypeScript-типа в колонке DTO явно указано `untyped`: форма ответа не выдумывается и должна быть зафиксирована до реализации модуля.

## System / Health

| Method, URL | Auth / roles | Query, request DTO | Response DTO; nullable / enum; status | Node implementation | Consumer | Priority |
|---|---|---|---|---|---|---|
| GET `/api/health` | no | — | `{status:"ok",service:"koz-backend",timestamp:ISO-8601}`; no nullable; **200** | inline `src/app.js` | `system-api.ts:HealthResponse` | NET-0 |

## Auth

| Method, URL | Auth / roles | Query, request DTO | Response DTO; nullable / enum; status | Node implementation | Consumer | Priority |
|---|---|---|---|---|---|---|
| POST `/api/auth/otp` | no | `{phone:string}` | `OtpResponse {message,expires_in_seconds}`; **200** | `auth.controller/service/repository` | `auth-api.ts` | **NET-1 implemented; Node↔.NET parity test** |
| POST `/api/auth/register` | no | `{phone,code,name,store_id,privacy_policy,terms_of_service}` | `CustomerAuthResponse`; `user.phone/email/name/store_id/customer_id` nullable/optional as declared; role enum; **201** | same | `auth-api.ts` | **NET-1 implemented; Node↔.NET parity test** |
| POST `/api/auth/login` | no | `CustomerLoginPayload` (`auth-manager.ts`) | `CustomerAuthResponse` incl. `refresh_token`; **200** | same | `auth-api.ts` | **NET-1 implemented; Node↔.NET parity test** |
| POST `/api/auth/staff/login` | no | `StaffLoginPayload` (`auth-manager.ts`) | `StaffAuthResponse`; `email/name/store_id` nullable/optional; staff role enum; **200** | same | `auth-api.ts` | **NET-1 implemented; Node↔.NET parity test** |
| POST `/api/auth/refresh` | no | `{refresh_token:string}` | `CustomerAuthResponse`; **200** | same | `auth-api.ts` | **NET-1 implemented; Node↔.NET parity test** |

## Products, profile, addresses and subscriptions

| Method, URL | Auth / roles | Query, request DTO | Response DTO; nullable / enum; status | Node implementation | Consumer | Priority |
|---|---|---|---|---|---|---|
| GET `/api/products/store/:store_id` | no | — | `StoreCatalogResponse {products:StoreCatalogProduct[]}`; `selling_price:null`; category/unit/inventory-status enum; **200** | `products.controller/service/repository` | `products-api.ts` | **NET-2A implemented; Node↔.NET parity test** |
| POST `/api/products` | JWT `admin_catalog` | `ProductPayload` | `ProductResponse {product:Product}`; category/unit enum; **201** | same | `products-api.ts` | NET-8 |
| POST `/api/products/link-store` | JWT `admin_catalog` | `{store_id,product_id,quantity,selling_price?:number|null}` | `StoreInventoryResponse`; `selling_price`, `last_delivery_date` nullable; inventory-status enum; **200/201** (service chooses) | same | `products-api.ts` | NET-8 |
| GET `/api/my-profile` | JWT `customer` | — | `ProfileResponse`; user name/email and subscription dates nullable; subscription-status enum; **200** | `my-profile.controller/service/repository` | `profile-api.ts` | **NET-2A implemented; Node↔.NET parity test** |
| PUT `/api/my-profile` | JWT `customer` | `{name?:string|null,email?:string|null}` | `ProfileResponse`; same nullability; **200** | same | `profile-api.ts` | NET-4 |
| GET `/api/my-addresses` | JWT `customer` | — | `AddressesResponse`; entrance/floor/apartment/entrance_code/entrance_count nullable; **200** | `my-addresses.controller/service/repository` | `addresses-api.ts` | **NET-2A implemented; Node↔.NET parity test** |
| POST `/api/my-addresses` | JWT `customer` | `{store_coverage_id,entrance?,floor?,apartment?,entrance_code?,is_default?}` | `AddressResponse {message,address}`; address nullable fields above; **201** | same | `addresses-api.ts` | NET-4 |
| DELETE `/api/my-addresses/:id` | JWT `customer` | — | `MessageResponse {message}`; **200** | same | `addresses-api.ts` | NET-4 |
| GET `/api/subscriptions` | JWT `admin_catalog|admin_operations|admin_customers` | `store_id?`, `status?:SubscriptionStatus` | `SubscriptionsResponse`; `expires_at,next_billing_date,cancelled_at,customer_name,customer_email` nullable; **200** | `subscriptions.controller/service/repository` | `subscriptions-api.ts` | **NET-2B implemented; Node↔.NET contract test** |
| POST `/api/subscriptions` | JWT `customer` | `{billing_period?:BillingPeriod,amount?:number}` | `CreateSubscriptionResponse`; `payment.status="pending_provider_confirmation"`; **201** | same | `subscriptions-api.ts` | **NET-2B implemented; Node↔.NET contract test** |
| POST `/api/subscriptions/:customerId/renew` | JWT `admin_customers` | — | `SubscriptionResponse`; nullable fields as above; **200** | same | `subscriptions-api.ts` | **NET-2B implemented; Node↔.NET contract test** |
| POST `/api/subscriptions/:customerId/cancel` | JWT authenticated (route has **no role middleware**) | `{immediate?:boolean}` | `SubscriptionResponse`; **200** | same | `subscriptions-api.ts` | **NET-2B implemented; Node↔.NET contract test** |

## Promocodes, orders and payments

| Method, URL | Auth / roles | Query, request DTO | Response DTO; nullable / enum; status | Node implementation | Consumer | Priority |
|---|---|---|---|---|---|---|
| POST `/api/promocodes/validate` | JWT `customer` | `{promo_code:string,order_total:number}` | `{is_valid:boolean,discount_amount:number,error_message:string|null}`; **200** | `promocodes.controller/service/repository` | `promocodes-api.ts` | **NET-2B implemented; Node↔.NET contract test** |
| GET `/api/promocodes` | JWT `admin_catalog` | `store_id?` | `PromoCodesResponse`; `store_id,max_uses,valid_from,valid_until` nullable; discount enum; **200** | same | `promocodes-api.ts` | NET-8 |
| POST `/api/promocodes` | JWT `admin_catalog` | `CreatePromoCodePayload` | `PromoCodeResponse`; same nullability/enum; **201** | same | `promocodes-api.ts` | NET-8 |
| POST `/api/orders` | JWT `customer` | `CreateOrderPayload {payment_method:"online",delivery_address_id,items:[{product_id,quantity}],promo_code?}` | `CreateOrderResponse`; order number, address, weights, delivery values nullable as in `CustomerOrder`; delivery/payment enum; **201** | `orders.controller/service/repository`, `first-order-discounts.*`, `delivery-settings.*`, `promo-codes.*` | `orders-api.ts` | NET-5 |
| GET `/api/my-orders` | JWT `customer` | — | `{orders:[{id,order_number,subtotal,discount_total,delivery_fee,online_payment_amount,online_capture_amount,pos_terminal_topup,final_total,status,delivery_status,payment_status,fulfillment_window,delivery_date,created_at}]}`; **200**, `created_at DESC` | `orders.controller/service/repository` | `orders-api.ts` | **NET-3C implemented** |
| GET `/api/my-orders/:id` | JWT `customer` | path UUID | `{order: orders.* + items:[{product_id,name,quantity,price_per_unit,line_total,estimated_weight}]}`; **200**, items `name ASC`; missing/foreign **404** `order_not_found` | same | `orders-api.ts` | **NET-3C implemented** |
| GET `/api/payments` | JWT `admin_operations` | `method?:PaymentMethod,status?:PaymentRecordStatus` | `PaymentsResponse`; `order_number:null`, `provider_payload:JSON`; **200** | `payments.controller/service/repository` | `payments-api.ts` | NET-7 |
| GET `/api/payments/:id` | JWT `admin_operations` | — | `PaymentResponse`; same nullability/enum; **200** | same | `payments-api.ts` | NET-7 |
| POST `/api/payments/orders/:orderId/pay-online` | JWT `customer` | — | `OnlinePaymentResponse`; `PaymentResponse + payment_url + qr`; **service-selected 200/201** | same | `payments-api.ts` | NET-5 |

## Manager and notifications

| Method, URL | Auth / roles | Query, request DTO | Response DTO; nullable / enum; status | Node implementation | Consumer | Priority |
|---|---|---|---|---|---|---|
| GET `/api/my-store/orders` | JWT `store_operator` | `status?:DeliveryStatus` | `ManagerOrdersResponse`; nullable order/address/weight fields; delivery/payment enum; **200** | `my-store.controller/service/repository` | `manager-api.ts` | NET-6 |
| PUT `/api/my-store/orders/:id/pick` | JWT `store_operator` | — | `{order:ManagerOrder}`; same nullability/enum; **200** | same | `manager-api.ts` | NET-6 |
| PUT `/api/my-store/orders/:id/actual-weight` | JWT `store_operator` | `{actual_weight:number}` | `{order:ManagerOrder}`; **200** | same | `manager-api.ts` | NET-6 |
| PUT `/api/my-store/orders/:id/status` | JWT `store_operator` | `{delivery_status:DeliveryStatus}` | `{order:ManagerOrder}`; **200** | same | `manager-api.ts` | NET-6 |
| GET `/api/my-store/inventory` | JWT `store_operator` | — | `ManagerInventoryResponse`; `selling_price,last_delivery_date` nullable; inventory enum; **200** | same | `manager-api.ts` | NET-4A implemented |
| PUT `/api/my-store/inventory/:product_id` | JWT `store_operator` | `{is_visible?:boolean,selling_price?:number|null,quantity?:number}` | `{inventory:ManagerInventoryItem}`; nullable fields above; **200** | same | `manager-api.ts` | NET-4A implemented |
| POST `/api/my-store/inventory/:product_id/incoming` | JWT `store_operator` | `{quantity:number}` | `{inventory:ManagerInventoryItem}`; **200** | same | `manager-api.ts` | NET-4A implemented |
| GET `/api/my-store/analytics` | JWT `store_operator` | `date_from?`, `date_to?` | `ManagerAnalyticsResponse`; funnel keys are `DeliveryStatus`; **200** | same | `manager-api.ts` | NET-4A implemented |
| POST `/api/notifications/sms` | JWT `admin_operations` | `{recipient,template_key?,payload?}` | `NotificationResponse`; `template_key,last_error,sent_at` nullable; channel/status enum; **202** | `notifications.controller/service/repository` | `notifications-api.ts` | NET-9 |
| POST `/api/notifications/email` | JWT `admin_operations` | same | `NotificationResponse`; same nullable/enum; **202** | same | `notifications-api.ts` | NET-9 |

## Admin catalog (all require JWT `admin_catalog`)

Implementation for every row: `admin-catalog.controller.js` → `admin-catalog.service.js` → `admin-catalog.repository.js`; consumer: `packages/api/src/modules/admin-catalog-api.ts`; priority NET-8. DTO aliases named below are exact aliases in that consumer; nullable/enum fields remain those declared there. Explicit controller status is service-returned for this module, therefore each row must receive captured status tests before migration.

| Method, URL | Query / request DTO | Response DTO, nullable / enum | Status |
|---|---|---|---|
| GET `/api/admin/catalog/stores` | — | `AdminStoresResponse` (store location/operating hours/delivery fields as typed) | service-selected |
| POST `/api/admin/catalog/stores` | `AdminStorePayload` | `AdminStoreResponse` | service-selected |
| PUT `/api/admin/catalog/stores/:id` | `Partial<AdminStorePayload>` | `AdminStoreResponse` | service-selected |
| DELETE `/api/admin/catalog/stores/:id` | — | `AdminStoreResponse` | service-selected |
| POST `/api/admin/catalog/coverage` | `AdminCoveragePayload {store_id,address,entrance_count?}` | `AdminCoverageResponse` | service-selected |
| GET `/api/admin/catalog/products` | — | `AdminProductsResponse` (category/unit enum) | service-selected |
| POST `/api/admin/catalog/products` | `AdminProductCreatePayload` | `AdminProductResponse` | service-selected |
| PUT `/api/admin/catalog/products/:id` | `AdminProductUpdatePayload` | `AdminProductResponse` | service-selected |
| DELETE `/api/admin/catalog/products/:id` | — | `AdminProductResponse` | service-selected |
| GET `/api/admin/catalog/stores/:id/inventory` | — | `AdminStoreInventoryResponse`; selling price/date nullable, inventory enum | service-selected |
| PUT `/api/admin/catalog/stores/:id/inventory/:product_id` | `AdminStoreInventoryPayload` | `AdminStoreInventoryResponseItem` | service-selected |
| POST `/api/admin/catalog/stores/:id/inventory/:product_id/incoming` | `AdminInventoryIncomingPayload {quantity}` | `AdminInventoryResponse` | service-selected |
| GET `/api/admin/catalog/promo-codes` | — | `AdminPromocodesResponse`; promo nullable fields, discount enum | service-selected |
| POST `/api/admin/catalog/promo-codes` | `AdminPromocodeCreatePayload` | `AdminPromocodeResponse` | service-selected |
| PUT `/api/admin/catalog/promo-codes/:id` | `AdminPromocodeUpdatePayload` | `AdminPromocodeResponse` | service-selected |
| DELETE `/api/admin/catalog/promo-codes/:id` | — | `AdminPromocodeResponse` | service-selected |
| GET `/api/admin/catalog/delivery-settings/:store_id` | — | `AdminDeliverySettingsResponse` | service-selected |
| PUT `/api/admin/catalog/delivery-settings/:store_id` | `AdminDeliverySettingsPayload` | `AdminDeliverySettingsResponse` | service-selected |

## Admin customers (all require JWT `admin_customers`)

Implementation: `admin-customers.controller.js` → `admin-customers.service.js` → `admin-customers.repository.js`; consumer: `admin-customers-api.ts`; controller always responds **200**. DTO aliases include declared nullable subscription/customer fields and `SubscriptionStatus` enum. Priority NET-7.

| Method, URL | Query / request DTO | Response DTO |
|---|---|---|
| GET `/api/admin/customers/customers` | `AdminCustomersQuery` | `AdminCustomersResponse` |
| GET `/api/admin/customers/customers/:id` | — | `AdminCustomerDetails` |
| GET `/api/admin/customers/subscriptions` | `AdminSubscriptionsQuery` | `AdminSubscriptionsResponse` |
| PUT `/api/admin/customers/customers/:id/subscription/renew` | — | `AdminSubscriptionResponse` |
| PUT `/api/admin/customers/customers/:id/subscription/cancel` | `{immediate?:boolean}` | `AdminSubscriptionResponse` |
| PUT `/api/admin/customers/customers/:id/subscription/pause` | — | `AdminSubscriptionResponse` |
| GET `/api/admin/customers/audit-logs/consents` | — | `ConsentLogsResponse` |
| POST `/api/admin/customers/export/customers` | export query from consumer | `CustomerExportResponse` |

## Admin operations (all require JWT `admin_operations`)

Implementation: `admin-operations.controller.js` → `admin-operations.service.js` → `admin-operations.repository.js`; consumer: `admin-operations-api.ts`; controller always responds **200**. DTO aliases contain the consumer-declared nullable customer/order/payment fields and common enum. Priority NET-7.

| Method, URL | Query / request DTO | Response DTO |
|---|---|---|
| GET `/api/admin/operations/orders` | `AdminOperationsOrdersQuery` | `AdminOperationsOrdersResponse` |
| GET `/api/admin/operations/orders/:id` | — | `AdminOrderDetailsResponse` |
| PUT `/api/admin/operations/orders/:id/status` | `{delivery_status:DeliveryStatus}` | `{order:AdminOrderRecord}` |
| GET `/api/admin/operations/payments` | `AdminPaymentsQuery` | `AdminPaymentsResponse` |
| GET `/api/admin/operations/analytics/revenue` | consumer query | `AdminRevenueResponse` |
| GET `/api/admin/operations/analytics/delivery` | consumer query | `AdminDeliveryResponse` |
| GET `/api/admin/operations/stores/:id/report` | consumer query | `AdminStoreReportResponse` |
| POST `/api/admin/operations/export/orders` | export query | `OrdersExportResponse` |
| GET `/api/admin/operations/promo-codes/:id/usage` | — | `PromoCodeUsageResponse` |
| GET `/api/admin/operations/first-order-discounts` | — | `FirstOrderDiscountsResponse` |

## Kaspi webhook

| Method, URL | Auth / roles | Query, request DTO | Response DTO; status | Node implementation | Consumer | Priority |
|---|---|---|---|---|---|---|
| POST `/api/webhooks/kaspi` | no JWT; production guard | `{payment_id,transaction_id,...}` — only these two fields are read by service; remaining provider payload is untyped | service result; **200** in non-production; `503 {message,code:"kaspi_webhook_disabled"}` in production | `kaspi.routes/controller/service/repository` | no `packages/api` consumer | NET-10 |

## Recorded discrepancies / follow-up captures (do not fix in NET-0)

1. `packages/api` has no separate typed contract for the Kaspi provider payload; it must be supplied by provider integration before NET-10.
2. `POST /api/subscriptions/:customerId/cancel` authenticates a JWT but has no `authorizeRoles` middleware, despite the typed consumer modelling a customer action. Preserve this behaviour until an approved contract change.
3. Admin catalog controller delegates its HTTP status to service `{status,body}`; the consumer types do not encode each status. Capture success/error status per endpoint before NET-8 instead of guessing.
4. Unmounted files are intentionally excluded: `catalog.routes.js`, `customers.routes.js`, `operations.routes.js`, `order.routes.js`, `operator.routes.js`, `product.routes.js`, `store.routes.js` and legacy middleware variants are not contracts because `src/app.js` does not mount them.

## NET-3A: mounted order creation

## NET-4B: Admin Catalog (implemented and parity-tested)

All routes below are the 18 routes mounted by `src/app.js` through `admin-catalog.routes.js`; every route requires a JWT with exactly the `admin_catalog` role.  The .NET implementation is `AdminCatalogController` -> `AdminCatalogService` -> `PostgresAdminCatalogRepository`.  It preserves Node wrappers, PostgreSQL numeric-as-string serialization, UTC timestamps, sorting, upserts and soft-deletes.

| Method, URL | Request / response wrapper | Node side effect | .NET status |
|---|---|---|---|
| GET `/api/admin/catalog/stores` | `{stores}` | newest-first stores, settings/counts joined | implemented |
| POST `/api/admin/catalog/stores` | store payload -> **201** `{store}` | store plus default delivery settings in one transaction | implemented |
| PUT / DELETE `/api/admin/catalog/stores/:id` | partial store -> `{store}` | update / `status=inactive` soft-delete | implemented |
| POST `/api/admin/catalog/coverage` | `{store_id,address,entrance_count?}` -> `{coverage}` | `(store_id,address)` upsert; 201 insert, 200 update | implemented |
| GET `/api/admin/catalog/products` | `{products}` | newest-first products | implemented |
| POST / PUT / DELETE `/api/admin/catalog/products[/:id]` | product -> `{product}` | create/update / `is_active=false` soft-delete | implemented |
| GET `/api/admin/catalog/stores/:id/inventory` | `{inventory}` | category/name order; nullable local price/date | implemented |
| PUT `/api/admin/catalog/stores/:id/inventory/:product_id` | inventory payload -> `{inventory}` | `(store_id,product_id)` upsert, quantity-derived status | implemented |
| POST `/api/admin/catalog/stores/:id/inventory/:product_id/incoming` | `{quantity}` -> `{inventory}` | atomic stock increment and receipt date | implemented |
| GET `/api/admin/catalog/promo-codes` | `{promo_codes}` | newest-first promotions | implemented |
| POST / PUT / DELETE `/api/admin/catalog/promo-codes[/:id]` | promo -> `{promo_code}` | uppercase code create/update / `is_active=false` soft-disable | implemented |
| GET / PUT `/api/admin/catalog/delivery-settings/:store_id` | settings -> `{delivery_settings}` | read / store-keyed settings upsert | implemented |

Contract failures retain Node's `{message,code}` shape, including `invalid_reference`, duplicate promo `duplicate_entity`, validation codes, and resource-not-found codes.  Real Task.WhenAll/barrier tests cover duplicate store/promo creation, coverage upsert and inventory mutation across five runs.

| Method, URL | Auth | Request | Exact response / side effects | Implementation | Status |
|---|---|---|---|---|---|
| POST `/api/orders` | JWT `customer` only | `{payment_method:"online",delivery_address_id:UUID,items:[{product_id:UUID,quantity:number}],promo_code?:string}` | **201** `{order_id,order_number,breakdown,payment_options,order}`. `breakdown` and payment amounts are JSON numbers; persisted `order` and `order.items` numeric columns are JSON strings, as returned by Node `pg`. Reserves `store_inventory`, inserts `orders`, `order_items`, status history, and only the winning first-order *or* promo discount. It does **not** insert `payments`. | `orders.routes.js` → `orders.controller.js` → `orders.service.js` → `orders.repository.js`; .NET `OrdersController` → `OrderService` → `PostgresOrderRepository` | NET-3A |

The calculation order is Node-defined: per-line effective store price, rounded subtotal, choose the larger of first-order and promo discounts (first-order wins ties), delivery fee from pre-discount subtotal, final total, then 80% preauth and POS remainder. The fulfillment time is the Node fixed UTC+5/Almaty flow: `same_day` inside `[open,close)`, otherwise `next_morning` with `morning_from_11:00`.

## NET-3B: mounted manager order processing

| Method, URL | Auth | Request | Exact Node side effects | .NET status |
|---|---|---|---|---|
| GET `/api/my-store/orders` | JWT `store_operator`; JWT `store_id` scope | `status?` from the six `delivery_status` values | `{orders}`; each list record has JSONB-canonical `delivery_address` and ordered `items` (`p.name`), including Node numeric JSON types | implemented |
| PUT `/api/my-store/orders/:id/pick` | same | no body | locked `new → picked`, `order_status_history` insert | implemented |
| PUT `/api/my-store/orders/:id/actual-weight` | same | `{actual_weight}` | locked `picked` order; Node's order-level recalculation only: `subtotal * actual/estimated`, discount, delivery, capture and POS fields; no payment row | implemented |
| PUT `/api/my-store/orders/:id/status` | same | `{delivery_status}` | Node transition graph: `new→picked/failed/cancelled`, `picked→in_delivery/failed/cancelled`, `in_delivery→delivered/failed`; failure/cancellation returns item inventory; delivery writes a POS `payments` row only when top-up is positive | implemented |

All four NET-3B routes retain the Node `{ message, code }` error shape. The repository scopes every locked order by the JWT store, uses one transaction for each mutation, and does not accept a store id or financial totals from the client.
