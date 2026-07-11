import type { ApiClient } from "../client";
import type { ApiId, SubscriptionStatus } from "./shared";

export type CustomerProfile = {
  user: { id: ApiId; name: string | null; phone: string; email: string | null };
  customer: { id: ApiId; store_id: ApiId };
  subscription_status: SubscriptionStatus;
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  subscription_auto_renew: boolean;
};

export type ProfileResponse = { profile: CustomerProfile };
export type ProfileUpdatePayload = { name?: string | null; email?: string | null };

export function createProfileApi(client: ApiClient) {
  return {
    get: () => client.get<ProfileResponse>("/my-profile"),
    update: (payload: ProfileUpdatePayload) => client.put<ProfileResponse, ProfileUpdatePayload>("/my-profile", payload),
  };
}
