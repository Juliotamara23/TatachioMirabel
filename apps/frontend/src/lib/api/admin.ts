import { apiFetch } from "./client";
import type { Captain } from "../../types/api";

export function listCaptains(cabildoId?: string): Promise<Captain[]> {
  const query = cabildoId ? `?cabildoId=${encodeURIComponent(cabildoId)}` : "";
  return apiFetch<Captain[]>(`/api/admin/captains${query}`);
}

export function assignCaptain(cabildoId: string, usuarioId: string): Promise<unknown> {
  return apiFetch(`/api/admin/cabildos/${cabildoId}/captains/${usuarioId}`, {
    method: "POST",
  });
}

export function removeCaptain(cabildoId: string, usuarioId: string): Promise<void> {
  return apiFetch<void>(`/api/admin/cabildos/${cabildoId}/captains/${usuarioId}`, {
    method: "DELETE",
  });
}
