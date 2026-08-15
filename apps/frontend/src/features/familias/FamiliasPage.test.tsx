import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FamiliasPage } from "./FamiliasPage";

vi.mock("../../lib/api/familias", () => ({
  listFamilias: vi.fn().mockResolvedValue([]),
  deleteFamilia: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../contexts/CabildoContext", () => ({
  useCabildo: () => ({
    selectedId: "cabildo-1",
    list: [{ id: "cabildo-1", nombre: "Test" }],
  }),
}));

describe("FamiliasPage", () => {
  it("renders families page title after loading", async () => {
    render(<FamiliasPage />);
    await waitFor(() => {
      expect(screen.getByText("Familias")).toBeInTheDocument();
    });
  });

  it("has a search input after loading", async () => {
    render(<FamiliasPage />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/buscar/i)).toBeInTheDocument();
    });
  });
});
