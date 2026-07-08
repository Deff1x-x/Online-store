import type { ApiClient } from "../client";
import type { AuthResponse, LoginPayload } from "../auth-manager";
import type { ApiRecord } from "./shared";

export type OtpPayload = {
  phone: string;
};

export type OtpResponse = {
  message: string;
  expires_in_seconds: number;
};

export type RegisterCustomerPayload = {
  phone: string;
  code: string;
  name: string;
  store_id: string | number;
  privacy_policy: boolean;
  terms_of_service: boolean;
};

export function createAuthApi(client: ApiClient) {
  return {
    sendOtp: (payload: OtpPayload) => client.post<OtpResponse, OtpPayload>("/auth/otp", payload, { auth: false }),
    registerPhone: (payload: OtpPayload) =>
      client.post<ApiRecord, OtpPayload>("/auth/register-phone", payload, { auth: false }),
    register: (payload: RegisterCustomerPayload) =>
      client.post<AuthResponse, RegisterCustomerPayload>("/auth/register", payload, { auth: false }),
    verifyOtp: (payload: LoginPayload) => client.post<ApiRecord, LoginPayload>("/auth/verify-otp", payload, { auth: false }),
    login: (payload: LoginPayload) => client.post<AuthResponse, LoginPayload>("/auth/login", payload, { auth: false }),
    staffLogin: (payload: LoginPayload) =>
      client.post<AuthResponse, LoginPayload>("/auth/staff/login", payload, { auth: false }),
    loginAdmin: (payload: LoginPayload) =>
      client.post<AuthResponse, LoginPayload>("/auth/login-admin", payload, { auth: false }),
    refresh: (payload: { refresh_token: string }) =>
      client.post<AuthResponse, { refresh_token: string }>("/auth/refresh", payload, {
        auth: false,
        skipAuthRefresh: true,
      }),
  };
}
