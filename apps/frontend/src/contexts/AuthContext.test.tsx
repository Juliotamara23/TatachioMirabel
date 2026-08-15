import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "./AuthContext";
import { apiFetch, ApiError, setTokenProvider } from "../lib/api/client";

// Mock the api client module, keeping ApiError as the real class
vi.mock("../lib/api/client", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    apiFetch: vi.fn(),
    setTokenProvider: vi.fn(),
    setUnauthorizedHandler: vi.fn(),
  };
});

describe("AuthContext (T4 — CC-3)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  function wrapper({ children }: { children: React.ReactNode }) {
    return <AuthProvider>{children}</AuthProvider>;
  }

  it("resolves to anon if no stored token", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    // After useEffect resolves (boot → anon)
    await vi.waitFor(() => {
      expect(result.current.status).toBe("anon");
    });

    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
  });

  it("restores auth from localStorage on boot (CC-3 round-trip)", async () => {
    const stored = { token: "saved-token", user: { id: "u1", email: "a@b.com", nombre: "Test", rol: "ADMINISTRATOR" as const } };
    localStorage.setItem("tatachio:auth", JSON.stringify(stored));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await vi.waitFor(() => {
      expect(result.current.status).toBe("authed");
    });

    expect(result.current.token).toBe("saved-token");
    expect(result.current.user?.email).toBe("a@b.com");
  });

  it("login stores token+user in localStorage and sets authed status", async () => {
    const mockResponse = { token: "new-token", user: { id: "u2", email: "x@y.com", nombre: "Admin", rol: "ADMINISTRATOR" } };
    vi.mocked(apiFetch).mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await vi.waitFor(() => {
      expect(result.current.status).toBe("anon");
    });

    await act(async () => {
      await result.current.login("email@test.com", "password");
    });

    expect(result.current.status).toBe("authed");
    expect(result.current.token).toBe("new-token");

    // Verify localStorage write (CC-3)
    const stored = JSON.parse(localStorage.getItem("tatachio:auth")!);
    expect(stored.token).toBe("new-token");
    expect(stored.user.email).toBe("x@y.com");
  });

  it("does NOT write to localStorage on login error", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(401, { error: "Invalid" }));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await vi.waitFor(() => {
      expect(result.current.status).toBe("anon");
    });

    await act(async () => {
      await expect(result.current.login("bad@test.com", "wrong")).rejects.toThrow();
    });

    expect(localStorage.getItem("tatachio:auth")).toBeNull();
    expect(result.current.status).toBe("anon");
  });

  it("logout clears localStorage and token provider", async () => {
    const stored = { token: "t", user: { id: "u1", email: "a@b.com", nombre: "Test", rol: "ADMINISTRATOR" as const } };
    localStorage.setItem("tatachio:auth", JSON.stringify(stored));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await vi.waitFor(() => {
      expect(result.current.status).toBe("authed");
    });

    act(() => {
      result.current.logout();
    });

    expect(result.current.status).toBe("anon");
    expect(result.current.token).toBeNull();
    expect(localStorage.getItem("tatachio:auth")).toBeNull();
    expect(setTokenProvider).toHaveBeenCalledWith(null);
  });
});
