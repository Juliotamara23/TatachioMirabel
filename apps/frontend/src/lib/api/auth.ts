import { apiFetch } from "./client";
import type { AuthPayload } from "../../types/api";

export interface RegisterInput {
  email: string;
  password: string;
  nombre: string;
  rol: "CAPTAIN";
  cabildoId?: string;
}

export function login(email: string, password: string): Promise<AuthPayload> {
  return apiFetch<AuthPayload>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function register(data: RegisterInput): Promise<unknown> {
  return apiFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
