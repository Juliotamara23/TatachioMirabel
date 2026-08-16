import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { ToastProvider, useToast } from "./ToastContext";

/**
 * Test probe that exposes the useToast API through real DOM buttons,
 * mirroring how pages consume the hook (TOAST-1).
 */
function ToastProbe() {
  const { toast } = useToast();
  return (
    <div>
      <button type="button" onClick={() => toast.success("Operación exitosa")}>
        success
      </button>
      <button type="button" onClick={() => toast.error("Algo salió mal")}>
        error
      </button>
    </div>
  );
}

function renderWithProvider(ui: ReactNode) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

describe("ToastContext (T4 — TOAST-1)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("throws when used outside ToastProvider", () => {
    expect(() => renderHook(() => useToast())).toThrow(
      "useToast must be used within ToastProvider",
    );
  });

  it("renders a success toast with role=status", () => {
    renderWithProvider(<ToastProbe />);

    fireEvent.click(screen.getByRole("button", { name: "success" }));

    const toast = screen.getByTestId("toast");
    expect(toast).toHaveTextContent("Operación exitosa");
    expect(toast).toHaveAttribute("role", "status");
    expect(toast.className).toContain("border-green-500");
  });

  it("renders an error toast with role=alert", () => {
    renderWithProvider(<ToastProbe />);

    fireEvent.click(screen.getByRole("button", { name: "error" }));

    const toast = screen.getByTestId("toast");
    expect(toast).toHaveTextContent("Algo salió mal");
    expect(toast).toHaveAttribute("role", "alert");
    expect(toast.className).toContain("border-red-500");
  });

  it("auto-dismisses a toast after 4000ms", () => {
    vi.useFakeTimers();
    renderWithProvider(<ToastProbe />);

    fireEvent.click(screen.getByRole("button", { name: "success" }));
    expect(screen.getByTestId("toast")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3999);
    });
    expect(screen.getByTestId("toast")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
  });

  it("dismisses immediately via the dismiss button", () => {
    vi.useFakeTimers();
    renderWithProvider(<ToastProbe />);

    fireEvent.click(screen.getByRole("button", { name: "success" }));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
  });

  it("keeps multiple toasts and dismisses them independently", () => {
    vi.useFakeTimers();
    renderWithProvider(<ToastProbe />);

    fireEvent.click(screen.getByRole("button", { name: "success" }));
    fireEvent.click(screen.getByRole("button", { name: "error" }));
    expect(screen.getAllByTestId("toast")).toHaveLength(2);

    fireEvent.click(screen.getAllByRole("button", { name: "Cerrar" })[0]);

    expect(screen.getAllByTestId("toast")).toHaveLength(1);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
