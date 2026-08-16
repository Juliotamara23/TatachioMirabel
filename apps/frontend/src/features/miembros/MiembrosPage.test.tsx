import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MiembrosPage } from "./MiembrosPage";
import { listMiembros, deleteMiembro, updateMiembro } from "../../lib/api/miembros";
import { ToastProvider } from "../../contexts/ToastContext";

vi.mock("../../lib/api/miembros", () => ({
  listMiembros: vi.fn().mockResolvedValue([]),
  deleteMiembro: vi.fn().mockResolvedValue(undefined),
  updateMiembro: vi.fn().mockResolvedValue({}),
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

// The inline edit flow validates the row against memberSchema, so the fixture
// uses valid UUIDs and enum values.
const member = {
  id: "11111111-1111-4111-8111-111111111111",
  tipoIdentificacion: "CC",
  numeroDocumento: "12345",
  nombres: "JUAN",
  apellidos: "PEREZ",
  fechaNacimiento: "01/01/1990",
  parentesco: "HI",
  sexo: "M",
  estadoCivil: "S",
  integrantes: 1,
  familiaId: "22222222-2222-4222-8222-222222222222",
  cabildoId: "33333333-3333-4333-8333-333333333333",
  estado: "ACTIVO",
  familia: { id: "22222222-2222-4222-8222-222222222222", numero: 1 },
};

function renderPage() {
  return render(
    <ToastProvider>
      <MiembrosPage />
    </ToastProvider>,
  );
}

describe("MiembrosPage", () => {
  beforeEach(() => {
    localStorage.clear();
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

  it("renders members page title", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Miembros")).toBeInTheDocument();
    });
  });

  it("shows empty state when no members", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Sin datos")).toBeInTheDocument();
    });
  });

  it("renders the column picker in the toolbar", async () => {
    vi.mocked(listMiembros).mockResolvedValueOnce([member]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("column-picker")).toBeInTheDocument();
    });
  });

  it("shows the default columns including the estado badge", async () => {
    vi.mocked(listMiembros).mockResolvedValueOnce([member]);
    renderPage();
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
    renderPage();
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

  it("enters inline edit mode from ✏️ and saves only changed fields (EDIT-1..3)", async () => {
    vi.mocked(listMiembros).mockResolvedValueOnce([member]);
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("edit-btn")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("edit-btn"));
    // Row renders editable inputs with Guardar/Cancelar instead of the modal.
    const saveBtn = screen.getByTestId("save-btn");
    expect(saveBtn).toBeInTheDocument();
    expect(screen.getByTestId("cancel-btn")).toBeInTheDocument();

    const nombres = screen.getByDisplayValue("JUAN");
    await user.clear(nombres);
    await user.type(nombres, "MARIA");

    await user.click(saveBtn);

    await waitFor(() => {
      expect(updateMiembro).toHaveBeenCalledWith(member.id, { nombres: "MARIA" });
    });
    expect(screen.getByText("Miembro actualizado correctamente")).toBeInTheDocument();
    // Row exits edit mode after save.
    await waitFor(() => {
      expect(screen.queryByTestId("save-btn")).not.toBeInTheDocument();
    });
  });

  it("cancels inline edit without calling the API (EDIT-4)", async () => {
    vi.mocked(listMiembros).mockResolvedValueOnce([member]);
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("edit-btn")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("edit-btn"));
    const nombres = screen.getByDisplayValue("JUAN");
    await user.clear(nombres);
    await user.type(nombres, "MARIA");

    await user.click(screen.getByTestId("cancel-btn"));

    expect(updateMiembro).not.toHaveBeenCalled();
    expect(screen.queryByTestId("save-btn")).not.toBeInTheDocument();
  });

  it("deletes a member through ConfirmDialog with a success toast (EDIT-6)", async () => {
    vi.mocked(listMiembros).mockResolvedValueOnce([member]);
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
      expect(deleteMiembro).toHaveBeenCalledWith(member.id);
    });
    expect(screen.getByText("Miembro eliminado correctamente")).toBeInTheDocument();
  });

  it("cancels the delete dialog without deleting (EDIT-6)", async () => {
    vi.mocked(listMiembros).mockResolvedValueOnce([member]);
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("delete-btn")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("delete-btn"));
    const dialog = screen.getByTestId("confirm-dialog");
    await user.click(within(dialog).getByTestId("cancel-btn"));

    expect(deleteMiembro).not.toHaveBeenCalled();
    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
  });

  it("exports the censo scoped to the selected cabildo with a success toast (XLSX-4, TOAST-2)", async () => {
    const user = userEvent.setup();
    const { downloadCenso } = await import("../../lib/api/reportes");
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("export-btn")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("export-btn"));

    await waitFor(() => {
      expect(downloadCenso).toHaveBeenCalledWith("test-token", "cabildo-1");
    });
    expect(await screen.findByText("Censo exportado correctamente")).toBeInTheDocument();
  });
});
