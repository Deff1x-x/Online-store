import type { ApiClient, QueryParams } from "../client";
import type { ApiEntityResponse, ApiListResponse, ApiRecord } from "./shared";

export function createManagerApi(client: ApiClient) {
  return {
    getOrders: <T = ApiRecord>(query?: QueryParams) => client.get<ApiListResponse<T>>("/my-store/orders", { query }),
    pickOrder: <T = ApiRecord>(id: string | number) => client.put<ApiEntityResponse<T>>(`/my-store/orders/${id}/pick`),
    updateOrderStatus: <T = ApiRecord>(id: string | number, payload: { delivery_status: string }) =>
      client.put<ApiEntityResponse<T>, { delivery_status: string }>(`/my-store/orders/${id}/status`, payload),
    recordActualWeight: <T = ApiRecord>(id: string | number, payload: { actual_weight: string | number }) =>
      client.put<ApiEntityResponse<T>, { actual_weight: string | number }>(
        `/my-store/orders/${id}/actual-weight`,
        payload,
      ),
    getInventory: <T = ApiRecord>(query?: QueryParams) => client.get<ApiListResponse<T>>("/my-store/inventory", { query }),
    updateInventory: <T = ApiRecord, TPayload = ApiRecord>(productId: string | number, payload: TPayload) =>
      client.put<ApiEntityResponse<T>, TPayload>(`/my-store/inventory/${productId}`, payload),
    receiveInventory: <T = ApiRecord>(productId: string | number, payload: { quantity: string | number }) =>
      client.post<ApiEntityResponse<T>, { quantity: string | number }>(`/my-store/inventory/${productId}/incoming`, payload),
    getAnalytics: <T = ApiRecord>() => client.get<ApiEntityResponse<T>>("/my-store/analytics"),
  };
}
