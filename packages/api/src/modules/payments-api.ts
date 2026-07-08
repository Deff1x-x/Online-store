import type { ApiClient, QueryParams } from "../client";
import type { ApiEntityResponse, ApiListResponse, ApiRecord } from "./shared";

export function createPaymentsApi(client: ApiClient) {
  return {
    list: <T = ApiRecord>(query?: QueryParams) => client.get<ApiListResponse<T>>("/payments", { query }),
    get: <T = ApiRecord>(id: string | number) => client.get<ApiEntityResponse<T>>(`/payments/${id}`),
    payOrderOnline: <T = ApiRecord>(orderId: string | number) =>
      client.post<ApiEntityResponse<T>>(`/payments/orders/${orderId}/pay-online`),
  };
}
