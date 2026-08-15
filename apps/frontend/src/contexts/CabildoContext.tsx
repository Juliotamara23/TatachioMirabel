import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { apiFetch } from "../lib/api/client";
import { useAuth } from "./AuthContext";
import type { Cabildo } from "../types/api";

const CABILDO_STORAGE_KEY = "tatachio:cabildoId";

interface CabildoState {
  list: Cabildo[];
  selectedId: string | null;
  refresh: () => Promise<void>;
  select: (id: string) => void;
}

const CabildoContext = createContext<CabildoState | null>(null);

function readStoredCabildoId(): string | null {
  return localStorage.getItem(CABILDO_STORAGE_KEY);
}

export function CabildoProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [list, setList] = useState<Cabildo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const cabildos = await apiFetch<Cabildo[]>("/api/cabildos");
      setList(cabildos);
    } catch {
      // Silently fail — the UI can show an empty state
      setList([]);
    }
  }, []);

  // Fetch cabildos when auth resolves to authed
  useEffect(() => {
    if (status === "authed") {
      const stored = readStoredCabildoId();
      if (stored) setSelectedId(stored);
      refresh();
    }
  }, [status, refresh]);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    localStorage.setItem(CABILDO_STORAGE_KEY, id);
  }, []);

  return (
    <CabildoContext.Provider value={{ list, selectedId, refresh, select }}>
      {children}
    </CabildoContext.Provider>
  );
}

export function useCabildo(): CabildoState {
  const ctx = useContext(CabildoContext);
  if (!ctx) throw new Error("useCabildo must be used within CabildoProvider");
  return ctx;
}
