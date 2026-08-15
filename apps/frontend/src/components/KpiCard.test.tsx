import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { KpiCard } from "./KpiCard";

describe("KpiCard", () => {
  it("renders label and value", () => {
    render(<KpiCard label="Miembros Activos" value={42} />);

    expect(screen.getByText("Miembros Activos")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-value")).toHaveTextContent("42");
  });

  it("renders icon when provided", () => {
    render(<KpiCard label="Familias" value={10} icon="👨‍👩‍👧‍👦" />);

    expect(screen.getByText("👨‍👩‍👧‍👦")).toBeInTheDocument();
  });

  it("applies tone classes", () => {
    const { container } = render(<KpiCard label="Test" value={1} tone="success" />);
    expect(container.firstChild).toHaveClass("border-green-brand/30");
  });
});
