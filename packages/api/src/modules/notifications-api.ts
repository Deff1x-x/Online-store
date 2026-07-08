import type { ApiClient } from "../client";
import type { ApiEntityResponse, ApiRecord } from "./shared";

export function createNotificationsApi(client: ApiClient) {
  return {
    sendSms: <T = ApiRecord, TPayload = ApiRecord>(payload: TPayload) =>
      client.post<ApiEntityResponse<T>, TPayload>("/notifications/sms", payload),
    sendEmail: <T = ApiRecord, TPayload = ApiRecord>(payload: TPayload) =>
      client.post<ApiEntityResponse<T>, TPayload>("/notifications/email", payload),
  };
}
