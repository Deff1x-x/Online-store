import type { ApiClient } from "../client";
import type { ApiId, ApiJsonValue, MessageResponse } from "./shared";

export type NotificationPayload = {
  recipient: string;
  template_key?: string;
  payload?: ApiJsonValue;
};

export type Notification = {
  id: ApiId;
  channel: "sms" | "email" | "push";
  recipient: string;
  template_key: string | null;
  payload: ApiJsonValue;
  status: "pending" | "processing" | "sent" | "failed" | "cancelled";
  attempts: number;
  last_error: string | null;
  scheduled_at: string;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationResponse = MessageResponse & { notification: Notification };

export function createNotificationsApi(client: ApiClient) {
  return {
    sendSms: (payload: NotificationPayload) => client.post<NotificationResponse, NotificationPayload>("/notifications/sms", payload),
    sendEmail: (payload: NotificationPayload) => client.post<NotificationResponse, NotificationPayload>("/notifications/email", payload),
  };
}
