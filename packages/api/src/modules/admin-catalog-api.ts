import type { ApiClient, QueryParams } from "../client";
import type { ApiEntityResponse, ApiListResponse, ApiRecord } from "./shared";

export type AdminDeliverySettings = {
  id: string;
  store_id: string;
  min_order_value_for_free_delivery: string | number;
  delivery_fee: string | number;
  ordering_open_hour: number;
  ordering_close_hour: number;
  created_at: string;
  updated_at: string;
};

export type AdminStore = {
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
  delivery_settings: AdminDeliverySettings | null;
  coverage_count: number;
  subscribers_count: number;
};

export type AdminStoresResponse = {
  stores: AdminStore[];
};

export function createAdminCatalogApi(client: ApiClient) {
  return {
    getStores: (query?: QueryParams) => client.get<AdminStoresResponse>("/admin/catalog/stores", { query }),
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
