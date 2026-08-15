import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PlaceholderPage } from "./PlaceholderPage";

describe("PlaceholderPage", () => {
  it("renders title and placeholder message", () => {
    render(<PlaceholderPage title="Test Section" />);

    expect(screen.getByText("Test Section")).toBeInTheDocument();
    expect(screen.getByText(/disponible/)).toBeInTheDocument();
  });
});
