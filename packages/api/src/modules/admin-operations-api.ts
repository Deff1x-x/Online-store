import type { ApiClient, QueryParams } from "../client";
import type { ApiEntityResponse, ApiListResponse, ApiRecord } from "./shared";

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
    getStoreReport: <T = ApiRecord>(id: string | number, query?: QueryParams) =>
      client.get<ApiEntityResponse<T>>(`/admin/operations/stores/${id}/report`, { query }),
    exportOrders: <T = ApiRecord, TPayload = ApiRecord>(payload?: TPayload) =>
      client.post<ApiEntityResponse<T>, TPayload>("/admin/operations/export/orders", payload),
    getPromoCodeUsage: <T = ApiRecord>(id: string | number, query?: QueryParams) =>
      client.get<ApiListResponse<T>>(`/admin/operations/promo-codes/${id}/usage`, { query }),
    getFirstOrderDiscounts: <T = ApiRecord>(query?: QueryParams) =>
      client.get<ApiListResponse<T>>("/admin/operations/first-order-discounts", { query }),
  };
}
