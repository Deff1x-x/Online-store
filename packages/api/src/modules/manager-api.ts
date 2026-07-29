import type { ApiClient } from "../client";
import type { ApiId, ApiMoney, DeliveryStatus, InventoryStatus, OrderPaymentStatus } from "./shared";

export type ManagerOrderItem = {
  product_id: ApiId;
  name: string;
  quantity: ApiMoney;
  price_per_unit: ApiMoney;
  line_total: ApiMoney;
  estimated_weight: ApiMoney | null;
};

export type ManagerDeliveryAddress = {
  id: ApiId | null;
  coverage_address: string | null;
  entrance: string | null;
  floor: string | null;
  apartment: string | null;
  entrance_code: string | null;
};

export type ManagerOrder = {
  id: ApiId;
  order_number: string | null;
  store_id: ApiId;
  customer_id: ApiId;
  delivery_address_id: ApiId | null;
  subtotal: ApiMoney;
  discount_total: ApiMoney;
  delivery_fee: ApiMoney;
  estimated_weight: ApiMoney | null;
  actual_weight: ApiMoney | null;
  online_payment_amount: ApiMoney;
  online_capture_amount: ApiMoney;
  pos_terminal_topup: ApiMoney;
  final_total: ApiMoney;
  total_price: ApiMoney;
  fulfillment_window: "same_day" | "next_morning";
  delivery_date: string | null;
  delivery_time_slot: string | null;
  delivery_status: DeliveryStatus;
  payment_status: OrderPaymentStatus;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
  delivery_address?: ManagerDeliveryAddress | null;
  items?: ManagerOrderItem[];
};

export type ManagerOrdersResponse = { orders: ManagerOrder[] };

export type ManagerInventoryItem = {
  id?: ApiId;
  store_id?: ApiId;
  product_id: ApiId;
  name: string;
  category: string;
  unit: string;
  is_weighted: boolean;
  price_per_unit: ApiMoney;
  selling_price: ApiMoney | null;
  effective_price: ApiMoney;
  quantity: ApiMoney;
  stock_quantity?: number;
  is_visible: boolean;
  status: InventoryStatus;
  last_delivery_date: string | null;
};

export type ManagerInventoryResponse = { inventory: ManagerInventoryItem[] };
export type ManagerInventoryItemResponse = { inventory: ManagerInventoryItem };

export type ManagerAnalytics = {
  funnel: Partial<Record<DeliveryStatus, number>>;
  gmv_delivered: ApiMoney;
  pos_collected: ApiMoney;
  avg_order_value: ApiMoney;
  stopped_items: number;
  out_of_stock: number;
  low_stock: number;
};

export type ManagerAnalyticsResponse = { analytics: ManagerAnalytics };
export type ManagerOrdersQuery = { status?: DeliveryStatus };
export type ManagerAnalyticsQuery = { date_from?: string; date_to?: string };
export type ManagerInventoryUpdatePayload = {
  is_visible?: boolean;
  selling_price?: number | null;
  quantity?: number;
};

type ManagerPathId = ApiId | number;

export function createManagerApi(client: ApiClient) {
  return {
    getOrders: (query?: ManagerOrdersQuery) => client.get<ManagerOrdersResponse>("/my-store/orders", { query }),
    pickOrder: (id: ManagerPathId) => client.put<{ order: ManagerOrder }>(`/my-store/orders/${id}/pick`),
    updateOrderStatus: (id: ManagerPathId, payload: { delivery_status: DeliveryStatus }) =>
      client.put<{ order: ManagerOrder }, { delivery_status: DeliveryStatus }>(`/my-store/orders/${id}/status`, payload),
    recordActualWeight: (id: ManagerPathId, payload: { actual_weight: number }) =>
      client.put<{ order: ManagerOrder }, { actual_weight: number }>(`/my-store/orders/${id}/actual-weight`, payload),
    getInventory: () => client.get<ManagerInventoryResponse>("/my-store/inventory"),
    updateInventory: (productId: ManagerPathId, payload: ManagerInventoryUpdatePayload) =>
      client.put<ManagerInventoryItemResponse, ManagerInventoryUpdatePayload>(`/my-store/inventory/${productId}`, payload),
    receiveInventory: (productId: ManagerPathId, payload: { quantity: number }) =>
      client.put<ManagerInventoryItemResponse, { quantity: number }>(`/my-store/inventory/${productId}/receive`, payload),
    getAnalytics: (query?: ManagerAnalyticsQuery) => client.get<ManagerAnalyticsResponse>("/my-store/analytics", { query }),
  };
}
