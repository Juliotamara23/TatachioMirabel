import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MiembroForm } from "./MiembroForm";

vi.mock("../../lib/api/miembros", () => ({
  createMiembro: vi.fn(),
  updateMiembro: vi.fn(),
}));

vi.mock("../../contexts/CabildoContext", () => ({
  useCabildo: () => ({
    selectedId: "cabildo-1",
    list: [{ id: "cabildo-1", nombre: "Test Cabildo" }],
  }),
}));

describe("MiembroForm", () => {
  const mockOnSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders form fields", () => {
    render(<MiembroForm onSuccess={mockOnSuccess} />);
    expect(screen.getByLabelText(/nombres/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/apellidos/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/documento/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/fecha/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/familia/i)).toBeInTheDocument();
  });

  it("shows validation errors on empty submit", async () => {
    const user = userEvent.setup();
    render(<MiembroForm onSuccess={mockOnSuccess} />);

    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => {
      const errorElements = document.querySelectorAll(".text-red-500");
      expect(errorElements.length).toBeGreaterThan(0);
    });
  });

  it("shows update button when editing", () => {
    const existing = {
      id: "1",
      tipoIdentificacion: "CC" as const,
      numeroDocumento: "12345678",
      nombres: "JUAN",
      apellidos: "PEREZ",
      fechaNacimiento: "01/01/1990",
      parentesco: "HI" as const,
      sexo: "M" as const,
      integrantes: 3,
      familiaId: "550e8400-e29b-41d4-a716-446655440000",
      cabildoId: "cabildo-1",
    };

    render(<MiembroForm member={existing} onSuccess={mockOnSuccess} />);

    expect(screen.getByLabelText(/nombres/i)).toHaveValue("JUAN");
    expect(screen.getByRole("button", { name: /actualizar/i })).toBeInTheDocument();
  });

  it("pre-fills form with member data when editing", () => {
    const existing = {
      id: "1",
      tipoIdentificacion: "CC" as const,
      numeroDocumento: "12345678",
      nombres: "MARIA",
      apellidos: "GONZALEZ",
      fechaNacimiento: "15/06/1985",
      parentesco: "MA" as const,
      sexo: "F" as const,
      integrantes: 4,
      familiaId: "550e8400-e29b-41d4-a716-446655440000",
      cabildoId: "cabildo-1",
    };

    render(<MiembroForm member={existing} onSuccess={mockOnSuccess} />);

    expect(screen.getByLabelText(/nombres/i)).toHaveValue("MARIA");
    expect(screen.getByLabelText(/apellidos/i)).toHaveValue("GONZALEZ");
    expect(screen.getByLabelText(/documento/i)).toHaveValue("12345678");
  });
});
