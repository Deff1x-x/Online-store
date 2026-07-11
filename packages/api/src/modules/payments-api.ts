import type { ApiClient } from "../client";
import type { ApiId, ApiJsonValue, ApiMoney, OrderPaymentStatus, PaymentMethod, PaymentRecordStatus } from "./shared";

export type Payment = {
  id: ApiId;
  order_id: ApiId;
  method: PaymentMethod;
  amount: ApiMoney;
  status: PaymentRecordStatus;
  provider_payload: ApiJsonValue;
  created_at: string;
  updated_at: string;
  order_number: string | null;
  order_payment_status: OrderPaymentStatus;
};

export type PaymentsResponse = { payments: Payment[] };
export type PaymentResponse = { payment: Payment };
export type OnlinePaymentResponse = PaymentResponse & { payment_url: string; qr: string };
export type PaymentsQuery = { method?: PaymentMethod; status?: PaymentRecordStatus };

export function createPaymentsApi(client: ApiClient) {
  return {
    list: (query?: PaymentsQuery) => client.get<PaymentsResponse>("/payments", { query }),
    get: (id: ApiId) => client.get<PaymentResponse>(`/payments/${id}`),
    payOrderOnline: (orderId: ApiId) => client.post<OnlinePaymentResponse>(`/payments/orders/${orderId}/pay-online`),
  };
}
