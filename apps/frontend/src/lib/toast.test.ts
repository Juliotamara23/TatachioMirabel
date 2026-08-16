import { describe, it, expect, vi } from "vitest";
import { runWithToast } from "./toast";
import { ApiError } from "./api/client";
import type { ToastApi } from "../contexts/ToastContext";

function makeToast(): ToastApi {
  return { success: vi.fn(), error: vi.fn() };
}

describe("runWithToast (T4 — TOAST-2 helper)", () => {
  it("shows a success toast and returns the value when the promise resolves", async () => {
    const toast = makeToast();

    const result = await runWithToast(toast, Promise.resolve("ok"), {
      success: "Hecho",
      error: "Falló",
    });

    expect(result).toBe("ok");
    expect(toast.success).toHaveBeenCalledWith("Hecho");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows the ApiError body message when the promise rejects with ApiError", async () => {
    const toast = makeToast();
    const apiError = new ApiError(409, { error: "No se puede remover la última capitana" });

    const result = await runWithToast(toast, Promise.reject(apiError), {
      success: "Hecho",
      error: "Falló",
    });

    expect(result).toBeUndefined();
    expect(toast.error).toHaveBeenCalledWith("No se puede remover la última capitana");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("shows the fallback error message for non-ApiError rejections", async () => {
    const toast = makeToast();

    const result = await runWithToast(toast, Promise.reject(new Error("boom")), {
      success: "Hecho",
      error: "Falló",
    });

    expect(result).toBeUndefined();
    expect(toast.error).toHaveBeenCalledWith("Falló");
    expect(toast.success).not.toHaveBeenCalled();
  });
});
