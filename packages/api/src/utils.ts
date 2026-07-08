export function formatMoney(value: string | number | null | undefined, currency = " ₸") {
  const amount = Number(value ?? 0);
  return `${amount.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}${currency}`;
}

export function formatWeight(value: string | number | null | undefined) {
  const weight = Number(value ?? 0);
  return `${weight.toLocaleString("ru-RU", { maximumFractionDigits: 3 })} кг`;
}

export function formatDate(value: string | number | Date, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...options,
  }).format(new Date(value));
}

export function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const normalized = digits.startsWith("8") ? `7${digits.slice(1)}` : digits;
  if (normalized.length !== 11 || !normalized.startsWith("7")) {
    return value;
  }

  return `+7 ${normalized.slice(1, 4)} ${normalized.slice(4, 7)} ${normalized.slice(7, 9)} ${normalized.slice(9)}`;
}

export function debounce<TArgs extends unknown[]>(callback: (...args: TArgs) => void, waitMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  return (...args: TArgs) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => callback(...args), waitMs);
  };
}

export function throttle<TArgs extends unknown[]>(callback: (...args: TArgs) => void, waitMs: number) {
  let lastRun = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  return (...args: TArgs) => {
    const now = Date.now();
    const remaining = waitMs - (now - lastRun);

    if (remaining <= 0) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
      }
      lastRun = now;
      callback(...args);
      return;
    }

    if (!timeout) {
      timeout = setTimeout(() => {
        lastRun = Date.now();
        timeout = undefined;
        callback(...args);
      }, remaining);
    }
  };
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
