import type { ApiClient } from "../client";
import type { ApiId, ApiMoney, BillingPeriod, SubscriptionStatus } from "./shared";

export type Subscription = {
  id: ApiId;
  customer_id: ApiId;
  amount: ApiMoney;
  billing_period: BillingPeriod;
  status: SubscriptionStatus;
  expires_at: string | null;
  next_billing_date: string | null;
  auto_renew: boolean;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  customer_name?: string | null;
  customer_phone?: string;
  customer_email?: string | null;
  store_id?: ApiId;
};

export type SubscriptionsResponse = { subscriptions: Subscription[] };
export type SubscriptionResponse = { subscription: Subscription };
export type CreateSubscriptionPayload = { billing_period?: BillingPeriod; amount?: number };
export type SubscriptionPayment = { amount: number; status: "pending_provider_confirmation"; grace_days: number; note: string };
export type CreateSubscriptionResponse = SubscriptionResponse & { payment: SubscriptionPayment };
export type SubscriptionsQuery = { store_id?: ApiId; status?: SubscriptionStatus };

export function createSubscriptionsApi(client: ApiClient) {
  return {
    list: (query?: SubscriptionsQuery) => client.get<SubscriptionsResponse>("/subscriptions", { query }),
    create: (payload: CreateSubscriptionPayload, options: { suppressErrorNotification?: boolean } = {}) =>
      client.post<CreateSubscriptionResponse, CreateSubscriptionPayload>("/subscriptions", payload, options),
    renew: (customerId: ApiId) => client.post<SubscriptionResponse>(`/subscriptions/${customerId}/renew`),
    cancel: (customerId: ApiId, payload: { immediate?: boolean }) =>
      client.post<SubscriptionResponse, { immediate?: boolean }>(`/subscriptions/${customerId}/cancel`, payload),
  };
}
