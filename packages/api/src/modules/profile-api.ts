import type { ApiClient } from "../client";
import type { ApiEntityResponse, ApiRecord } from "./shared";

export function createProfileApi(client: ApiClient) {
  return {
    get: <T = ApiRecord>() => client.get<ApiEntityResponse<T>>("/my-profile"),
    update: <T = ApiRecord>(payload: { name?: string; email?: string }) =>
      client.put<ApiEntityResponse<T>, { name?: string; email?: string }>("/my-profile", payload),
  };
}
