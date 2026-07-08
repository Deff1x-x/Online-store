import { SessionStorageAdapter } from "@koz/api";

const AUTH_FLOW_STORAGE_KEY = "koz.client.auth-flow.v1";
const sessionStorageAdapter = new SessionStorageAdapter();

export type AuthFlow = {
  intent: "login" | "register";
  phone: string;
  expiresAt: number;
  name?: string;
  privacyPolicy?: boolean;
  termsOfService?: boolean;
};

export function readAuthFlow(): AuthFlow | null {
  const serialized = sessionStorageAdapter.getItem(AUTH_FLOW_STORAGE_KEY);
  if (!serialized) return null;

  try {
    const parsed = JSON.parse(serialized) as Partial<AuthFlow>;
    if (
      (parsed.intent !== "login" && parsed.intent !== "register") ||
      typeof parsed.phone !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      clearAuthFlow();
      return null;
    }
    return parsed as AuthFlow;
  } catch {
    clearAuthFlow();
    return null;
  }
}

export function saveAuthFlow(flow: AuthFlow) {
  sessionStorageAdapter.setItem(AUTH_FLOW_STORAGE_KEY, JSON.stringify(flow));
}

export function clearAuthFlow() {
  sessionStorageAdapter.removeItem(AUTH_FLOW_STORAGE_KEY);
}

export function getOtpExpiry(expiresInSeconds: number) {
  return Date.now() + expiresInSeconds * 1000;
}
