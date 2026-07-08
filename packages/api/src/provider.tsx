import { useEffect, useMemo, type PropsWithChildren } from "react";
import { ApiClient } from "./client";
import { getAppEnvironment } from "./config";
import { AuthManager } from "./auth-manager";
import { AuthProvider } from "./contexts/auth-context";
import { ModalProvider } from "./contexts/modal-context";
import { ThemeContextProvider, type ThemeName } from "./contexts/theme-context";
import { ToastProvider } from "./contexts/toast-context";
import { useToastContext } from "./contexts/toast-context";
import type { APIError } from "./errors";
import { createApiModules } from "./modules";
import { ApiProvider } from "./hooks";

export type FrontendApiProviderProps = PropsWithChildren<{
  apiUrl?: string;
  theme?: ThemeName;
  redirectTo?: string;
  onSubscriptionError?: (error: APIError) => void;
}>;

function ApiErrorBridge({
  client,
  onSubscriptionError,
}: {
  client: ApiClient;
  onSubscriptionError?: (error: APIError) => void;
}) {
  const { showToast } = useToastContext();

  useEffect(() => {
    client.setErrorHandler((error) => {
      showToast({
        message: error.message,
        tone: "danger",
      });

      if (error.code?.startsWith("subscription_")) {
        onSubscriptionError?.(error);
      }
    });

    return () => client.setErrorHandler(undefined);
  }, [client, onSubscriptionError, showToast]);

  return null;
}

export function FrontendApiProvider({
  children,
  apiUrl,
  theme = "light",
  redirectTo,
  onSubscriptionError,
}: FrontendApiProviderProps) {
  const environment = getAppEnvironment();
  const client = useMemo(() => new ApiClient({ baseURL: apiUrl ?? environment.apiUrl }), [apiUrl, environment.apiUrl]);
  const authManager = useMemo(() => new AuthManager({ client, redirectTo }), [client, redirectTo]);
  const modules = useMemo(() => createApiModules(client), [client]);

  return (
    <ApiProvider client={client} modules={modules}>
      <ThemeContextProvider theme={theme}>
        <ToastProvider>
          <ApiErrorBridge client={client} onSubscriptionError={onSubscriptionError} />
          <ModalProvider>
            <AuthProvider authManager={authManager}>{children}</AuthProvider>
          </ModalProvider>
        </ToastProvider>
      </ThemeContextProvider>
    </ApiProvider>
  );
}
