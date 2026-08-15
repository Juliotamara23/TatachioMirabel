import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { CapitanasRegisterForm } from "./CapitanasRegisterForm";

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

describe("CapitanasRegisterForm", () => {
  it("renders form fields", () => {
    render(<CapitanasRegisterForm onSuccess={vi.fn()} />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/nombre/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
  });

  it("requires cabildoId selection", async () => {
    const user = userEvent.setup();
    render(<CapitanasRegisterForm onSuccess={vi.fn()} />);

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

    render(<CapitanasRegisterForm onSuccess={vi.fn()} />);

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
});
