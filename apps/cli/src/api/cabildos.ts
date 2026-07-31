import { apiFetch } from "./client.js";

export async function listCabildos(
  baseUrl: string,
  token: string,
): Promise<unknown> {
  const path = "/api/cabildos";
  return apiFetch(path, { method: "GET", baseUrl, token });
}

export async function getCabildo(
  baseUrl: string,
  token: string,
  id: string,
): Promise<unknown> {
  return apiFetch(`/api/cabildos/${id}`, { method: "GET", baseUrl, token });
}
