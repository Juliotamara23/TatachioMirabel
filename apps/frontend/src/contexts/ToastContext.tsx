import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { ToastStack, type ToastItem, type ToastType } from "../components/Toast";

/** Auto-dismiss delay for every toast (TOAST-1). */
const TOAST_AUTO_DISMISS_MS = 4000;

export interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
}

interface ToastContextValue {
  toast: ToastApi;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// Monotonic id source — event handlers only, so no render-double-invocation concern.
let nextToastId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (type: ToastType, message: string) => {
      const id = nextToastId++;
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => dismiss(id), TOAST_AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const toast = useMemo<ToastApi>(
    () => ({
      success: (message) => push("success", message),
      error: (message) => push("error", message),
    }),
    [push],
  );

  // Memoized so consumers do not re-render on every toast push/dismiss.
  const value = useMemo<ToastContextValue>(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
