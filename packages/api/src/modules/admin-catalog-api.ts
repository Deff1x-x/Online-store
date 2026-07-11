import type { ApiClient } from "../client";
import type { ApiId } from "./shared";

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
  status: "active" | "inactive" | "paused" | "closed";
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
  inventory: StoreInventoryRecord;
};

export type StoreInventoryRecord = {
  id: ApiId;
  store_id: ApiId;
  product_id: ApiId;
  quantity: string | number;
  stock_quantity: number;
  selling_price: string | number | null;
  is_visible: boolean;
  status: "available" | "low_stock" | "out_of_stock";
  last_delivery_date: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminStoreInventoryPayload = {
  selling_price?: number | null;
  quantity?: number;
  is_visible?: boolean;
};

export type AdminStorePayload = {
  name: string;
  address: string;
  location?: string | null;
  operating_hours?: string | null;
  delivery_time_min?: number | null;
  delivery_time_max?: number | null;
  status?: AdminStore["status"];
};

export type AdminCoverage = {
  id: ApiId;
  store_id: ApiId;
  address: string;
  entrance_count: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminCoveragePayload = {
  store_id: ApiId;
  address: string;
  entrance_count?: number | null;
};

export type AdminPromocodeDiscountType = "fixed_amount" | "percentage";

export type AdminPromocode = {
  id: string;
  store_id: string | null;
  code: string;
  discount_type: AdminPromocodeDiscountType;
  discount_value: string | number;
  min_order_value: string | number;
  max_uses: number | null;
  usage_per_customer: number;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminPromocodesResponse = {
  promo_codes: AdminPromocode[];
};

export type AdminPromocodeResponse = {
  promo_code: AdminPromocode;
};

export type AdminPromocodeCreatePayload = {
  code: string;
  discount_type: AdminPromocodeDiscountType;
  discount_value: number;
  store_id?: string | null;
  min_order_value?: number;
  max_uses?: number | null;
  usage_per_customer?: number;
  valid_from?: string | null;
  valid_until?: string | null;
  is_active?: boolean;
};

export type AdminPromocodeUpdatePayload = Partial<AdminPromocodeCreatePayload>;

export type AdminStoreResponse = { store: AdminStore };
export type AdminCoverageResponse = { coverage: AdminCoverage };
export type AdminDeliverySettingsResponse = { delivery_settings: AdminDeliverySettings };
export type AdminInventoryResponse = { inventory: StoreInventoryRecord };
export type AdminInventoryIncomingPayload = { quantity: number };
export type AdminDeliverySettingsPayload = {
  min_order_value_for_free_delivery?: number | null;
  delivery_fee?: number | null;
  ordering_open_hour?: number | null;
  ordering_close_hour?: number | null;
};

export function createAdminCatalogApi(client: ApiClient) {
  return {
    getStores: () => client.get<AdminStoresResponse>("/admin/catalog/stores"),
    createStore: (payload: AdminStorePayload) => client.post<AdminStoreResponse, AdminStorePayload>("/admin/catalog/stores", payload),
    updateStore: (id: ApiId, payload: Partial<AdminStorePayload>) =>
      client.put<AdminStoreResponse, Partial<AdminStorePayload>>(`/admin/catalog/stores/${id}`, payload),
    deleteStore: (id: ApiId) => client.delete<AdminStoreResponse>(`/admin/catalog/stores/${id}`),
    upsertCoverage: (payload: AdminCoveragePayload) =>
      client.post<AdminCoverageResponse, AdminCoveragePayload>("/admin/catalog/coverage", payload),
    getProducts: () => client.get<AdminProductsResponse>("/admin/catalog/products"),
    createProduct: (payload: AdminProductCreatePayload) =>
      client.post<AdminProductResponse, AdminProductCreatePayload>("/admin/catalog/products", payload),
    updateProduct: (id: ApiId, payload: AdminProductUpdatePayload) =>
      client.put<AdminProductResponse, AdminProductUpdatePayload>(`/admin/catalog/products/${id}`, payload),
    deleteProduct: (id: ApiId) =>
      client.delete<AdminProductResponse>(`/admin/catalog/products/${id}`),
    getStoreInventory: (storeId: ApiId) =>
      client.get<AdminStoreInventoryResponse>(`/admin/catalog/stores/${storeId}/inventory`),
    upsertStoreInventory: (
      storeId: ApiId,
      productId: ApiId,
      payload: AdminStoreInventoryPayload,
    ) =>
      client.put<AdminStoreInventoryResponseItem, AdminStoreInventoryPayload>(
        `/admin/catalog/stores/${storeId}/inventory/${productId}`,
        payload,
      ),
    receiveStoreInventory: (storeId: ApiId, productId: ApiId, payload: AdminInventoryIncomingPayload) =>
      client.post<AdminInventoryResponse, AdminInventoryIncomingPayload>(
        `/admin/catalog/stores/${storeId}/inventory/${productId}/incoming`,
        payload,
      ),
    getPromoCodes: () => client.get<AdminPromocodesResponse>("/admin/catalog/promo-codes"),
    createPromoCode: (payload: AdminPromocodeCreatePayload) =>
      client.post<AdminPromocodeResponse, AdminPromocodeCreatePayload>("/admin/catalog/promo-codes", payload),
    updatePromoCode: (id: ApiId, payload: AdminPromocodeUpdatePayload) =>
      client.put<AdminPromocodeResponse, AdminPromocodeUpdatePayload>(`/admin/catalog/promo-codes/${id}`, payload),
    deletePromoCode: (id: ApiId) =>
      client.delete<AdminPromocodeResponse>(`/admin/catalog/promo-codes/${id}`),
    getDeliverySettings: (storeId: ApiId) =>
      client.get<AdminDeliverySettingsResponse>(`/admin/catalog/delivery-settings/${storeId}`),
    upsertDeliverySettings: (storeId: ApiId, payload: AdminDeliverySettingsPayload) =>
      client.put<AdminDeliverySettingsResponse, AdminDeliverySettingsPayload>(`/admin/catalog/delivery-settings/${storeId}`, payload),
  };
}
