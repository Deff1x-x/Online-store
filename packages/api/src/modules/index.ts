import type { ApiClient } from "../client";
import { createAddressesApi } from "./addresses-api";
import { createAdminCatalogApi } from "./admin-catalog-api";
import { createAdminCustomersApi } from "./admin-customers-api";
import { createAdminOperationsApi } from "./admin-operations-api";
import { createAuthApi } from "./auth-api";
import { createManagerApi } from "./manager-api";
import { createNotificationsApi } from "./notifications-api";
import { createOrdersApi } from "./orders-api";
import { createPaymentsApi } from "./payments-api";
import { createProductsApi } from "./products-api";
import { createProfileApi } from "./profile-api";
import { createPromocodesApi } from "./promocodes-api";
import { createSubscriptionsApi } from "./subscriptions-api";
import { createSystemApi } from "./system-api";

export * from "./addresses-api";
export * from "./admin-catalog-api";
export * from "./admin-customers-api";
export * from "./admin-operations-api";
export * from "./auth-api";
export * from "./manager-api";
export * from "./notifications-api";
export * from "./orders-api";
export * from "./payments-api";
export * from "./products-api";
export * from "./profile-api";
export * from "./promocodes-api";
export * from "./shared";
export * from "./subscriptions-api";
export * from "./system-api";

export function createApiModules(client: ApiClient) {
  return {
    authApi: createAuthApi(client),
    productsApi: createProductsApi(client),
    ordersApi: createOrdersApi(client),
    subscriptionsApi: createSubscriptionsApi(client),
    paymentsApi: createPaymentsApi(client),
    promocodesApi: createPromocodesApi(client),
    profileApi: createProfileApi(client),
    addressesApi: createAddressesApi(client),
    notificationsApi: createNotificationsApi(client),
    managerApi: createManagerApi(client),
    adminCatalogApi: createAdminCatalogApi(client),
    adminCustomersApi: createAdminCustomersApi(client),
    adminOperationsApi: createAdminOperationsApi(client),
    systemApi: createSystemApi(client),
  };
}

export type ApiModules = ReturnType<typeof createApiModules>;
