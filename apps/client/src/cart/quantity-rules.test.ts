import { describe, expect, it } from "vitest";
import {
  normalizeCartQuantity,
  roundWeightedQuantity,
  splitTwoPartPayment,
  stepperStep,
} from "./quantity-rules";

describe("TZ quantity / payment preview rules", () => {
  it("rounds weighted qty to 0.1", () => {
    expect(roundWeightedQuantity(1.23)).toBe(1.2);
    expect(roundWeightedQuantity(1.25)).toBe(1.3);
    expect(roundWeightedQuantity(1.5)).toBe(1.5);
  });

  it("uses 0.5 stepper for weighted and 1 for piece", () => {
    expect(stepperStep(true)).toBe(0.5);
    expect(stepperStep(false)).toBe(1);
  });

  it("normalizes piece qty to integers", () => {
    expect(normalizeCartQuantity(2.7, false)).toBe(3);
    expect(normalizeCartQuantity(1.2, true)).toBe(1.2);
  });

  it("splits final total into 80/20 parts", () => {
    expect(splitTwoPartPayment(1000)).toEqual({ onlineAmount: 800, posRemainder: 200 });
    expect(splitTwoPartPayment(1563)).toEqual({ onlineAmount: 1250.4, posRemainder: 312.6 });
  });
});
