import type { ApiClient } from "../client";
import type { ApiId, ApiMoney, DeliveryStatus, OrderPaymentStatus, PaymentMethod } from "./shared";

export type CreateOrderPayload = {
  payment_method: Extract<PaymentMethod, "online">;
  delivery_address_id: ApiId;
  items: Array<{ product_id: ApiId; quantity: number }>;
  promo_code?: string;
};

export type OrderItem = {
  id: ApiId;
  order_id: ApiId;
  product_id: ApiId;
  quantity: ApiMoney;
  price_per_unit: ApiMoney;
  line_total: ApiMoney;
  estimated_weight: ApiMoney | null;
  created_at: string;
  updated_at: string;
  name?: string;
};

export type CustomerOrder = {
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
  updated_at?: string;
  items?: OrderItem[];
};

export type OrderBreakdown = {
  subtotal: number;
  first_order_discount: number;
  promo_discount: number;
  discount_total: number;
  delivery_fee: number;
  final_total: number;
};

export type CreateOrderResponse = {
  order_id: ApiId;
  order_number: string | null;
  breakdown: OrderBreakdown;
  payment_options: {
    online: { preauth_amount: number; remainder_on_delivery: number; note: string };
    pos: { amount: number };
  };
  order: CustomerOrder;
};

export type MyOrdersResponse = { orders: CustomerOrder[] };
export type MyOrderResponse = { order: CustomerOrder & { items: OrderItem[] } };

export function createOrdersApi(client: ApiClient) {
  return {
    create: (payload: CreateOrderPayload) => client.post<CreateOrderResponse, CreateOrderPayload>("/orders", payload),
    listMy: () => client.get<MyOrdersResponse>("/my-orders"),
    getMy: (id: ApiId) => client.get<MyOrderResponse>(`/my-orders/${id}`),
  };
}
