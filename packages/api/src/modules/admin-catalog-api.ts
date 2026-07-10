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

export type AdminProductCategory = "vegetables" | "fruits" | "dairy" | "meat" | "bakery" | "other";
export type AdminProductUnit = "kg" | "pcs" | "l";

export type AdminProduct = {
  id: string;
  name: string;
  category: AdminProductCategory;
  unit: AdminProductUnit;
  price_per_unit: string | number;
  company_price: string | number;
  is_weighted: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminProductsResponse = {
  products: AdminProduct[];
};

export type AdminProductResponse = {
  product: AdminProduct;
};

export type AdminProductCreatePayload = {
  name: string;
  category: AdminProductCategory;
  unit: AdminProductUnit;
  price_per_unit: number;
  company_price: number;
  is_weighted: boolean;
};

export type AdminProductUpdatePayload = Partial<AdminProductCreatePayload> & {
  is_active?: boolean;
};

export type AdminStoreInventory = {
  id: string;
  store_id: string;
  product_id: string;
  name: string;
  category: AdminProductCategory;
  unit: AdminProductUnit;
  is_weighted: boolean;
  price_per_unit: string | number;
  company_price: string | number;
  selling_price: string | number | null;
  effective_price: string | number;
  quantity: string | number;
  stock_quantity: number;
  is_visible: boolean;
  status: string;
  last_delivery_date: string | null;
};

export type AdminStoreInventoryResponse = {
  inventory: AdminStoreInventory[];
};

export type AdminStoreInventoryResponseItem = {
  inventory: AdminStoreInventory;
};

export type AdminStoreInventoryPayload = {
  selling_price: number | null;
  quantity: number;
  is_visible: boolean;
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
    getProducts: (query?: QueryParams) => client.get<AdminProductsResponse>("/admin/catalog/products", { query }),
    createProduct: (payload: AdminProductCreatePayload) =>
      client.post<AdminProductResponse, AdminProductCreatePayload>("/admin/catalog/products", payload),
    updateProduct: (id: string | number, payload: AdminProductUpdatePayload) =>
      client.put<AdminProductResponse, AdminProductUpdatePayload>(`/admin/catalog/products/${id}`, payload),
    deleteProduct: (id: string | number) =>
      client.delete<AdminProductResponse>(`/admin/catalog/products/${id}`),
    getStoreInventory: (storeId: string | number, query?: QueryParams) =>
      client.get<AdminStoreInventoryResponse>(`/admin/catalog/stores/${storeId}/inventory`, { query }),
    upsertStoreInventory: (
      storeId: string | number,
      productId: string | number,
      payload: AdminStoreInventoryPayload,
    ) =>
      client.put<AdminStoreInventoryResponseItem, AdminStoreInventoryPayload>(
        `/admin/catalog/stores/${storeId}/inventory/${productId}`,
        payload,
      ),
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
