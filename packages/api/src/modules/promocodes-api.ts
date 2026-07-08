import type { ApiClient, QueryParams } from "../client";
import type { ApiEntityResponse, ApiListResponse, ApiRecord } from "./shared";

export type ValidatePromoPayload = {
  promo_code: string;
  order_total: string | number;
};

export function createPromocodesApi(client: ApiClient) {
  return {
    validate: <T = ApiRecord>(payload: ValidatePromoPayload) =>
      client.post<ApiEntityResponse<T>, ValidatePromoPayload>("/promocodes/validate", payload),
    list: <T = ApiRecord>(query?: QueryParams) => client.get<ApiListResponse<T>>("/promocodes", { query }),
    create: <T = ApiRecord, TPayload = ApiRecord>(payload: TPayload) =>
      client.post<ApiEntityResponse<T>, TPayload>("/promocodes", payload),
  };
}
