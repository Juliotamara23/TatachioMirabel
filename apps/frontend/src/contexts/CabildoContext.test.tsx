import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { CabildoProvider, useCabildo } from "./CabildoContext";
import { AuthProvider } from "./AuthContext";
import { apiFetch } from "../lib/api/client";
import type { Cabildo } from "../types/api";

vi.mock("../lib/api/client", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    apiFetch: vi.fn(),
    setTokenProvider: vi.fn(),
    setUnauthorizedHandler: vi.fn(),
  };
});

const CABILDOS: Cabildo[] = [
  { id: "c1", nombre: "Cabildo 1", resguardo: "R1", comunidad: "Com1", vigencia: 2024 },
  { id: "c2", nombre: "Cabildo 2", resguardo: "R2", comunidad: "Com2", vigencia: 2025 },
];

describe("CabildoContext (T5 — CC-4)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    // Default mock: return empty list
    vi.mocked(apiFetch).mockResolvedValue(CABILDOS);
    // Pre-seed auth so AuthProvider resolves to 'authed' (CabildoProvider requires it)
    localStorage.setItem(
      "tatachio:auth",
      JSON.stringify({ token: "test-token", user: { id: "u1", email: "a@b.com", nombre: "Test", rol: "ADMINISTRATOR" } }),
    );
  });

  // Combined wrapper: CabildoProvider needs AuthProvider (it waits for auth)
  function wrapper({ children }: { children: React.ReactNode }) {
    return (
      <AuthProvider>
        <CabildoProvider>{children}</CabildoProvider>
      </AuthProvider>
    );
  }

  it("fetches cabildos list and provides it", async () => {
    const { result } = renderHook(() => useCabildo(), { wrapper });

    await vi.waitFor(() => {
      expect(result.current.list).toHaveLength(2);
    });

    expect(result.current.list[0].nombre).toBe("Cabildo 1");
  });

  it("select persists to localStorage (CC-4)", async () => {
    const { result } = renderHook(() => useCabildo(), { wrapper });

    await vi.waitFor(() => {
      expect(result.current.list).toHaveLength(2);
    });

    act(() => {
      result.current.select("c1");
    });

    expect(result.current.selectedId).toBe("c1");
    expect(localStorage.getItem("tatachio:cabildoId")).toBe("c1");
  });

  it("restores selection from localStorage on mount", async () => {
    localStorage.setItem("tatachio:cabildoId", "c2");

    const { result } = renderHook(() => useCabildo(), { wrapper });

    await vi.waitFor(() => {
      expect(result.current.list).toHaveLength(2);
    });

    expect(result.current.selectedId).toBe("c2");
  });

  it("refresh re-fetches the cabildo list", async () => {
    const { result } = renderHook(() => useCabildo(), { wrapper });

    await vi.waitFor(() => {
      expect(result.current.list).toHaveLength(2);
    });

    const updatedList = [...CABILDOS, { id: "c3", nombre: "Cabildo 3", resguardo: "R3", comunidad: "Com3", vigencia: 2026 }];
    vi.mocked(apiFetch).mockResolvedValueOnce(updatedList);

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.list).toHaveLength(3);
  });
});
