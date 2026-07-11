import type { ApiClient } from "../client";

export type HealthResponse = {
  status: "ok";
  service: "koz-backend";
  timestamp: string;
};

export function createSystemApi(client: ApiClient) {
  return {
    getHealth: () => client.get<HealthResponse>("/health", { auth: false }),
  };
}
