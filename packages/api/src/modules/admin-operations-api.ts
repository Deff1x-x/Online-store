import type { ApiClient, QueryParams } from "../client";
import type { ApiEntityResponse, ApiListResponse, ApiRecord } from "./shared";

export type AdminOperationsStore = {
  id: string;
  name: string;
  address: string;
  location: string | null;
  operating_hours: string | null;
  delivery_time_min: number | null;
  delivery_time_max: number | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type AdminStoreReportSubscribers = {
  total: number;
  active: number;
};

export type AdminStoreReportOrders = {
  totals: number;
  delivered: number;
  failed: number;
  gmv: string | number;
  online_part: string | number;
  pos_part: string | number;
  avg: string | number;
};

export type AdminStoreReport = {
  store: AdminOperationsStore;
  subscribers: AdminStoreReportSubscribers;
  orders: AdminStoreReportOrders;
};

export type AdminStoreReportResponse = {
  report: AdminStoreReport;
};

export type AdminStoreReportQuery = {
  date_from?: string;
  date_to?: string;
};

export type AdminRevenueAnalytics = {
  store_id: string;
  store_name: string;
  orders_count: number;
  gmv: string | number;
  delivery_fee_total: string | number;
  discount_total: string | number;
  avg_order_value: string | number;
};

export type AdminRevenueResponse = {
  revenue: AdminRevenueAnalytics[];
};

export type AdminDeliveryAnalytics = {
  store_id: string;
  store_name: string;
  totals: number;
  delivered: number;
  failed: number;
  avg_delivery_minutes: string | number;
  next_morning_orders: number;
};

export type AdminDeliveryResponse = {
  delivery: AdminDeliveryAnalytics[];
};

export type AdminAnalyticsQuery = {
  date_from?: string;
  date_to?: string;
};

export type AdminPaymentMethod = "online" | "pos_terminal" | "kaspi";
export type AdminPaymentRecordStatus = "pending" | "completed" | "failed" | "refunded" | "cancelled";

export type AdminPayment = {
  id: string;
  order_id: string;
  method: AdminPaymentMethod;
  amount: string | number;
  status: AdminPaymentRecordStatus;
  provider_payload: unknown;
  created_at: string;
  updated_at: string;
  order_number: string | null;
  store_id: string;
  store_name: string;
  delivery_status: string;
  payment_status: string;
};

export type AdminPaymentsQuery = AdminAnalyticsQuery & {
  page?: number;
  limit?: number;
  store_id?: string;
  method?: AdminPaymentMethod;
  status?: AdminPaymentRecordStatus;
};

export type AdminPaymentsResponse = {
  payments: AdminPayment[];
  pagination: { page: number; limit: number; total: number };
};

export function createAdminOperationsApi(client: ApiClient) {
  return {
    getOrders: <T = ApiRecord>(query?: QueryParams) => client.get<ApiListResponse<T>>("/admin/operations/orders", { query }),
    getOrder: <T = ApiRecord>(id: string | number) => client.get<ApiEntityResponse<T>>(`/admin/operations/orders/${id}`),
    updateOrderStatus: <T = ApiRecord>(id: string | number, payload: { delivery_status: string }) =>
      client.put<ApiEntityResponse<T>, { delivery_status: string }>(`/admin/operations/orders/${id}/status`, payload),
    getPayments: (query?: AdminPaymentsQuery) => client.get<AdminPaymentsResponse>("/admin/operations/payments", { query }),
    getRevenueAnalytics: (query?: AdminAnalyticsQuery) =>
      client.get<AdminRevenueResponse>("/admin/operations/analytics/revenue", { query }),
    getDeliveryAnalytics: (query?: AdminAnalyticsQuery) =>
      client.get<AdminDeliveryResponse>("/admin/operations/analytics/delivery", { query }),
    getStoreReport: (id: string | number, query?: AdminStoreReportQuery) =>
      client.get<AdminStoreReportResponse>(`/admin/operations/stores/${id}/report`, { query }),
    exportOrders: <T = ApiRecord, TPayload = ApiRecord>(payload?: TPayload) =>
      client.post<ApiEntityResponse<T>, TPayload>("/admin/operations/export/orders", payload),
    getPromoCodeUsage: <T = ApiRecord>(id: string | number, query?: QueryParams) =>
      client.get<ApiListResponse<T>>(`/admin/operations/promo-codes/${id}/usage`, { query }),
    getFirstOrderDiscounts: <T = ApiRecord>(query?: QueryParams) =>
      client.get<ApiListResponse<T>>("/admin/operations/first-order-discounts", { query }),
  };
}
