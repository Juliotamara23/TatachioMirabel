import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
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

function gridTemplateOf(el: HTMLElement): string | undefined {
  return el.style.gridTemplateColumns;
}

// jsdom reports 0 for offset dimensions, so the virtualizer would render 0
// rows. Give elements a viewport size so virtualization produces a bounded
// visible range (same approach as the design's "virtualization bounds DOM").
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get: () => 600,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => 800,
  });
});

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

  it("header and first row share the exact same gridTemplateColumns string", () => {
    const { container } = render(<Table columns={columns} rows={rows} />);
    const header = screen.getByTestId("table-header");
    const firstRow = container.querySelector('[data-testid="table-row"]') as HTMLElement;

    expect(header).toBeInTheDocument();
    expect(firstRow).not.toBeNull();
    expect(gridTemplateOf(header)).toBe("minmax(140px, 1fr) minmax(140px, 1fr)");
    expect(gridTemplateOf(header)).toBe(gridTemplateOf(firstRow));
  });

  it("honors per-column widths in the shared grid template", () => {
    const wideColumns = [
      { key: "name", header: "Nombre", width: "200px", render: (row: TestRow) => row.name },
      { key: "value", header: "Valor", width: "100px", render: (row: TestRow) => String(row.value) },
    ];
    const { container } = render(<Table columns={wideColumns} rows={rows} />);
    const header = screen.getByTestId("table-header");
    const firstRow = container.querySelector('[data-testid="table-row"]') as HTMLElement;

    expect(gridTemplateOf(header)).toBe("200px 100px");
    expect(gridTemplateOf(header)).toBe(gridTemplateOf(firstRow));
  });

  it("renders a sticky header inside the scroll container", () => {
    render(<Table columns={columns} rows={rows} />);
    const header = screen.getByTestId("table-header");
    expect(header.className).toContain("sticky");
    expect(header.className).toContain("top-0");
    expect(header.className).toContain("z-10");
    // Header lives INSIDE the scroll container so it scrolls with the body.
    const scrollContainer = screen.getByTestId("virtual-table");
    expect(scrollContainer.contains(header)).toBe(true);
  });

  it("keeps DOM rows bounded when many rows are rendered (virtualization)", () => {
    const manyRows: TestRow[] = Array.from({ length: 5000 }, (_, i) => ({
      id: String(i),
      name: `Row ${i}`,
      value: i,
    }));
    const { container } = render(<Table columns={columns} rows={manyRows} />);
    const rowCount = container.querySelectorAll('[data-testid="table-row"]').length;
    expect(rowCount).toBeLessThan(100);
    expect(rowCount).toBeGreaterThan(0);
  });
});
