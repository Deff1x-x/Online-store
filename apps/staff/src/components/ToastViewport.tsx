import { useEffect } from "react";
import { Toast } from "@koz/ui";
import { useToast, type ToastMessage } from "@koz/api";

const TOAST_DURATION_MS = 4000;

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const timeout = window.setTimeout(() => onDismiss(toast.id), TOAST_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [onDismiss, toast.id]);

  return (
    <Toast tone={toast.tone} title={toast.title}>
      {toast.message}
    </Toast>
  );
}

export function ToastViewport() {
  const { toasts, dismissToast } = useToast();

  return (
    <div className="staff-toast-viewport" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </div>
  );
}
