import type { ApiClient } from "../client";
import type { ApiId, MessageResponse } from "./shared";

export type CustomerAddress = {
  id: ApiId;
  customer_id: ApiId;
  store_coverage_id: ApiId;
  entrance: string | null;
  floor: string | null;
  apartment: string | null;
  entrance_code: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  store_id: ApiId;
  coverage_address: string;
  entrance_count: number | null;
};

export type AddressesResponse = { addresses: CustomerAddress[] };
export type AddressResponse = MessageResponse & { address: CustomerAddress };
export type CreateAddressPayload = {
  store_coverage_id: ApiId;
  entrance?: number;
  floor?: number;
  apartment?: number;
  entrance_code?: string;
  is_default?: boolean;
};

export function createAddressesApi(client: ApiClient) {
  return {
    list: () => client.get<AddressesResponse>("/my-addresses"),
    create: (payload: CreateAddressPayload) => client.post<AddressResponse, CreateAddressPayload>("/my-addresses", payload),
    remove: (id: ApiId) => client.delete<MessageResponse>(`/my-addresses/${id}`),
  };
}
