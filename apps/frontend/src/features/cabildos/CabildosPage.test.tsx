import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CabildosPage } from "./CabildosPage";

vi.mock("../../lib/api/cabildos", () => ({
  listCabildos: vi.fn().mockResolvedValue([]),
  deleteCabildo: vi.fn().mockResolvedValue(undefined),
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

describe("CabildosPage", () => {
  it("renders cabildos page for admin after loading", async () => {
    render(<CabildosPage />);
    await waitFor(() => {
      expect(screen.getByText("Cabildos")).toBeInTheDocument();
    });
  });

  it("shows new cabildo button for admin after loading", async () => {
    render(<CabildosPage />);
    await waitFor(() => {
      expect(screen.getByText("Nuevo Cabildo")).toBeInTheDocument();
    });
  });
});
