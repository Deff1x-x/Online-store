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

export function createAdminOperationsApi(client: ApiClient) {
  return {
    getOrders: <T = ApiRecord>(query?: QueryParams) => client.get<ApiListResponse<T>>("/admin/operations/orders", { query }),
    getOrder: <T = ApiRecord>(id: string | number) => client.get<ApiEntityResponse<T>>(`/admin/operations/orders/${id}`),
    updateOrderStatus: <T = ApiRecord>(id: string | number, payload: { delivery_status: string }) =>
      client.put<ApiEntityResponse<T>, { delivery_status: string }>(`/admin/operations/orders/${id}/status`, payload),
    getPayments: <T = ApiRecord>(query?: QueryParams) => client.get<ApiListResponse<T>>("/admin/operations/payments", { query }),
    getRevenueAnalytics: <T = ApiRecord>(query?: QueryParams) =>
      client.get<ApiEntityResponse<T>>("/admin/operations/analytics/revenue", { query }),
    getDeliveryAnalytics: <T = ApiRecord>(query?: QueryParams) =>
      client.get<ApiEntityResponse<T>>("/admin/operations/analytics/delivery", { query }),
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
