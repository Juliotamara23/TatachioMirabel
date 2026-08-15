import { apiFetch } from "./client";
import type { MemberInput } from "@tatachio/shared";

// Member shape returned by GET /api/miembros (includes familia relation)
export interface Miembro {
  id: string;
  tipoIdentificacion: string;
  numeroDocumento: string;
  nombres: string;
  apellidos: string;
  fechaNacimiento: string;
  parentesco: string;
  sexo: string;
  estadoCivil?: string | null;
  profesion?: string | null;
  escolaridad?: string | null;
  integrantes: number;
  direccion?: string | null;
  telefono?: string | null;
  novedad?: string | null;
  familiaId: string;
  cabildoId: string;
  estado?: string;
  familia?: {
    id: string;
    numero: number;
    direccion?: string | null;
  };
}

export interface MiembroListParams {
  search?: string;
  cabildoId?: string;
}

export function listMiembros(params?: MiembroListParams): Promise<Miembro[]> {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set("search", params.search);
  if (params?.cabildoId) searchParams.set("cabildoId", params.cabildoId);
  const query = searchParams.toString();
  return apiFetch<Miembro[]>(`/api/miembros${query ? `?${query}` : ""}`);
}

export function getMiembro(id: string): Promise<Miembro> {
  return apiFetch<Miembro>(`/api/miembros/${id}`);
}

export function createMiembro(data: MemberInput): Promise<Miembro> {
  return apiFetch<Miembro>("/api/miembros", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateMiembro(id: string, data: Partial<MemberInput>): Promise<Miembro> {
  return apiFetch<Miembro>(`/api/miembros/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteMiembro(id: string): Promise<void> {
  return apiFetch<void>(`/api/miembros/${id}`, { method: "DELETE" });
}
