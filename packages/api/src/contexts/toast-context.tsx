import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren, type ReactNode } from "react";
import { uuid } from "../utils";

export type ToastTone = "neutral" | "success" | "warning" | "danger";
export type ToastMessage = {
  id: string;
  title?: ReactNode;
  message: ReactNode;
  tone?: ToastTone;
};

export type ToastContextValue = {
  toasts: ToastMessage[];
  showToast: (toast: Omit<ToastMessage, "id"> & { id?: string }) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
};

export const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((toast: Omit<ToastMessage, "id"> & { id?: string }) => {
    const id = toast.id ?? uuid();
    setToasts((current) => [...current, { ...toast, id }]);
    return id;
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const clearToasts = useCallback(() => setToasts([]), []);

  const value = useMemo(
    () => ({ toasts, showToast, dismissToast, clearToasts }),
    [clearToasts, dismissToast, showToast, toasts],
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToastContext() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return context;
}
