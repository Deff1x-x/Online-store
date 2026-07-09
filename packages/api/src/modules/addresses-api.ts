import type { ApiClient } from "../client";
import type { ApiEntityResponse, ApiListResponse, ApiRecord } from "./shared";

export type CreateAddressPayload = {
  store_coverage_id: string | number;
  entrance?: number;
  floor?: number;
  apartment?: number;
  entrance_code?: string;
  is_default?: boolean;
};

export function createAddressesApi(client: ApiClient) {
  return {
    list: <T = ApiRecord>() => client.get<ApiListResponse<T>>("/my-addresses"),
    create: <T = ApiRecord>(payload: CreateAddressPayload) =>
      client.post<ApiEntityResponse<T>, CreateAddressPayload>("/my-addresses", payload),
    remove: <T = ApiRecord>(id: string | number) => client.delete<ApiEntityResponse<T>>(`/my-addresses/${id}`),
  };
}
