import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AlertCard } from "./AlertCard";

describe("AlertCard", () => {
  it("renders title and count", () => {
    render(<AlertCard title="Edades extremas" count={5} />);

    expect(screen.getByText("Edades extremas")).toBeInTheDocument();
    expect(screen.getByTestId("alert-count")).toHaveTextContent("5");
  });

  it("renders items list when provided", () => {
    render(<AlertCard title="Alertas" count={2} items={["Juan", "María"]} />);

    const items = screen.getAllByTestId("alert-item");
    expect(items).toHaveLength(2);
    expect(screen.getByText("Juan")).toBeInTheDocument();
  });

  it("truncates items list at 10 with overflow indicator", () => {
    const manyItems = Array.from({ length: 15 }, (_, i) => `Item ${i + 1}`);
    render(<AlertCard title="Alertas" count={15} items={manyItems} />);

    const items = screen.getAllByTestId("alert-item");
    expect(items).toHaveLength(10);
    expect(screen.getByText("+5 más...")).toBeInTheDocument();
  });

  it("does not render items when count is 0", () => {
    render(<AlertCard title="Sin alertas" count={0} items={["test"]} />);
    expect(screen.queryByTestId("alert-item")).not.toBeInTheDocument();
  });
});
