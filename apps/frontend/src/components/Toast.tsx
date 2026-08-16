/**
 * Toast stack (TOAST-1). Presentational component: renders the fixed
 * top-right stack. ToastProvider owns the state and feeds toasts +
 * onDismiss down; it never manages timers itself.
 */

export type ToastType = "success" | "error";

export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastStackProps {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}

/** Left accent color per toast type (green success / red error). */
const TYPE_BORDER_CLASS: Record<ToastType, string> = {
  success: "border-green-500",
  error: "border-red-500",
};

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  return (
    <div
      data-testid="toast-stack"
      className="fixed top-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          data-testid="toast"
          role={toast.type === "error" ? "alert" : "status"}
          className={`flex items-start gap-3 rounded-md border-l-4 bg-white p-3 shadow-lg text-slate-800 dark:bg-slate-800 dark:text-slate-100 ${TYPE_BORDER_CLASS[toast.type]}`}
        >
          <p className="flex-1 text-sm">{toast.message}</p>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Cerrar"
            data-testid="toast-dismiss"
            className="shrink-0 leading-none text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
