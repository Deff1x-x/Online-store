import { SessionStorageAdapter } from "@koz/api";

const ORDER_RESULT_STORAGE_KEY = "koz.client.order-result.v1";
const sessionStorageAdapter = new SessionStorageAdapter();

export type OrderResult = {
  orderId: string;
  orderNumber: string;
  preauthAmount: number;
  finalTotal?: number;
  deliveryFee?: number;
  discountTotal?: number;
  posRemainderAmount?: number;
  fulfillmentWindow: "same_day" | "next_morning";
};

function readOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

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
    return {
      orderId: parsed.orderId,
      orderNumber: parsed.orderNumber,
      preauthAmount: parsed.preauthAmount,
      finalTotal: readOptionalNumber(parsed.finalTotal),
      deliveryFee: readOptionalNumber(parsed.deliveryFee),
      discountTotal: readOptionalNumber(parsed.discountTotal),
      posRemainderAmount: readOptionalNumber(parsed.posRemainderAmount),
      fulfillmentWindow: parsed.fulfillmentWindow,
    };
  } catch {
    sessionStorageAdapter.removeItem(ORDER_RESULT_STORAGE_KEY);
    return null;
  }
}
