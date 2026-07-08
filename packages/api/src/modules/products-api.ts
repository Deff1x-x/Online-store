import type { ApiClient } from "../client";
import type { ApiEntityResponse, ApiListResponse, ApiRecord } from "./shared";

export function createProductsApi(client: ApiClient) {
  return {
    getStoreProducts: <T = ApiRecord>(storeId: string | number) =>
      client.get<ApiListResponse<T>>(`/products/store/${storeId}`, { auth: false }),
    createProduct: <T = ApiRecord, TPayload = ApiRecord>(payload: TPayload) =>
      client.post<ApiEntityResponse<T>, TPayload>("/products", payload),
    linkStore: <T = ApiRecord, TPayload = ApiRecord>(payload: TPayload) =>
      client.post<ApiEntityResponse<T>, TPayload>("/products/link-store", payload),
  };
}
