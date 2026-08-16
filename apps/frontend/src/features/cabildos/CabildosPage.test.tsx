import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CabildosPage } from "./CabildosPage";
import { ToastProvider } from "../../contexts/ToastContext";
import { listCabildos, deleteCabildo } from "../../lib/api/cabildos";

vi.mock("../../lib/api/cabildos", () => ({
  listCabildos: vi.fn().mockResolvedValue([]),
  deleteCabildo: vi.fn().mockResolvedValue(undefined),
  createCabildo: vi.fn().mockResolvedValue({ id: "c1" }),
  updateCabildo: vi.fn().mockResolvedValue({ id: "c1" }),
}));

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { rol: "ADMINISTRATOR", id: "1", email: "a@b.c", nombre: "Admin" },
    token: "test",
    status: "authed",
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

const cabildo = { id: "c1", nombre: "Cabildo A", resguardo: "Resguardo A", comunidad: "Comunidad A", vigencia: 2026 };

function renderPage() {
  return render(
    <ToastProvider>
      <CabildosPage />
    </ToastProvider>,
  );
}

describe("CabildosPage", () => {
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

  it("renders cabildos page for admin after loading", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Cabildos")).toBeInTheDocument();
    });
  });

  it("shows new cabildo button for admin after loading", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Nuevo Cabildo")).toBeInTheDocument();
    });
  });

  it("shows a success toast after creating a cabildo (TOAST-2)", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /nuevo cabildo/i }));

    await user.type(screen.getByLabelText(/nombre/i), "Nuevo Cabildo");
    await user.type(screen.getByLabelText(/resguardo/i), "Resguardo A");
    await user.type(screen.getByLabelText(/comunidad/i), "Comunidad A");
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByText("Cabildo creado correctamente")).toBeInTheDocument();
  });

  it("deletes a cabildo through ConfirmDialog with a success toast (TOAST-2)", async () => {
    vi.mocked(listCabildos).mockResolvedValueOnce([cabildo]);
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
      expect(deleteCabildo).toHaveBeenCalledWith("c1");
    });
    expect(await screen.findByText("Cabildo eliminado correctamente")).toBeInTheDocument();
  });
});
