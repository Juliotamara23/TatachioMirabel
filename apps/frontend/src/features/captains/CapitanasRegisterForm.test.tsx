import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { CapitanasRegisterForm } from "./CapitanasRegisterForm";
import { ToastProvider } from "../../contexts/ToastContext";
import { ApiError } from "../../lib/api/client";

vi.mock("../../lib/api/auth", () => ({
  register: vi.fn(),
}));

vi.mock("../../contexts/CabildoContext", () => ({
  useCabildo: () => ({
    selectedId: "cabildo-1",
    list: [{ id: "cabildo-1", nombre: "Test Cabildo" }],
  }),
}));

const { register: apiRegister } = await import("../../lib/api/auth");

function renderForm() {
  return render(
    <ToastProvider>
      <CapitanasRegisterForm onSuccess={vi.fn()} />
    </ToastProvider>,
  );
}

describe("CapitanasRegisterForm", () => {
  it("renders form fields", () => {
    renderForm();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/nombre/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
  });

  it("requires cabildoId selection", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/email/i), "test@test.com");
    await user.type(screen.getByLabelText(/nombre/i), "Test Captain");
    await user.type(screen.getByLabelText(/contraseña/i), "password123");

    // Don't select cabildo — submit should fail validation
    await user.click(screen.getByRole("button", { name: /registrar/i }));

    await waitFor(() => {
      expect(apiRegister).not.toHaveBeenCalled();
    });
  });

  it("calls register with role=CAPTAIN and cabildoId", async () => {
    const user = userEvent.setup();
    vi.mocked(apiRegister).mockResolvedValue({ id: "1" });

    renderForm();

    await user.type(screen.getByLabelText(/email/i), "captain@test.com");
    await user.type(screen.getByLabelText(/nombre/i), "Captain Test");
    await user.type(screen.getByLabelText(/contraseña/i), "password123");
    await user.selectOptions(screen.getByLabelText(/cabildo/i), "cabildo-1");

    await user.click(screen.getByRole("button", { name: /registrar/i }));

    await waitFor(() => {
      expect(apiRegister).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "captain@test.com",
          nombre: "Captain Test",
          rol: "CAPTAIN",
          cabildoId: "cabildo-1",
        }),
      );
    });
  });

  it("shows an error toast with the API message when register fails (TOAST-2)", async () => {
    const user = userEvent.setup();
    vi.mocked(apiRegister).mockRejectedValueOnce(
      new ApiError(409, { error: "El email ya está registrado" }),
    );

    renderForm();

    await user.type(screen.getByLabelText(/email/i), "dup@test.com");
    await user.type(screen.getByLabelText(/nombre/i), "Dup Captain");
    await user.type(screen.getByLabelText(/contraseña/i), "password123");
    await user.selectOptions(screen.getByLabelText(/cabildo/i), "cabildo-1");

    await user.click(screen.getByRole("button", { name: /registrar/i }));

    expect(await screen.findByText("El email ya está registrado")).toBeInTheDocument();
  });
});
