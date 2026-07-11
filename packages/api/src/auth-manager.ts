import { ApiClient } from "./client";
import { DEFAULT_API_BASE_URL } from "./config";
import { APIError } from "./errors";
import { createAuthTokenStorage, LocalStorageAdapter, type StorageAdapter } from "./storage";

export type AuthUser = {
  id: string | number;
  phone?: string;
  email?: string;
  name?: string;
  role?: string;
  store_id?: string | number | null;
};

export type AuthResponse = {
  token: string;
  refresh_token?: string;
  user?: AuthUser;
};

export type CustomerLoginPayload = { phone: string; code: string };
export type StaffLoginPayload = { email: string; password: string };
export type LoginMode = "customer" | "staff";
export type LoginPayload = CustomerLoginPayload | StaffLoginPayload;

export type AuthManagerOptions = {
  client?: ApiClient;
  accessTokenStorage?: StorageAdapter;
  refreshTokenStorage?: StorageAdapter;
  redirectTo?: string;
  onChange?: (token: string | null) => void;
  onLogout?: () => void;
};

const ACCESS_TOKEN_KEY = "koz.access_token";
const REFRESH_TOKEN_KEY = "koz.refresh_token";

export class AuthManager {
  readonly client: ApiClient;
  private accessTokenStorage: StorageAdapter;
  private refreshTokenStorage: StorageAdapter;
  private redirectTo: string;
  private onChange?: (token: string | null) => void;
  private onLogout?: () => void;
  private refreshPromise: Promise<boolean> | null = null;

  constructor(options: AuthManagerOptions = {}) {
    this.client = options.client ?? new ApiClient({ baseURL: DEFAULT_API_BASE_URL });
    this.accessTokenStorage = options.accessTokenStorage ?? createAuthTokenStorage();
    this.refreshTokenStorage = options.refreshTokenStorage ?? new LocalStorageAdapter();
    this.redirectTo = options.redirectTo ?? "/login";
    this.onChange = options.onChange;
    this.onLogout = options.onLogout;

    this.client.setAuthHandlers({
      getAccessToken: () => this.getAccessToken(),
      onUnauthorized: () => this.refresh(),
    });
  }

  async login(payload: LoginPayload, mode: LoginMode = "customer") {
    const path = mode === "staff" ? "/auth/staff/login" : "/auth/login";
    const result = await this.client.post<AuthResponse, LoginPayload>(path, payload, { auth: false });
    this.applyAuthResponse(result);
    return result;
  }

  logout(options: { redirect?: boolean } = { redirect: true }) {
    this.clearToken();
    this.refreshTokenStorage.removeItem(REFRESH_TOKEN_KEY);
    this.onLogout?.();

    if (options.redirect !== false && typeof window !== "undefined") {
      window.location.assign(this.redirectTo);
    }
  }

  async refresh() {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.refreshInternal().finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  setToken(accessToken: string, refreshToken?: string) {
    this.accessTokenStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    if (refreshToken) {
      this.refreshTokenStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    }
    this.onChange?.(accessToken);
  }

  clearToken() {
    this.accessTokenStorage.removeItem(ACCESS_TOKEN_KEY);
    this.onChange?.(null);
  }

  getAccessToken() {
    return this.accessTokenStorage.getItem(ACCESS_TOKEN_KEY);
  }

  setTokenListener(listener?: (token: string | null) => void) {
    this.onChange = listener;
    listener?.(this.getAccessToken());
  }

  private async refreshInternal() {
    const refreshToken = this.refreshTokenStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      this.logout();
      return false;
    }

    try {
      const result = await this.client.post<AuthResponse, { refresh_token: string }>(
        "/auth/refresh",
        { refresh_token: refreshToken },
        { auth: false, skipAuthRefresh: true, suppressErrorNotification: true },
      );
      this.applyAuthResponse(result);
      return true;
    } catch (error) {
      if (error instanceof APIError) {
        this.logout();
        return false;
      }
      this.logout();
      return false;
    }
  }

  private applyAuthResponse(result: AuthResponse) {
    this.setToken(result.token, result.refresh_token);
  }
}
