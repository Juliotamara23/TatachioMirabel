import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { InlineEditableRow } from "./InlineEditableRow";
import { MIEMBRO_COLUMNS, type MiembroColumn } from "./columnConfig";
import { updateMiembro, type Miembro } from "../../lib/api/miembros";
import { ToastProvider } from "../../contexts/ToastContext";

vi.mock("../../lib/api/miembros", () => ({
  updateMiembro: vi.fn(),
}));

// The draft is validated against memberSchema, so the row fixture must satisfy
// the full schema (valid UUIDs for familiaId/cabildoId, enum values, etc.).
const member: Miembro = {
  id: "11111111-1111-4111-8111-111111111111",
  tipoIdentificacion: "CC",
  numeroDocumento: "12345",
  nombres: "JUAN",
  apellidos: "PEREZ",
  fechaNacimiento: "01/01/1990",
  parentesco: "HI",
  sexo: "M",
  estadoCivil: "S",
  profesion: undefined,
  escolaridad: "PR",
  integrantes: 1,
  direccion: undefined,
  telefono: undefined,
  novedad: undefined,
  familiaId: "22222222-2222-4222-8222-222222222222",
  cabildoId: "33333333-3333-4333-8333-333333333333",
  estado: "ACTIVO",
  familia: { id: "22222222-2222-4222-8222-222222222222", numero: 1 },
};

// Mix of editable (text/select/number/date) and read-only columns from the
// real catalog, so the editors under test are the production ones.
const columns: MiembroColumn[] = MIEMBRO_COLUMNS.filter((c) =>
  ["documento", "nombres", "fechaNacimiento", "sexo", "integrantes", "acciones"].includes(c.key),
);

function renderRow(onSave = vi.fn(), onCancel = vi.fn()) {
  render(
    <ToastProvider>
      <InlineEditableRow row={member} columns={columns} onSave={onSave} onCancel={onCancel} />
    </ToastProvider>,
  );
  return { onSave, onCancel };
}

describe("InlineEditableRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(updateMiembro).mockResolvedValue({ ...member, nombres: "MARIA" });
  });

  it("renders an editor per editable column and read-only cells otherwise", () => {
    renderRow();

    // Text editor for nombres, initialized from the row value.
    expect(screen.getByDisplayValue("JUAN")).toBeInTheDocument();
    // Select editor for sexo.
    expect(screen.getByDisplayValue("M")).toBeInTheDocument();
    // Date text input with DD/MM/YYYY contract (no native date input).
    const fecha = screen.getByPlaceholderText("DD/MM/YYYY");
    expect(fecha).toHaveValue("01/01/1990");
    // Number editor for integrantes.
    expect(screen.getByDisplayValue("1")).toBeInTheDocument();
    // Read-only column keeps its rendered value.
    expect(screen.getByText("CC 12345")).toBeInTheDocument();
    // Save/cancel actions.
    expect(screen.getByTestId("save-btn")).toBeInTheDocument();
    expect(screen.getByTestId("cancel-btn")).toBeInTheDocument();
  });

  it("shows an inline error and disables Guardar for an invalid fechaNacimiento", async () => {
    const user = userEvent.setup();
    renderRow();

    const fecha = screen.getByPlaceholderText("DD/MM/YYYY");
    await user.clear(fecha);
    await user.type(fecha, "31/02/1990");

    expect(
      screen.getByText("Fecha de nacimiento inválida (no existe en el calendario)"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("save-btn")).toBeDisabled();
  });

  it("saves ONLY the changed fields, shows a success toast and calls onSave", async () => {
    const user = userEvent.setup();
    const { onSave } = renderRow();

    const nombres = screen.getByDisplayValue("JUAN");
    await user.clear(nombres);
    await user.type(nombres, "MARIA");

    await user.click(screen.getByTestId("save-btn"));

    await waitFor(() => {
      expect(updateMiembro).toHaveBeenCalledWith(member.id, { nombres: "MARIA" });
    });
    expect(updateMiembro).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Miembro actualizado correctamente")).toBeInTheDocument();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("keeps Guardar disabled while the row is invalid", async () => {
    const user = userEvent.setup();
    renderRow();

    const nombres = screen.getByDisplayValue("JUAN");
    await user.clear(nombres);

    // Empty required field → invalid, Guardar disabled.
    expect(screen.getByTestId("save-btn")).toBeDisabled();
    expect(updateMiembro).not.toHaveBeenCalled();
  });

  it("cancel discards the draft, calls onCancel and never hits the network", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderRow();

    const nombres = screen.getByDisplayValue("JUAN");
    await user.clear(nombres);
    await user.type(nombres, "MARIA");

    await user.click(screen.getByTestId("cancel-btn"));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(updateMiembro).not.toHaveBeenCalled();
  });
});
