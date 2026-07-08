import type { ApiClient, QueryParams } from "../client";
import type { ApiEntityResponse, ApiListResponse, ApiRecord } from "./shared";

export function createSubscriptionsApi(client: ApiClient) {
  return {
    list: <T = ApiRecord>(query?: QueryParams) => client.get<ApiListResponse<T>>("/subscriptions", { query }),
    create: <T = ApiRecord, TPayload = ApiRecord>(payload?: TPayload) =>
      client.post<ApiEntityResponse<T>, TPayload>("/subscriptions", payload),
    renew: <T = ApiRecord>(customerId: string | number) =>
      client.post<ApiEntityResponse<T>>(`/subscriptions/${customerId}/renew`),
    cancel: <T = ApiRecord>(customerId: string | number, payload?: { immediate?: boolean }) =>
      client.post<ApiEntityResponse<T>, { immediate?: boolean }>(`/subscriptions/${customerId}/cancel`, payload),
  };
}
