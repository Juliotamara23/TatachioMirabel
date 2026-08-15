import { apiFetch } from "./client";
import type { FamiliaInput } from "@tatachio/shared";

export interface Familia {
  id: string;
  numero: number;
  direccion?: string | null;
  telefono?: string | null;
  cabildoId: string;
}

export interface FamiliaListParams {
  search?: string;
  cabildoId?: string;
}

export function listFamilias(params?: FamiliaListParams): Promise<Familia[]> {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set("search", params.search);
  if (params?.cabildoId) searchParams.set("cabildoId", params.cabildoId);
  const query = searchParams.toString();
  return apiFetch<Familia[]>(`/api/familias${query ? `?${query}` : ""}`);
}

export function getFamilia(id: string): Promise<Familia> {
  return apiFetch<Familia>(`/api/familias/${id}`);
}

export function createFamilia(data: FamiliaInput): Promise<Familia> {
  return apiFetch<Familia>("/api/familias", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateFamilia(id: string, data: Partial<FamiliaInput>): Promise<Familia> {
  return apiFetch<Familia>(`/api/familias/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteFamilia(id: string): Promise<void> {
  return apiFetch<void>(`/api/familias/${id}`, { method: "DELETE" });
}
