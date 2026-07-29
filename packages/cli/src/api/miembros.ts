import { apiFetch } from "./client.js";

export async function listMiembros(
  baseUrl: string,
  token: string,
  params?: { search?: string; cabildoId?: string; rol?: string },
): Promise<unknown> {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set("search", params.search);
  if (params?.cabildoId) searchParams.set("cabildoId", params.cabildoId);
  if (params?.rol) searchParams.set("rol", params.rol);
  const query = searchParams.toString();
  const path = `/api/miembros${query ? `?${query}` : ""}`;
  return apiFetch(path, { method: "GET", baseUrl, token });
}

export async function getMiembro(
  baseUrl: string,
  token: string,
  id: string,
): Promise<unknown> {
  return apiFetch(`/api/miembros/${id}`, { method: "GET", baseUrl, token });
}

export async function createMiembro(
  baseUrl: string,
  token: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  return apiFetch("/api/miembros", { method: "POST", baseUrl, token, body: data });
}

export async function updateMiembro(
  baseUrl: string,
  token: string,
  id: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  return apiFetch(`/api/miembros/${id}`, { method: "PUT", baseUrl, token, body: data });
}
