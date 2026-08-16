import { ApiError } from "./api/client";
import type { ToastApi } from "../contexts/ToastContext";

interface ToastMessages {
  success: string;
  error: string;
}

/**
 * Runs a promise while mirroring its outcome as a toast (TOAST-2).
 *
 * Resolves → shows the success toast and returns the promise value.
 * Rejects → shows the ApiError body message when the failure is an
 * ApiError (e.g. the 409 "No se puede remover la última capitana"),
 * otherwise the generic error message; resolves undefined so callers
 * do not need try/catch — the outcome is communicated via the toast.
 */
export async function runWithToast<T>(
  toast: ToastApi,
  promise: Promise<T>,
  messages: ToastMessages,
): Promise<T | undefined> {
  try {
    const value = await promise;
    toast.success(messages.success);
    return value;
  } catch (err) {
    toast.error(err instanceof ApiError ? err.body.error : messages.error);
    return undefined;
  }
}
