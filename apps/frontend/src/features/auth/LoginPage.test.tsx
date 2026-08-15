import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { LoginPage } from "./LoginPage";
import { AuthProvider } from "../../contexts/AuthContext";
import { CabildoProvider } from "../../contexts/CabildoContext";
import { ThemeProvider } from "../../contexts/ThemeContext";
import { apiFetch, ApiError } from "../../lib/api/client";

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

function renderLogin() {
  localStorage.clear();
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <ThemeProvider>
        <AuthProvider>
          <CabildoProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/dashboard" element={<div data-testid="dashboard">Dashboard</div>} />
              <Route path="*" element={<LocationDisplay />} />
            </Routes>
          </CabildoProvider>
        </AuthProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe("LoginPage (T8 — AUTH-SESSION-1)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("renders login form with email and password fields", () => {
    renderLogin();

    expect(screen.getByLabelText(/correo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ingresar/i })).toBeInTheDocument();
  });

  it("valid login navigates to /dashboard", async () => {
    const user = userEvent.setup();
    const mockResponse = { token: "tok", user: { id: "u1", email: "admin@test.com", nombre: "Admin", rol: "ADMINISTRATOR" } };
    vi.mocked(apiFetch).mockResolvedValueOnce(mockResponse);

    renderLogin();

    await user.type(screen.getByLabelText(/correo/i), "admin@test.com");
    await user.type(screen.getByLabelText(/contraseña/i), "password123");
    await user.click(screen.getByRole("button", { name: /ingresar/i }));

    await waitFor(() => {
      expect(screen.getByTestId("dashboard")).toBeInTheDocument();
    });
  });

  it("invalid credentials (401) shows error message", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(401, { error: "Invalid credentials" }));

    renderLogin();

    await user.type(screen.getByLabelText(/correo/i), "bad@test.com");
    await user.type(screen.getByLabelText(/contraseña/i), "wrong");
    await user.click(screen.getByRole("button", { name: /ingresar/i }));

    await waitFor(() => {
      expect(screen.getByText(/credenciales inválidas/i)).toBeInTheDocument();
    });

    // Should NOT navigate
    expect(screen.queryByTestId("dashboard")).not.toBeInTheDocument();
  });

  it("403 shows 'contact administrator' message", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(403, { error: "Contact administrator" }));

    renderLogin();

    await user.type(screen.getByLabelText(/correo/i), "captain@test.com");
    await user.type(screen.getByLabelText(/contraseña/i), "password");
    await user.click(screen.getByRole("button", { name: /ingresar/i }));

    await waitFor(() => {
      expect(screen.getByText(/contacte al administrador/i)).toBeInTheDocument();
    });
  });
});
