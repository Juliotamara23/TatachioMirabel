import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Topbar } from "./Topbar";

// Mock CabildoContext
const mockSelect = vi.fn();
vi.mock("../contexts/CabildoContext", () => ({
  useCabildo: () => ({
    list: [
      { id: "c1", nombre: "Cabildo Uno", resguardo: "R1", comunidad: "Com1", vigencia: 2026 },
      { id: "c2", nombre: "Cabildo Dos", resguardo: "R2", comunidad: "Com2", vigencia: 2027 },
    ],
    selectedId: "c1",
    select: mockSelect,
  }),
}));

// Mock ThemeContext
const mockToggle = vi.fn();
vi.mock("../contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", toggle: mockToggle, set: vi.fn() }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock AuthContext
vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "admin@test.com", nombre: "Ana Pérez", rol: "ADMINISTRATOR" },
    logout: vi.fn(),
  }),
}));

function renderTopbar() {
  return render(<Topbar />);
}

describe("Topbar", () => {
  it("renders cabildo selector with available cabildos", () => {
    renderTopbar();
    const select = screen.getByTestId("cabildo-selector");
    expect(select).toBeInTheDocument();
    expect(screen.getByText("Cabildo Uno")).toBeInTheDocument();
    expect(screen.getByText("Cabildo Dos")).toBeInTheDocument();
  });

  it("calls select when cabildo changes", async () => {
    const user = userEvent.setup();
    renderTopbar();

    const select = screen.getByTestId("cabildo-selector");
    await user.selectOptions(select, "c2");

    expect(mockSelect).toHaveBeenCalledWith("c2");
  });

  it("renders dark mode toggle button", () => {
    renderTopbar();
    const toggle = screen.getByTestId("theme-toggle");
    expect(toggle).toBeInTheDocument();
  });

  it("calls toggle when theme button is clicked", async () => {
    const user = userEvent.setup();
    renderTopbar();

    await user.click(screen.getByTestId("theme-toggle"));
    expect(mockToggle).toHaveBeenCalled();
  });

  it("renders user avatar chip with initials and name", () => {
    renderTopbar();

    expect(screen.getByTestId("topbar-avatar")).toHaveTextContent("AP");
    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
  });
});
