import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { ProtectedRoute, AdminRoute } from "./ProtectedRoute";
import { AuthProvider } from "../../contexts/AuthContext";
import type { AuthUser } from "../../types/api";

// Mock api client to avoid real fetches
vi.mock("../../lib/api/client", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    apiFetch: vi.fn(),
    setTokenProvider: vi.fn(),
    setUnauthorizedHandler: vi.fn(),
  };
});

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderWithAuth(ui: React.ReactNode, { authStorage }: { authStorage?: unknown } = {}) {
  if (authStorage) {
    localStorage.setItem("tatachio:auth", JSON.stringify(authStorage));
  } else {
    localStorage.clear();
  }

  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <AuthProvider>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={ui} />
          </Route>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route path="*" element={<LocationDisplay />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute (T7 — AUTH-SESSION-2)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("redirects to /login when not authenticated", async () => {
    renderWithAuth(<div data-testid="protected-content">Dashboard</div>);

    // Should redirect to /login (which shows "Login Page")
    await vi.waitFor(() => {
      expect(screen.getByText("Login Page")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
  });

  it("renders protected content when authenticated", async () => {
    const auth = { token: "tok", user: { id: "u1", email: "a@b.com", nombre: "Test", rol: "ADMINISTRATOR" as const } };

    renderWithAuth(<div data-testid="protected-content">Dashboard</div>, { authStorage: auth });

    await vi.waitFor(() => {
      expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    });
  });
});

describe("AdminRoute (T7)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function renderAdminRoute(ui: React.ReactNode, user: AuthUser) {
    localStorage.setItem("tatachio:auth", JSON.stringify({ token: "tok", user }));

    return render(
      <MemoryRouter initialEntries={["/admin"]}>
        <AuthProvider>
          <Routes>
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={ui} />
            </Route>
            <Route path="*" element={<div data-testid="fallback">fallback</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
  }

  it("renders content for ADMINISTRATOR", async () => {
    const admin = { id: "u1", email: "a@b.com", nombre: "Admin", rol: "ADMINISTRATOR" as const };
    renderAdminRoute(<div data-testid="admin-content">Admin Page</div>, admin);

    await vi.waitFor(() => {
      expect(screen.getByTestId("admin-content")).toBeInTheDocument();
    });
  });

  it("shows 403 for CAPTAIN users", async () => {
    const captain = { id: "u2", email: "c@d.com", nombre: "Cap", rol: "CAPTAIN" as const };
    renderAdminRoute(<div data-testid="admin-content">Admin Page</div>, captain);

    await vi.waitFor(() => {
      expect(screen.getByText(/403/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("admin-content")).not.toBeInTheDocument();
  });
});
