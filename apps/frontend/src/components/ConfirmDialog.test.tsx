import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("renders dialog with title and message", () => {
    render(
      <ConfirmDialog
        open={true}
        title="Confirmar acción"
        message="¿Estás seguro de que quieres eliminar este miembro?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Confirmar acción")).toBeInTheDocument();
    expect(screen.getByText(/¿Estás seguro/)).toBeInTheDocument();
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        title="Eliminar"
        message="Esta acción no se puede deshacer."
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("confirm-btn"));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("calls onCancel when cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        title="Eliminar"
        message="¿Seguro?"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByTestId("cancel-btn"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("does not render when open is false", () => {
    const { container } = render(
      <ConfirmDialog
        open={false}
        title="Hidden"
        message="Should not appear"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(container.innerHTML).toBe("");
  });
});
