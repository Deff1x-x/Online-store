import type { ApiClient, QueryParams } from "../client";
import type { ApiEntityResponse, ApiListResponse, ApiRecord } from "./shared";

export type CreateOrderPayload = {
  payment_method: string;
  delivery_address_id: string | number;
  items: Array<{ product_id: string | number; quantity: number }>;
  promo_code?: string;
};

export function createOrdersApi(client: ApiClient) {
  return {
    create: <T = ApiRecord>(payload: CreateOrderPayload) =>
      client.post<ApiEntityResponse<T>, CreateOrderPayload>("/orders", payload),
    payOnline: <T = ApiRecord>(id: string | number) => client.post<ApiEntityResponse<T>>(`/orders/${id}/pay-online`),
    validatePromo: <T = ApiRecord, TPayload = ApiRecord>(id: string | number, payload: TPayload) =>
      client.post<ApiEntityResponse<T>, TPayload>(`/orders/${id}/validate-promo`, payload),
    listMy: <T = ApiRecord>(query?: QueryParams) => client.get<ApiListResponse<T>>("/my-orders", { query }),
    getMy: <T = ApiRecord>(id: string | number) => client.get<ApiEntityResponse<T>>(`/my-orders/${id}`),
  };
}
