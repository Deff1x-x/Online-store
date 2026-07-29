/** TZ А3: grace 3 days after paid period end while status remains active. */
export const SUBSCRIPTION_GRACE_DAYS = 3;

export function isSubscriptionInGracePeriod(
  status: string | null | undefined,
  endDate: string | null | undefined,
  today: Date = new Date(),
): boolean {
  if (status !== "active" || !endDate) return false;
  const end = parseDateOnly(endDate);
  if (!end) return false;
  const todayOnly = dateOnly(today);
  const graceEnd = addDays(end, SUBSCRIPTION_GRACE_DAYS);
  return todayOnly > end && todayOnly <= graceEnd;
}

export function subscriptionAllowsOrdering(
  status: string | null | undefined,
  endDate: string | null | undefined,
  today: Date = new Date(),
): boolean {
  if (status !== "active" || !endDate) return false;
  const end = parseDateOnly(endDate);
  if (!end) return false;
  return dateOnly(today) <= addDays(end, SUBSCRIPTION_GRACE_DAYS);
}

function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function dateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
