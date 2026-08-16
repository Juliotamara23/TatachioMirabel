import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { KpiCard } from "./KpiCard";
import { UsersIcon } from "./icons";

describe("KpiCard", () => {
  it("renders label and value", () => {
    render(<KpiCard label="Miembros Activos" value={42} />);

    expect(screen.getByText("Miembros Activos")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-value")).toHaveTextContent("42");
  });

  it("renders icon chip when icon provided", () => {
    render(<KpiCard label="Familias" value={10} icon={<UsersIcon />} />);

    expect(screen.getByTestId("kpi-icon")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-icon").querySelector("svg")).toBeInTheDocument();
  });

  it("does not render icon chip when icon omitted", () => {
    render(<KpiCard label="Familias" value={10} />);

    expect(screen.queryByTestId("kpi-icon")).not.toBeInTheDocument();
  });

  it("applies tone classes to the icon chip", () => {
    const { container } = render(
      <KpiCard label="Test" value={1} icon={<UsersIcon />} tone="green" />,
    );
    const chip = screen.getByTestId("kpi-icon");
    expect(chip).toHaveClass("bg-green-brand/10");
    expect(container.firstChild).toHaveClass("border-green-brand/20");
  });
});
