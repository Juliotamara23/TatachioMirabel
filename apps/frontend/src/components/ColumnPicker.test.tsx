import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ColumnPicker } from "./ColumnPicker";

interface TestColumn {
  key: string;
  header: string;
}

const CATALOG: TestColumn[] = [
  { key: "nombres", header: "Nombres" },
  { key: "sexo", header: "Sexo" },
  { key: "acciones", header: "Acciones" },
];

const VISIBLE = ["nombres", "acciones"];

describe("ColumnPicker", () => {
  it("renders the gear button and keeps the list closed initially", () => {
    render(
      <ColumnPicker
        columns={CATALOG}
        visibleKeys={VISIBLE}
        onToggle={vi.fn()}
        onReset={vi.fn()}
        lockedKeys={["acciones"]}
      />,
    );
    expect(screen.getByTestId("column-picker")).toBeInTheDocument();
    expect(screen.queryByTestId("column-picker-menu")).not.toBeInTheDocument();
  });

  it("opens a checkbox list reflecting the visible keys", async () => {
    const user = userEvent.setup();
    render(
      <ColumnPicker
        columns={CATALOG}
        visibleKeys={VISIBLE}
        onToggle={vi.fn()}
        onReset={vi.fn()}
        lockedKeys={["acciones"]}
      />,
    );
    await user.click(screen.getByTestId("column-picker"));

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(3);
    expect(screen.getByRole("checkbox", { name: /nombres/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /sexo/i })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /acciones/i })).toBeChecked();
  });

  it("calls onToggle with the column key when a checkbox is clicked", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <ColumnPicker
        columns={CATALOG}
        visibleKeys={VISIBLE}
        onToggle={onToggle}
        onReset={vi.fn()}
        lockedKeys={["acciones"]}
      />,
    );
    await user.click(screen.getByTestId("column-picker"));
    await user.click(screen.getByRole("checkbox", { name: /sexo/i }));
    expect(onToggle).toHaveBeenCalledWith("sexo");
  });

  it("locks the acciones checkbox so it stays visible", async () => {
    const user = userEvent.setup();
    render(
      <ColumnPicker
        columns={CATALOG}
        visibleKeys={VISIBLE}
        onToggle={vi.fn()}
        onReset={vi.fn()}
        lockedKeys={["acciones"]}
      />,
    );
    await user.click(screen.getByTestId("column-picker"));
    expect(screen.getByRole("checkbox", { name: /acciones/i })).toBeDisabled();
  });

  it("calls onReset from the Restaurar button", async () => {
    const onReset = vi.fn();
    const user = userEvent.setup();
    render(
      <ColumnPicker
        columns={CATALOG}
        visibleKeys={VISIBLE}
        onToggle={vi.fn()}
        onReset={onReset}
        lockedKeys={["acciones"]}
      />,
    );
    await user.click(screen.getByTestId("column-picker"));
    await user.click(screen.getByTestId("column-picker-reset"));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
