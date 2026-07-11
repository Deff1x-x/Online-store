import type { ApiClient } from "../client";
import type { AuthResponse, CustomerLoginPayload, StaffLoginPayload } from "../auth-manager";
import type { ApiId, SubscriptionStatus } from "./shared";

export type OtpPayload = { phone: string };
export type OtpResponse = { message: string; expires_in_seconds: number };

export type RegisterCustomerPayload = {
  phone: string;
  code: string;
  name: string;
  store_id: ApiId;
  privacy_policy: boolean;
  terms_of_service: boolean;
};

export type AuthApiUser = {
  id: ApiId;
  phone?: string | null;
  email?: string | null;
  name?: string | null;
  role: "customer" | "store_operator" | "admin_catalog" | "admin_operations" | "admin_customers";
  store_id?: ApiId | null;
  customer_id?: ApiId | null;
  subscription_status?: SubscriptionStatus;
};

export type CustomerAuthResponse = AuthResponse & { refresh_token: string; user: AuthApiUser };
export type StaffAuthResponse = AuthResponse & { user: Pick<AuthApiUser, "id" | "email" | "name" | "role" | "store_id"> };

export function createAuthApi(client: ApiClient) {
  return {
    sendOtp: (payload: OtpPayload) => client.post<OtpResponse, OtpPayload>("/auth/otp", payload, { auth: false }),
    register: (payload: RegisterCustomerPayload) =>
      client.post<CustomerAuthResponse, RegisterCustomerPayload>("/auth/register", payload, { auth: false }),
    login: (payload: CustomerLoginPayload) =>
      client.post<CustomerAuthResponse, CustomerLoginPayload>("/auth/login", payload, { auth: false }),
    staffLogin: (payload: StaffLoginPayload) =>
      client.post<StaffAuthResponse, StaffLoginPayload>("/auth/staff/login", payload, { auth: false }),
    refresh: (payload: { refresh_token: string }) =>
      client.post<CustomerAuthResponse, { refresh_token: string }>("/auth/refresh", payload, {
        auth: false,
        skipAuthRefresh: true,
      }),
  };
}
