import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { FamiliaForm } from "./FamiliaForm";
import { ToastProvider } from "../../contexts/ToastContext";
import { ApiError } from "../../lib/api/client";

vi.mock("../../lib/api/familias", () => ({
  createFamilia: vi.fn(),
  updateFamilia: vi.fn(),
}));

// Valid UUID — familiaSchema requires cabildoId: z.string().uuid().
const CABILDO_ID = "11111111-1111-4111-8111-111111111111";

vi.mock("../../contexts/CabildoContext", () => ({
  useCabildo: () => ({
    selectedId: CABILDO_ID,
    list: [{ id: CABILDO_ID, nombre: "Test Cabildo" }],
  }),
}));

const { createFamilia } = await import("../../lib/api/familias");

function renderForm(props = {}) {
  return render(
    <ToastProvider>
      <FamiliaForm onSuccess={vi.fn()} {...props} />
    </ToastProvider>,
  );
}

describe("FamiliaForm", () => {
  it("renders form fields", () => {
    renderForm();
    expect(screen.getByLabelText(/número/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/dirección/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/teléfono/i)).toBeInTheDocument();
  });

  it("shows validation error for numero=0 on submit", async () => {
    const user = userEvent.setup();
    renderForm();

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

    renderForm({ familia: existing });

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

    renderForm({ familia: existing });

    expect(screen.getByLabelText(/número/i)).toHaveValue(15);
    expect(screen.getByLabelText(/dirección/i)).toHaveValue("Calle 5 #5-05");
    expect(screen.getByLabelText(/teléfono/i)).toHaveValue("555-9876");
  });

  it("shows an error toast with the API message when create fails (TOAST-2)", async () => {
    const user = userEvent.setup();
    vi.mocked(createFamilia).mockRejectedValueOnce(
      new ApiError(409, { error: "El número de familia ya existe" }),
    );
    renderForm();

    // fireEvent.change avoids user.clear on type=number (parseInt("") = NaN).
    fireEvent.change(screen.getByLabelText(/número/i), { target: { value: "7" } });
    await user.click(screen.getByRole("button", { name: /guardar/i }));

    expect(await screen.findByText("El número de familia ya existe")).toBeInTheDocument();
  });
});
