import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AppShell } from "./AppShell";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Mock AuthContext
vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "admin@test.com", nombre: "Test Admin", rol: "ADMINISTRATOR" },
    logout: vi.fn(),
    token: "test-token",
    status: "authed",
  }),
}));

// Mock CabildoContext
vi.mock("../contexts/CabildoContext", () => ({
  useCabildo: () => ({
    list: [{ id: "c1", nombre: "Test Cabildo" }],
    selectedId: "c1",
    select: vi.fn(),
  }),
}));

// Mock ThemeContext
vi.mock("../contexts/ThemeContext", () => ({
  useTheme: () => ({
    theme: "light",
    toggle: vi.fn(),
    set: vi.fn(),
  }),
}));

function renderWithRouter(initialEntries = ["/dashboard"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<div>Dashboard Content</div>} />
          <Route path="/miembros" element={<div>Miembros Content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("AppShell", () => {
  it("renders sidebar with navigation items", () => {
    renderWithRouter();

    expect(screen.getByText("Tatachio Mirabel")).toBeInTheDocument();
    // Name renders in the sidebar header and the topbar avatar chip.
    expect(screen.getAllByText("Test Admin").length).toBeGreaterThan(0);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Miembros")).toBeInTheDocument();
    expect(screen.getByText("Familias")).toBeInTheDocument();
    expect(screen.getByText("Cabildos")).toBeInTheDocument();
    expect(screen.getByText("Capitanas")).toBeInTheDocument();
    expect(screen.getByText("Chat")).toBeInTheDocument();
    expect(screen.getByText("Reportes")).toBeInTheDocument();
  });

  it("renders Topbar with cabildo selector", () => {
    renderWithRouter();
    expect(screen.getByTestId("cabildo-selector")).toBeInTheDocument();
  });

  it("renders page content via Outlet", () => {
    renderWithRouter();
    expect(screen.getByText("Dashboard Content")).toBeInTheDocument();
  });

  it("renders logout button", () => {
    renderWithRouter();
    expect(screen.getByText("Cerrar sesión")).toBeInTheDocument();
  });
});
