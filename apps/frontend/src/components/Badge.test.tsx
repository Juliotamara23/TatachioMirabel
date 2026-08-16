import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Badge, estadoBadgeTone } from "./Badge";

describe("Badge", () => {
  it("renders children", () => {
    render(<Badge tone="success">ACTIVO</Badge>);
    expect(screen.getByText("ACTIVO")).toBeInTheDocument();
  });

  it("applies success tone classes", () => {
    const { container } = render(<Badge tone="success">ACTIVO</Badge>);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain("bg-green-100");
    expect(badge.className).toContain("text-green-700");
    expect(badge.className).toContain("dark:bg-green-900/30");
  });

  it("applies warning tone classes", () => {
    const { container } = render(<Badge tone="warning">PENDIENTE</Badge>);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain("bg-amber-100");
    expect(badge.className).toContain("text-amber-700");
  });

  it("applies danger tone classes", () => {
    const { container } = render(<Badge tone="danger">BAJA</Badge>);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain("bg-red-100");
    expect(badge.className).toContain("text-red-700");
  });

  it("renders pill styling", () => {
    const { container } = render(<Badge tone="success">OK</Badge>);
    expect((container.firstChild as HTMLElement).className).toContain("rounded-full");
  });
});

describe("estadoBadgeTone", () => {
  it("maps ACTIVO to success", () => {
    expect(estadoBadgeTone("ACTIVO")).toBe("success");
  });

  it("maps PENDIENTE to warning", () => {
    expect(estadoBadgeTone("PENDIENTE")).toBe("warning");
  });

  it("maps BAJA to danger", () => {
    expect(estadoBadgeTone("BAJA")).toBe("danger");
  });

  it("falls back to warning for unknown estados", () => {
    expect(estadoBadgeTone("DESCONOCIDO")).toBe("warning");
    expect(estadoBadgeTone("")).toBe("warning");
  });
});
