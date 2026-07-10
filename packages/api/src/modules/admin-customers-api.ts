import type { ApiClient, QueryParams } from "../client";
import type { ApiEntityResponse, ApiListResponse, ApiRecord } from "./shared";

export type AdminCustomer = {
  id: string;
  user_id: string | null;
  store_id: string;
  name: string | null;
  phone: string;
  email: string | null;
  subscription_status: "active" | "paused" | "cancelled" | "expired";
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  subscription_auto_renew: boolean;
  created_at: string;
  updated_at: string;
  orders_count: number;
};

export type AdminCustomersQuery = {
  page?: number;
  limit?: number;
  store_id?: string;
  subscription_status?: AdminCustomer["subscription_status"];
  search?: string;
};

export type AdminCustomersResponse = {
  customers: AdminCustomer[];
  pagination: { page: number; limit: number; total: number };
};

export type AdminCustomerAddress = {
  id: string;
  customer_id: string;
  store_coverage_id: string;
  entrance: string | null;
  floor: string | null;
  apartment: string | null;
  entrance_code: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  store_id: string;
  coverage_address: string;
  entrance_count: number | null;
};

export type AdminCustomerOrder = {
  id: string;
  order_number: string | null;
  subtotal: string | number;
  discount_total: string | number;
  delivery_fee: string | number;
  online_payment_amount: string | number;
  online_capture_amount: string | number;
  pos_terminal_topup: string | number;
  final_total: string | number;
  delivery_status: string;
  payment_status: string;
  fulfillment_window: string;
  delivery_date: string | null;
  created_at: string;
};

export type AdminCustomerDetails = {
  customer: AdminCustomer;
  addresses: AdminCustomerAddress[];
  recent_orders: AdminCustomerOrder[];
};

export type AdminSubscription = {
  id: string;
  customer_id: string;
  amount: string | number;
  billing_period: string;
  status: string;
  expires_at: string | null;
  next_billing_date: string | null;
  auto_renew: boolean;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminSubscriptionResponse = { subscription: AdminSubscription };

export function createAdminCustomersApi(client: ApiClient) {
  return {
    getCustomers: (query?: AdminCustomersQuery) => client.get<AdminCustomersResponse>("/admin/customers/customers", { query }),
    getCustomer: (id: string | number) => client.get<AdminCustomerDetails>(`/admin/customers/customers/${id}`),
    getSubscriptions: <T = ApiRecord>(query?: QueryParams) =>
      client.get<ApiListResponse<T>>("/admin/customers/subscriptions", { query }),
    renewSubscription: (id: string | number) =>
      client.put<AdminSubscriptionResponse>(`/admin/customers/customers/${id}/subscription/renew`),
    cancelSubscription: (id: string | number) =>
      client.put<AdminSubscriptionResponse>(`/admin/customers/customers/${id}/subscription/cancel`),
    pauseSubscription: (id: string | number) =>
      client.put<AdminSubscriptionResponse>(`/admin/customers/customers/${id}/subscription/pause`),
    getConsentLogs: <T = ApiRecord>(query?: QueryParams) =>
      client.get<ApiListResponse<T>>("/admin/customers/audit-logs/consents", { query }),
    exportCustomers: <T = ApiRecord, TPayload = ApiRecord>(payload?: TPayload) =>
      client.post<ApiEntityResponse<T>, TPayload>("/admin/customers/export/customers", payload),
  };
}
