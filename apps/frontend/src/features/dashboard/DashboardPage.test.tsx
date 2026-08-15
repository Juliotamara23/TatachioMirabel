import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { KpiCard } from "../../components/KpiCard";
import { AlertCard } from "../../components/AlertCard";

// T9: DASHBOARD-1 — KpiCards renders given data
describe("KpiCard", () => {
  it("renders label and value", () => {
    render(<KpiCard label="Miembros Activos" value={42} />);
    expect(screen.getByText("Miembros Activos")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-value")).toHaveTextContent("42");
  });

  it("renders with icon", () => {
    render(<KpiCard label="Familias" value={15} icon="👨‍👩‍👧‍👦" />);
    expect(screen.getByText("👨‍👩‍👧‍👦")).toBeInTheDocument();
  });
});

// T10: DASHBOARD-2 — AlertCards shows count+list
describe("AlertCard", () => {
  it("renders title and count", () => {
    render(<AlertCard title="Edad extrema" count={3} />);
    expect(screen.getByText("Edad extrema")).toBeInTheDocument();
    expect(screen.getByTestId("alert-count")).toHaveTextContent("3");
  });

  it("renders items list when provided", () => {
    const items = ["JUAN PEREZ (105 años)", "MARIA GONZALEZ (102 años)"];
    render(<AlertCard title="Edad extrema" count={2} items={items} />);
    const alertItems = screen.getAllByTestId("alert-item");
    expect(alertItems).toHaveLength(2);
    expect(alertItems[0]).toHaveTextContent("JUAN PEREZ (105 años)");
  });

  it("shows overflow indicator when items > 10", () => {
    const items = Array.from({ length: 15 }, (_, i) => `Item ${i}`);
    render(<AlertCard title="Test" count={15} items={items} />);
    expect(screen.getByText("+5 más...")).toBeInTheDocument();
  });

  it("shows empty state when count is 0", () => {
    render(<AlertCard title="Alertas" count={0} items={[]} />);
    expect(screen.getByTestId("alert-count")).toHaveTextContent("0");
    expect(screen.queryByTestId("alert-item")).not.toBeInTheDocument();
  });
});
