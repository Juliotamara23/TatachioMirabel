import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { apiFetch, setTokenProvider, setUnauthorizedHandler, ApiError } from "../lib/api/client";
import type { AuthUser, AuthPayload } from "../types/api";

const AUTH_STORAGE_KEY = "tatachio:auth";

type AuthStatus = "boot" | "authed" | "anon";

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

function readStoredAuth(): AuthPayload | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthPayload;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("boot");

  // Restore from localStorage on mount
  useEffect(() => {
    const stored = readStoredAuth();
    if (stored?.token && stored.user) {
      setToken(stored.token);
      setUser(stored.user);
      setTokenProvider(() => stored.token);
      setStatus("authed");
    } else {
      setStatus("anon");
    }
  }, []);

  // Register 401 handler: on 401, logout and redirect
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setUser(null);
      localStorage.removeItem(AUTH_STORAGE_KEY);
      setTokenProvider(null);
      setStatus("anon");
      // Navigation is handled by the App via status change
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    // Optimistic: clear any stale state
    const response = await apiFetch<AuthPayload>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    // Only persist on success (never on error — CC-3)
    setToken(response.token);
    setUser(response.user);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: response.token, user: response.user }));
    setTokenProvider(() => response.token);
    setStatus("authed");
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setTokenProvider(null);
    setStatus("anon");
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, status, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

// Re-export ApiError for use in tests
export { ApiError };
