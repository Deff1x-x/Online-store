import type { ApiClient } from "../client";
import type {
  ApiId,
  ApiJsonValue,
  ApiMoney,
  DeliveryStatus,
  OrderPaymentStatus,
  Pagination,
  PaymentMethod,
  PaymentRecordStatus,
} from "./shared";

export type AdminOperationsStore = {
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
};

export type AdminStoreReportSubscribers = {
  total: number;
  active: number;
};

export type AdminStoreReportOrders = {
  totals: number;
  delivered: number;
  failed: number;
  gmv: string | number;
  online_part: string | number;
  pos_part: string | number;
  avg: string | number;
};

export type AdminStoreReport = {
  store: AdminOperationsStore;
  subscribers: AdminStoreReportSubscribers;
  orders: AdminStoreReportOrders;
};

export type AdminStoreReportResponse = {
  report: AdminStoreReport;
};

export type AdminStoreReportQuery = {
  date_from?: string;
  date_to?: string;
};

export type AdminRevenueAnalytics = {
  store_id: string;
  store_name: string;
  orders_count: number;
  gmv: string | number;
  delivery_fee_total: string | number;
  discount_total: string | number;
  avg_order_value: string | number;
};

export type AdminRevenueResponse = {
  revenue: AdminRevenueAnalytics[];
};

export type AdminDeliveryAnalytics = {
  store_id: string;
  store_name: string;
  totals: number;
  delivered: number;
  failed: number;
  avg_delivery_minutes: string | number;
  next_morning_orders: number;
};

export type AdminDeliveryResponse = {
  delivery: AdminDeliveryAnalytics[];
};

export type AdminAnalyticsQuery = {
  date_from?: string;
  date_to?: string;
};

export type AdminPaymentMethod = PaymentMethod;
export type AdminPaymentRecordStatus = PaymentRecordStatus;

export type AdminPayment = {
  id: string;
  order_id: string;
  method: AdminPaymentMethod;
  amount: string | number;
  status: AdminPaymentRecordStatus;
  provider_payload: ApiJsonValue;
  created_at: string;
  updated_at: string;
  order_number: string | null;
  store_id: string;
  store_name: string;
  delivery_status: DeliveryStatus;
  payment_status: OrderPaymentStatus;
};

export type AdminPaymentsQuery = AdminAnalyticsQuery & {
  page?: number;
  limit?: number;
  store_id?: string;
  method?: AdminPaymentMethod;
  status?: AdminPaymentRecordStatus;
};

export type AdminPaymentsResponse = {
  payments: AdminPayment[];
  pagination: Pagination;
};

export type AdminOrderRecord = {
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
  payment_status: OrderPaymentStatus;
  delivery_status: DeliveryStatus;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminOperationOrder = AdminOrderRecord & {
  store_name: string;
  customer_name: string | null;
  customer_phone: string;
};

export type AdminOrderDetail = AdminOperationOrder & {
  customer_email: string | null;
};

export type AdminOperationsOrdersQuery = AdminAnalyticsQuery & {
  page?: number;
  limit?: number;
  store_id?: ApiId;
  status?: DeliveryStatus;
};

export type AdminOperationsOrdersResponse = { orders: AdminOperationOrder[]; pagination: Pagination };
export type AdminOrderItem = {
  id: ApiId;
  order_id: ApiId;
  product_id: ApiId;
  quantity: ApiMoney;
  price_per_unit: ApiMoney;
  line_total: ApiMoney;
  estimated_weight: ApiMoney | null;
  created_at: string;
  updated_at: string;
  name: string;
  category: string;
  unit: string;
  is_weighted: boolean;
};
export type AdminOrderStatusHistory = {
  id: ApiId;
  order_id: ApiId;
  old_status: DeliveryStatus | null;
  new_status: DeliveryStatus;
  changed_by: ApiId | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  changed_by_name: string | null;
  changed_by_email: string | null;
};
export type AdminOrderDetailsResponse = {
  order: AdminOrderDetail;
  items: AdminOrderItem[];
  status_history: AdminOrderStatusHistory[];
  payments: AdminPayment[];
};
export type PromoCodeUsage = {
  id: ApiId;
  promo_code_id: ApiId;
  customer_id: ApiId;
  order_id: ApiId | null;
  discount_amount: ApiMoney;
  used_at: string;
  created_at: string;
  updated_at: string;
  customer_name: string | null;
  customer_phone: string;
  order_number: string | null;
  final_total: ApiMoney | null;
  delivery_status: DeliveryStatus | null;
  payment_status: OrderPaymentStatus | null;
};
export type PromoCodeUsageResponse = { usage: PromoCodeUsage[] };
export type FirstOrderDiscount = {
  id: ApiId;
  customer_id: ApiId;
  order_id: ApiId | null;
  amount: ApiMoney;
  is_used: boolean;
  created_at: string;
  updated_at: string;
  customer_name: string | null;
  customer_phone: string;
  customer_email: string | null;
  store_id: ApiId;
};
export type FirstOrderDiscountsResponse = { first_order_discounts: FirstOrderDiscount[] };
export type OrdersExportResponse = { message: string; format: "rows"; generated_at: string; rows: AdminOperationOrder[] };

export function createAdminOperationsApi(client: ApiClient) {
  return {
    getOrders: (query?: AdminOperationsOrdersQuery) => client.get<AdminOperationsOrdersResponse>("/admin/operations/orders", { query }),
    getOrder: (id: ApiId) => client.get<AdminOrderDetailsResponse>(`/admin/operations/orders/${id}`),
    updateOrderStatus: (id: ApiId, payload: { delivery_status: DeliveryStatus }) =>
      client.put<{ order: AdminOrderRecord }, { delivery_status: DeliveryStatus }>(`/admin/operations/orders/${id}/status`, payload),
    getPayments: (query?: AdminPaymentsQuery) => client.get<AdminPaymentsResponse>("/admin/operations/payments", { query }),
    getRevenueAnalytics: (query?: AdminAnalyticsQuery) =>
      client.get<AdminRevenueResponse>("/admin/operations/analytics/revenue", { query }),
    getDeliveryAnalytics: (query?: AdminAnalyticsQuery) =>
      client.get<AdminDeliveryResponse>("/admin/operations/analytics/delivery", { query }),
    getStoreReport: (id: ApiId, query?: AdminStoreReportQuery) =>
      client.get<AdminStoreReportResponse>(`/admin/operations/stores/${id}/report`, { query }),
    exportOrders: (query?: Omit<AdminOperationsOrdersQuery, "page" | "limit">) =>
      client.post<OrdersExportResponse>("/admin/operations/export/orders", undefined, { query }),
    getPromoCodeUsage: (id: ApiId) =>
      client.get<PromoCodeUsageResponse>(`/admin/operations/promo-codes/${id}/usage`),
    getFirstOrderDiscounts: () =>
      client.get<FirstOrderDiscountsResponse>("/admin/operations/first-order-discounts"),
  };
}
