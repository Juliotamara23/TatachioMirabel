import { apiFetch } from "./client.js";

export async function listFamilias(
  baseUrl: string,
  token: string,
  params?: { search?: string; cabildoId?: string },
): Promise<unknown> {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set("search", params.search);
  if (params?.cabildoId) searchParams.set("cabildoId", params.cabildoId);
  const query = searchParams.toString();
  const path = `/api/familias${query ? `?${query}` : ""}`;
  return apiFetch(path, { method: "GET", baseUrl, token });
}

export async function getFamilia(
  baseUrl: string,
  token: string,
  id: string,
): Promise<unknown> {
  return apiFetch(`/api/familias/${id}`, { method: "GET", baseUrl, token });
}
