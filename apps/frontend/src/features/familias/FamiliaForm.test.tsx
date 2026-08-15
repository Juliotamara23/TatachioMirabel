import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { FamiliaForm } from "./FamiliaForm";

vi.mock("../../lib/api/familias", () => ({
  createFamilia: vi.fn(),
  updateFamilia: vi.fn(),
}));

vi.mock("../../contexts/CabildoContext", () => ({
  useCabildo: () => ({
    selectedId: "cabildo-1",
    list: [{ id: "cabildo-1", nombre: "Test Cabildo" }],
  }),
}));

describe("FamiliaForm", () => {
  const mockOnSuccess = vi.fn();

  it("renders form fields", () => {
    render(<FamiliaForm onSuccess={mockOnSuccess} />);
    expect(screen.getByLabelText(/número/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/dirección/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/teléfono/i)).toBeInTheDocument();
  });

  it("shows validation error for numero=0 on submit", async () => {
    const user = userEvent.setup();
    render(<FamiliaForm onSuccess={mockOnSuccess} />);

    await user.click(screen.getByRole("button", { name: /guardar/i }));

    await waitFor(() => {
      expect(screen.getByText(/positivo/i)).toBeInTheDocument();
    });
  });

  it("shows update button when editing", () => {
    const existing = {
      id: "f1",
      numero: 42,
      direccion: "Calle 1 #1-01",
      telefono: "555-1234",
      cabildoId: "cabildo-1",
    };

    render(<FamiliaForm familia={existing} onSuccess={mockOnSuccess} />);

    expect(screen.getByLabelText(/número/i)).toHaveValue(42);
    expect(screen.getByRole("button", { name: /actualizar/i })).toBeInTheDocument();
  });

  it("pre-fills form with familia data when editing", () => {
    const existing = {
      id: "f1",
      numero: 15,
      direccion: "Calle 5 #5-05",
      telefono: "555-9876",
      cabildoId: "cabildo-1",
    };

    render(<FamiliaForm familia={existing} onSuccess={mockOnSuccess} />);

    expect(screen.getByLabelText(/número/i)).toHaveValue(15);
    expect(screen.getByLabelText(/dirección/i)).toHaveValue("Calle 5 #5-05");
    expect(screen.getByLabelText(/teléfono/i)).toHaveValue("555-9876");
  });
});
