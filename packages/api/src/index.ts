export type ApiFoundationConfig = {
  baseUrl: string;
};

export const DEFAULT_API_BASE_URL = "http://localhost:3000/api";

export function createApiFoundationConfig(
  baseUrl = DEFAULT_API_BASE_URL,
): ApiFoundationConfig {
  return { baseUrl };
}
