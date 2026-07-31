export const DEFAULT_API_BASE_URL = "http://localhost:5000/api";
export const DEFAULT_APP_NAME = "KOZ";
export const DEFAULT_ENV = "development";
export const DEFAULT_REQUEST_TIMEOUT_MS = 15000;

export type AppEnvironment = {
  apiUrl: string;
  env: string;
  appName: string;
};

type ViteImportMeta = ImportMeta & {
  env?: Record<string, string | undefined>;
};

export function getAppEnvironment(meta: ViteImportMeta = import.meta): AppEnvironment {
  const env = meta.env ?? {};

  return {
    apiUrl: env.VITE_API_URL ?? DEFAULT_API_BASE_URL,
    env: env.VITE_ENV ?? DEFAULT_ENV,
    appName: env.VITE_APP_NAME ?? DEFAULT_APP_NAME,
  };
}
