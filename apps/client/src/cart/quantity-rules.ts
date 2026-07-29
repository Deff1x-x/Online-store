/** TZ invariant 3 / Б3: weighted stepper 0.5, manual input step 0.1; piece integers. */
export function roundWeightedQuantity(quantity: number) {
  return Math.round(quantity * 10) / 10;
}

export function normalizeCartQuantity(quantity: number, isWeighted: boolean) {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  return isWeighted ? roundWeightedQuantity(quantity) : Math.round(quantity);
}

export function stepperStep(isWeighted: boolean) {
  return isWeighted ? 0.5 : 1;
}

/** TZ cart/checkout: 80% online hold preview. */
export function splitTwoPartPayment(finalTotal: number) {
  const onlineAmount = Math.round(finalTotal * 0.8 * 100) / 100;
  const posRemainder = Math.round((finalTotal - onlineAmount) * 100) / 100;
  return { onlineAmount, posRemainder };
}
