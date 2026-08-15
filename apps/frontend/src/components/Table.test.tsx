import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Table } from "./Table";

interface TestRow {
  id: string;
  name: string;
  value: number;
}

const columns = [
  { key: "name", header: "Nombre", render: (row: TestRow) => row.name },
  { key: "value", header: "Valor", render: (row: TestRow) => String(row.value) },
];

const rows: TestRow[] = [
  { id: "1", name: "Alpha", value: 10 },
  { id: "2", name: "Beta", value: 20 },
  { id: "3", name: "Gamma", value: 30 },
];

describe("Table", () => {
  it("renders empty state when no rows", () => {
    render(<Table columns={columns} rows={[]} />);
    expect(screen.getByText("Sin datos")).toBeInTheDocument();
  });

  it("renders custom empty message", () => {
    render(<Table columns={columns} rows={[]} emptyMessage="No hay registros" />);
    expect(screen.getByText("No hay registros")).toBeInTheDocument();
  });

  it("renders column headers", () => {
    render(<Table columns={columns} rows={rows} />);
    expect(screen.getByText("Nombre")).toBeInTheDocument();
    expect(screen.getByText("Valor")).toBeInTheDocument();
  });

  it("renders virtual table container", () => {
    render(<Table columns={columns} rows={rows} />);
    expect(screen.getByTestId("virtual-table")).toBeInTheDocument();
  });
});
