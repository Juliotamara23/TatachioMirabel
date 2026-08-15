import { apiFetch } from "./client";
import type { CabildoInput } from "@tatachio/shared";
import type { Cabildo } from "../../types/api";

export function listCabildos(): Promise<Cabildo[]> {
  return apiFetch<Cabildo[]>("/api/cabildos");
}

export function getCabildo(id: string): Promise<Cabildo> {
  return apiFetch<Cabildo>(`/api/cabildos/${id}`);
}

export function createCabildo(data: CabildoInput): Promise<Cabildo> {
  return apiFetch<Cabildo>("/api/cabildos", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateCabildo(id: string, data: Partial<CabildoInput>): Promise<Cabildo> {
  return apiFetch<Cabildo>(`/api/cabildos/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteCabildo(id: string): Promise<void> {
  return apiFetch<void>(`/api/cabildos/${id}`, { method: "DELETE" });
}
