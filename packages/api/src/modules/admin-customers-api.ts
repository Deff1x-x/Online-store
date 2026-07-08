import type { ApiClient, QueryParams } from "../client";
import type { ApiEntityResponse, ApiListResponse, ApiRecord } from "./shared";

export function createAdminCustomersApi(client: ApiClient) {
  return {
    getCustomers: <T = ApiRecord>(query?: QueryParams) =>
      client.get<ApiListResponse<T>>("/admin/customers/customers", { query }),
    getCustomer: <T = ApiRecord>(id: string | number) => client.get<ApiEntityResponse<T>>(`/admin/customers/customers/${id}`),
    getSubscriptions: <T = ApiRecord>(query?: QueryParams) =>
      client.get<ApiListResponse<T>>("/admin/customers/subscriptions", { query }),
    renewSubscription: <T = ApiRecord>(id: string | number) =>
      client.put<ApiEntityResponse<T>>(`/admin/customers/customers/${id}/subscription/renew`),
    cancelSubscription: <T = ApiRecord>(id: string | number) =>
      client.put<ApiEntityResponse<T>>(`/admin/customers/customers/${id}/subscription/cancel`),
    pauseSubscription: <T = ApiRecord>(id: string | number) =>
      client.put<ApiEntityResponse<T>>(`/admin/customers/customers/${id}/subscription/pause`),
    getConsentLogs: <T = ApiRecord>(query?: QueryParams) =>
      client.get<ApiListResponse<T>>("/admin/customers/audit-logs/consents", { query }),
    exportCustomers: <T = ApiRecord, TPayload = ApiRecord>(payload?: TPayload) =>
      client.post<ApiEntityResponse<T>, TPayload>("/admin/customers/export/customers", payload),
  };
}
