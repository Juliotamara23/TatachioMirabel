import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FamiliasPage } from "./FamiliasPage";
import { ToastProvider } from "../../contexts/ToastContext";
import { listFamilias, deleteFamilia } from "../../lib/api/familias";

vi.mock("../../lib/api/familias", () => ({
  listFamilias: vi.fn().mockResolvedValue([]),
  deleteFamilia: vi.fn().mockResolvedValue(undefined),
  createFamilia: vi.fn().mockResolvedValue({ id: "f1" }),
  updateFamilia: vi.fn().mockResolvedValue({ id: "f1" }),
}));

// Valid UUID — familiaSchema requires cabildoId: z.string().uuid().
const CABILDO_ID = "11111111-1111-4111-8111-111111111111";

vi.mock("../../contexts/CabildoContext", () => ({
  useCabildo: () => ({
    selectedId: CABILDO_ID,
    list: [{ id: CABILDO_ID, nombre: "Test" }],
  }),
}));

const familia = {
  id: "f1",
  numero: 1,
  direccion: "Calle 1 #1-01",
  telefono: "555-1234",
  cabildoId: "cabildo-1",
};

function renderPage() {
  return render(
    <ToastProvider>
      <FamiliasPage />
    </ToastProvider>,
  );
}

describe("FamiliasPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom reports 0 for offset dimensions, so the virtualizer would render
    // 0 rows. Give elements a viewport so rows appear (same as Table.test).
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get: () => 600,
    });
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get: () => 800,
    });
  });

  it("renders families page title after loading", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Familias")).toBeInTheDocument();
    });
  });

  it("has a search input after loading", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/buscar/i)).toBeInTheDocument();
    });
  });

  it("shows a success toast after creating a familia (TOAST-2)", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /nueva familia/i }));

    // fireEvent.change avoids user.clear on type=number (parseInt("") = NaN).
    fireEvent.change(screen.getByLabelText(/número/i), { target: { value: "7" } });
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByText("Familia creada correctamente")).toBeInTheDocument();
  });

  it("deletes a familia through ConfirmDialog with a success toast (TOAST-2)", async () => {
    vi.mocked(listFamilias).mockResolvedValueOnce([familia]);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("delete-btn")).toBeInTheDocument();
    });
    await user.click(screen.getByTestId("delete-btn"));

    const dialog = screen.getByTestId("confirm-dialog");
    expect(dialog).toBeInTheDocument();
    await user.click(within(dialog).getByTestId("confirm-btn"));

    await waitFor(() => {
      expect(deleteFamilia).toHaveBeenCalledWith("f1");
    });
    expect(await screen.findByText("Familia eliminada correctamente")).toBeInTheDocument();
  });
});
