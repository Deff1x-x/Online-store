import { SessionStorageAdapter } from "@koz/api";

const ORDER_RESULT_STORAGE_KEY = "koz.client.order-result.v1";
const sessionStorageAdapter = new SessionStorageAdapter();

export type OrderResult = {
  orderId: string;
  orderNumber: string;
  preauthAmount: number;
  fulfillmentWindow: "same_day" | "next_morning";
};

export function saveOrderResult(result: OrderResult) {
  sessionStorageAdapter.setItem(ORDER_RESULT_STORAGE_KEY, JSON.stringify(result));
}

export function readOrderResult(): OrderResult | null {
  const serialized = sessionStorageAdapter.getItem(ORDER_RESULT_STORAGE_KEY);
  if (!serialized) return null;

  try {
    const parsed = JSON.parse(serialized) as Partial<OrderResult>;
    if (
      typeof parsed.orderId !== "string" ||
      typeof parsed.orderNumber !== "string" ||
      typeof parsed.preauthAmount !== "number" ||
      (parsed.fulfillmentWindow !== "same_day" &&
        parsed.fulfillmentWindow !== "next_morning")
    ) {
      sessionStorageAdapter.removeItem(ORDER_RESULT_STORAGE_KEY);
      return null;
    }
    return parsed as OrderResult;
  } catch {
    sessionStorageAdapter.removeItem(ORDER_RESULT_STORAGE_KEY);
    return null;
  }
}
