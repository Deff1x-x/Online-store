import type { ApiClient } from "../client";
import type { ApiId, ApiMoney } from "./shared";

export type ValidatePromoPayload = { promo_code: string; order_total: number };
export type ValidatePromoResponse = { is_valid: boolean; discount_amount: number; error_message: string | null };
export type PromoCode = {
  id: ApiId;
  store_id: ApiId | null;
  code: string;
  discount_type: "fixed_amount" | "percentage";
  discount_value: ApiMoney;
  min_order_value: ApiMoney;
  max_uses: number | null;
  usage_per_customer: number;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
export type PromoCodesResponse = { promo_codes: PromoCode[] };
export type PromoCodeResponse = { promo_code: PromoCode };
export type CreatePromoCodePayload = {
  code: string;
  discount_type: PromoCode["discount_type"];
  discount_value: number;
  store_id?: ApiId | null;
  min_order_value?: number;
  max_uses?: number | null;
  usage_per_customer?: number;
  valid_from?: string | null;
  valid_until?: string | null;
  is_active?: boolean;
};

export function createPromocodesApi(client: ApiClient) {
  return {
    validate: (payload: ValidatePromoPayload) =>
      client.post<ValidatePromoResponse, ValidatePromoPayload>("/promocodes/validate", payload),
    list: (query?: { store_id?: ApiId }) => client.get<PromoCodesResponse>("/promocodes", { query }),
    create: (payload: CreatePromoCodePayload) => client.post<PromoCodeResponse, CreatePromoCodePayload>("/promocodes", payload),
  };
}
