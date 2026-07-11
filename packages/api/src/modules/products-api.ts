import type { ApiClient } from "../client";
import type { ApiId, ApiMoney, InventoryStatus } from "./shared";

export type StoreCatalogProduct = {
  product_id: ApiId;
  inventory_id: ApiId;
  name: string;
  category: "vegetables" | "fruits" | "dairy" | "meat" | "bakery" | "other";
  unit: "kg" | "pcs" | "l";
  price_per_unit: ApiMoney;
  is_weighted: boolean;
  quantity: ApiMoney;
  selling_price: ApiMoney | null;
  status: InventoryStatus;
};

export type StoreCatalogResponse = { products: StoreCatalogProduct[] };
export type Product = {
  id: ApiId;
  name: string;
  category: StoreCatalogProduct["category"];
  unit: StoreCatalogProduct["unit"];
  price_per_unit: ApiMoney;
  company_price: ApiMoney;
  is_weighted: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
export type ProductResponse = { product: Product };
export type ProductPayload = {
  name: string;
  category: Product["category"];
  unit: Product["unit"];
  price_per_unit: number;
  company_price: number;
  is_weighted: boolean;
  is_active?: boolean;
};
export type StoreInventory = {
  id: ApiId;
  store_id: ApiId;
  product_id: ApiId;
  quantity: ApiMoney;
  stock_quantity: number;
  selling_price: ApiMoney | null;
  is_visible: boolean;
  status: InventoryStatus;
  last_delivery_date: string | null;
};
export type StoreInventoryResponse = { inventory: StoreInventory };
export type LinkProductToStorePayload = { store_id: ApiId; product_id: ApiId; quantity: number; selling_price?: number | null };

export function createProductsApi(client: ApiClient) {
  return {
    getStoreProducts: (storeId: ApiId) => client.get<StoreCatalogResponse>(`/products/store/${storeId}`, { auth: false }),
    createProduct: (payload: ProductPayload) => client.post<ProductResponse, ProductPayload>("/products", payload),
    linkStore: (payload: LinkProductToStorePayload) => client.post<StoreInventoryResponse, LinkProductToStorePayload>("/products/link-store", payload),
  };
}
