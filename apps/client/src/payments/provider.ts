export type PaymentProviderResult = {
  ok: true;
};

export type PaymentProvider = {
  init: (amount: number, orderId: string) => Promise<PaymentProviderResult>;
};

export const paymentProvider: PaymentProvider = {
  async init(_amount, _orderId) {
    return { ok: true };
  },
};
