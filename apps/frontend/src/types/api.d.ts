// Re-export types from @tatachio/shared for the frontend.
// NEVER import from @tatachio/shared/node — it pulls in node:os/node:path.
export type { MemberInput, CabildoInput, FamiliaInput } from "@tatachio/shared";

// User shape returned by POST /api/auth/login
export interface AuthUser {
  id: string;
  email: string;
  nombre: string;
  rol: "ADMINISTRATOR" | "CAPTAIN";
}

// Auth payload persisted to localStorage
export interface AuthPayload {
  token: string;
  user: AuthUser;
}

// Cabildo shape (extends shared cabildoSchema with id)
export interface Cabildo {
  id: string;
  nombre: string;
  resguardo: string;
  comunidad: string;
  vigencia: number;
}

// Error envelope from the backend (CC-2)
export interface ApiErrorBody {
  error: string;
  retryAfter?: number;
  details?: unknown;
}

// Captain flat shape (admin controller)
export interface Captain {
  id: string;
  email: string;
  nombre: string;
  activo: boolean;
  cabildoId: string;
}
