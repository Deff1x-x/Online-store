import { describe, expect, it } from "vitest";
import {
  SUBSCRIPTION_GRACE_DAYS,
  isSubscriptionInGracePeriod,
  subscriptionAllowsOrdering,
} from "./access-rules";

describe("subscription access rules (TZ А3)", () => {
  it("exposes 3-day grace", () => {
    expect(SUBSCRIPTION_GRACE_DAYS).toBe(3);
  });

  it("allows ordering through grace day 3", () => {
    const end = "2026-07-01";
    expect(subscriptionAllowsOrdering("active", end, new Date("2026-07-01T12:00:00"))).toBe(true);
    expect(subscriptionAllowsOrdering("active", end, new Date("2026-07-04T12:00:00"))).toBe(true);
    expect(subscriptionAllowsOrdering("active", end, new Date("2026-07-05T12:00:00"))).toBe(false);
  });

  it("detects in-grace window after end date", () => {
    const end = "2026-07-01";
    expect(isSubscriptionInGracePeriod("active", end, new Date("2026-07-02T12:00:00"))).toBe(true);
    expect(isSubscriptionInGracePeriod("active", end, new Date("2026-07-01T12:00:00"))).toBe(false);
    expect(isSubscriptionInGracePeriod("paused", end, new Date("2026-07-02T12:00:00"))).toBe(false);
  });
});
