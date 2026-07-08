import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from "react";
import type { ApiClient } from "./client";
import { useAuthContext } from "./contexts/auth-context";
import { useModalContext } from "./contexts/modal-context";
import { useToastContext } from "./contexts/toast-context";
import type { ApiModules } from "./modules";

export type ApiContextValue = {
  client: ApiClient;
  modules: ApiModules;
};

const ApiContext = createContext<ApiContextValue | null>(null);

export function ApiProvider({ client, modules, children }: PropsWithChildren<ApiContextValue>) {
  const value = useMemo(() => ({ client, modules }), [client, modules]);
  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

export function useApi() {
  const context = useContext(ApiContext);
  if (!context) {
    throw new Error("useApi must be used inside ApiProvider");
  }
  return context;
}

export function useAuth() {
  return useAuthContext();
}

export function useToast() {
  return useToastContext();
}

export function useModal() {
  return useModalContext();
}

export function useLoading(initial = false) {
  const [isLoading, setIsLoading] = useState(initial);

  const withLoading = useCallback(async <T,>(task: () => Promise<T>) => {
    setIsLoading(true);
    try {
      return await task();
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { isLoading, setIsLoading, withLoading };
}

export function usePagination(initialPage = 1, initialPageSize = 20) {
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const offset = useMemo(() => (page - 1) * pageSize, [page, pageSize]);
  const reset = useCallback(() => setPage(initialPage), [initialPage]);

  return {
    page,
    pageSize,
    offset,
    setPage,
    setPageSize,
    reset,
  };
}
