import type { ApiClient, QueryParams } from "../client";
import type { ApiEntityResponse, ApiListResponse, ApiRecord } from "./shared";

export function createAdminCatalogApi(client: ApiClient) {
  return {
    getStores: <T = ApiRecord>(query?: QueryParams) => client.get<ApiListResponse<T>>("/admin/catalog/stores", { query }),
    createStore: <T = ApiRecord, TPayload = ApiRecord>(payload: TPayload) =>
      client.post<ApiEntityResponse<T>, TPayload>("/admin/catalog/stores", payload),
    updateStore: <T = ApiRecord, TPayload = ApiRecord>(id: string | number, payload: TPayload) =>
      client.put<ApiEntityResponse<T>, TPayload>(`/admin/catalog/stores/${id}`, payload),
    deleteStore: <T = ApiRecord>(id: string | number) => client.delete<ApiEntityResponse<T>>(`/admin/catalog/stores/${id}`),
    upsertCoverage: <T = ApiRecord, TPayload = ApiRecord>(payload: TPayload) =>
      client.post<ApiEntityResponse<T>, TPayload>("/admin/catalog/coverage", payload),
    getProducts: <T = ApiRecord>(query?: QueryParams) => client.get<ApiListResponse<T>>("/admin/catalog/products", { query }),
    createProduct: <T = ApiRecord, TPayload = ApiRecord>(payload: TPayload) =>
      client.post<ApiEntityResponse<T>, TPayload>("/admin/catalog/products", payload),
    updateProduct: <T = ApiRecord, TPayload = ApiRecord>(id: string | number, payload: TPayload) =>
      client.put<ApiEntityResponse<T>, TPayload>(`/admin/catalog/products/${id}`, payload),
    deleteProduct: <T = ApiRecord>(id: string | number) =>
      client.delete<ApiEntityResponse<T>>(`/admin/catalog/products/${id}`),
    getStoreInventory: <T = ApiRecord>(storeId: string | number, query?: QueryParams) =>
      client.get<ApiListResponse<T>>(`/admin/catalog/stores/${storeId}/inventory`, { query }),
    upsertStoreInventory: <T = ApiRecord, TPayload = ApiRecord>(
      storeId: string | number,
      productId: string | number,
      payload: TPayload,
    ) => client.put<ApiEntityResponse<T>, TPayload>(`/admin/catalog/stores/${storeId}/inventory/${productId}`, payload),
    receiveStoreInventory: <T = ApiRecord>(
      storeId: string | number,
      productId: string | number,
      payload: { quantity: string | number },
    ) =>
      client.post<ApiEntityResponse<T>, { quantity: string | number }>(
        `/admin/catalog/stores/${storeId}/inventory/${productId}/incoming`,
        payload,
      ),
    getPromoCodes: <T = ApiRecord>(query?: QueryParams) =>
      client.get<ApiListResponse<T>>("/admin/catalog/promo-codes", { query }),
    createPromoCode: <T = ApiRecord, TPayload = ApiRecord>(payload: TPayload) =>
      client.post<ApiEntityResponse<T>, TPayload>("/admin/catalog/promo-codes", payload),
    updatePromoCode: <T = ApiRecord, TPayload = ApiRecord>(id: string | number, payload: TPayload) =>
      client.put<ApiEntityResponse<T>, TPayload>(`/admin/catalog/promo-codes/${id}`, payload),
    deletePromoCode: <T = ApiRecord>(id: string | number) =>
      client.delete<ApiEntityResponse<T>>(`/admin/catalog/promo-codes/${id}`),
    getDeliverySettings: <T = ApiRecord>(storeId: string | number) =>
      client.get<ApiEntityResponse<T>>(`/admin/catalog/delivery-settings/${storeId}`),
    upsertDeliverySettings: <T = ApiRecord, TPayload = ApiRecord>(storeId: string | number, payload: TPayload) =>
      client.put<ApiEntityResponse<T>, TPayload>(`/admin/catalog/delivery-settings/${storeId}`, payload),
  };
}
