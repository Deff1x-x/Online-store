import type { ApiClient, QueryParams } from "../client";

export type ApiId = string;
export type ApiMoney = string | number;
export type ApiJsonValue = string | number | boolean | null | ApiJsonValue[] | { [key: string]: ApiJsonValue };

export type DeliveryStatus = "new" | "picked" | "in_delivery" | "delivered" | "failed" | "cancelled";
export type OrderPaymentStatus = "pending" | "online_paid" | "fully_paid" | "cancelled";
export type PaymentMethod = "online" | "pos_terminal" | "kaspi";
export type PaymentRecordStatus = "pending" | "completed" | "failed" | "refunded" | "cancelled";
export type SubscriptionStatus = "active" | "paused" | "cancelled" | "expired";
export type BillingPeriod = "monthly" | "yearly";
export type InventoryStatus = "available" | "low_stock" | "out_of_stock";

export type Pagination = {
  page: number;
  limit: number;
  total: number;
};

export type MessageResponse = {
  message: string;
};

export type WithQuery = {
  query?: QueryParams;
};

export type ModuleFactory<TModule> = (client: ApiClient) => TModule;
