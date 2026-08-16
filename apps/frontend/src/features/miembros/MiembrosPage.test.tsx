import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MiembrosPage } from "./MiembrosPage";
import { listMiembros } from "../../lib/api/miembros";

vi.mock("../../lib/api/miembros", () => ({
  listMiembros: vi.fn().mockResolvedValue([]),
  deleteMiembro: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/api/reportes", () => ({
  downloadCenso: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ token: "test-token", user: { rol: "ADMINISTRATOR" } }),
}));

vi.mock("../../contexts/CabildoContext", () => ({
  useCabildo: () => ({
    selectedId: "cabildo-1",
    list: [{ id: "cabildo-1", nombre: "Test" }],
  }),
}));

const member = {
  id: "m1",
  tipoIdentificacion: "CC",
  numeroDocumento: "12345",
  nombres: "JUAN",
  apellidos: "PEREZ",
  fechaNacimiento: "01/01/1990",
  parentesco: "HI",
  sexo: "M",
  integrantes: 1,
  familiaId: "f1",
  cabildoId: "cabildo-1",
  estado: "ACTIVO",
  familia: { id: "f1", numero: 1 },
};

describe("MiembrosPage", () => {
  beforeEach(() => {
    localStorage.clear();
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

  it("renders members page title", async () => {
    render(<MiembrosPage />);
    await waitFor(() => {
      expect(screen.getByText("Miembros")).toBeInTheDocument();
    });
  });

  it("shows empty state when no members", async () => {
    render(<MiembrosPage />);
    await waitFor(() => {
      expect(screen.getByText("Sin datos")).toBeInTheDocument();
    });
  });

  it("renders the column picker in the toolbar", async () => {
    vi.mocked(listMiembros).mockResolvedValueOnce([member]);
    render(<MiembrosPage />);
    await waitFor(() => {
      expect(screen.getByTestId("column-picker")).toBeInTheDocument();
    });
  });

  it("shows the default columns including the estado badge", async () => {
    vi.mocked(listMiembros).mockResolvedValueOnce([member]);
    render(<MiembrosPage />);
    await waitFor(() => {
      expect(screen.getByText("ACTIVO")).toBeInTheDocument();
    });
    expect(screen.getByText("Documento")).toBeInTheDocument();
    expect(screen.getByText("Nombres")).toBeInTheDocument();
    expect(screen.getByText("Apellidos")).toBeInTheDocument();
    expect(screen.getByText("Estado")).toBeInTheDocument();
    // Hidden-by-default columns are absent (COLS-1)
    expect(screen.queryByText("Profesión")).not.toBeInTheDocument();
    expect(screen.queryByText("Dirección")).not.toBeInTheDocument();
  });

  it("shows and hides a column through the picker", async () => {
    vi.mocked(listMiembros).mockResolvedValueOnce([member]);
    const user = userEvent.setup();
    render(<MiembrosPage />);
    await waitFor(() => {
      expect(screen.getByTestId("column-picker")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("column-picker"));
    await user.click(screen.getByRole("checkbox", { name: /profesi/i }));
    // Close the menu so "Profesión" matches only the table header
    await user.click(screen.getByTestId("column-picker"));
    expect(screen.getByText("Profesión")).toBeInTheDocument();

    await user.click(screen.getByTestId("column-picker"));
    await user.click(screen.getByRole("checkbox", { name: /profesi/i }));
    await user.click(screen.getByTestId("column-picker"));
    expect(screen.queryByText("Profesión")).not.toBeInTheDocument();
  });
});
