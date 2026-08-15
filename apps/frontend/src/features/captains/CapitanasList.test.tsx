import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CapitanasList } from "./CapitanasList";

vi.mock("../../lib/api/admin", () => ({
  listCaptains: vi.fn().mockResolvedValue([
    { id: "u1", email: "cap@test.com", nombre: "Captain 1", activo: true, cabildoId: "c1" },
    { id: "u2", email: "cap2@test.com", nombre: "Captain 2", activo: true, cabildoId: "c1" },
  ]),
  removeCaptain: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../contexts/CabildoContext", () => ({
  useCabildo: () => ({
    selectedId: "c1",
    list: [{ id: "c1", nombre: "Test" }],
  }),
}));

describe("CapitanasList", () => {
  it("renders captain list", async () => {
    render(<CapitanasList />);
    await waitFor(() => {
      expect(screen.getByText("Captain 1")).toBeInTheDocument();
      expect(screen.getByText("Captain 2")).toBeInTheDocument();
    });
  });

  it("disables unassign when only 1 captain", async () => {
    const { listCaptains } = await import("../../lib/api/admin");
    vi.mocked(listCaptains).mockResolvedValue([
      { id: "u1", email: "cap@test.com", nombre: "Only Captain", activo: true, cabildoId: "c1" },
    ]);

    render(<CapitanasList />);
    await waitFor(() => {
      expect(screen.getByText("Only Captain")).toBeInTheDocument();
    });

    const unassignBtn = screen.getByTestId("unassign-btn-u1");
    expect(unassignBtn).toBeDisabled();
  });
});
