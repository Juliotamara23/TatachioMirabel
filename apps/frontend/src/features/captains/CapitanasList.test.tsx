import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { CapitanasList } from "./CapitanasList";
import { ToastProvider } from "../../contexts/ToastContext";
import { ApiError } from "../../lib/api/client";

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

const { listCaptains, removeCaptain } = await import("../../lib/api/admin");

function renderList() {
  return render(
    <ToastProvider>
      <CapitanasList />
    </ToastProvider>,
  );
}

describe("CapitanasList", () => {
  it("renders captain list", async () => {
    renderList();
    await waitFor(() => {
      expect(screen.getByText("Captain 1")).toBeInTheDocument();
      expect(screen.getByText("Captain 2")).toBeInTheDocument();
    });
  });

  it("disables unassign when only 1 captain", async () => {
    vi.mocked(listCaptains).mockResolvedValueOnce([
      { id: "u1", email: "cap@test.com", nombre: "Only Captain", activo: true, cabildoId: "c1" },
    ]);

    renderList();
    await waitFor(() => {
      expect(screen.getByText("Only Captain")).toBeInTheDocument();
    });

    const unassignBtn = screen.getByTestId("unassign-btn-u1");
    expect(unassignBtn).toBeDisabled();
  });

  it("removes a captain with a success toast (TOAST-2)", async () => {
    const user = userEvent.setup();
    renderList();
    await waitFor(() => {
      expect(screen.getByText("Captain 1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("unassign-btn-u1"));
    await user.click(within(screen.getByTestId("confirm-dialog")).getByTestId("confirm-btn"));

    await waitFor(() => {
      expect(removeCaptain).toHaveBeenCalledWith("c1", "u1");
    });
    expect(await screen.findByText("Capitana removida correctamente")).toBeInTheDocument();
  });

  it("shows the 409 server message as an error toast when removing the last captain (TOAST-2)", async () => {
    const user = userEvent.setup();
    vi.mocked(removeCaptain).mockRejectedValueOnce(
      new ApiError(409, { error: "El cabildo debe tener al menos una capitana" }),
    );
    renderList();
    await waitFor(() => {
      expect(screen.getByText("Captain 1")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("unassign-btn-u1"));
    await user.click(within(screen.getByTestId("confirm-dialog")).getByTestId("confirm-btn"));

    expect(
      await screen.findByText("El cabildo debe tener al menos una capitana"),
    ).toBeInTheDocument();
  });
});
