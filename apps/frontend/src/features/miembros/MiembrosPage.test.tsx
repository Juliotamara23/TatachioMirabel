import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MiembrosPage } from "./MiembrosPage";

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

describe("MiembrosPage", () => {
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
});
