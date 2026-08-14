import type { ApiError } from "./client.js";

export interface CensoDescarga {
  buffer: Buffer;
  nombre: string;
}

const CONTENT_DISPOSITION_FILENAME_REGEX = /filename\*?=(?:UTF-8''|")?([^";]+)/i;

/**
 * Extrae el nombre de archivo del header Content-Disposition que Express
 * genera con res.download: `attachment; filename="censo-2026.xlsx"`.
 */
export function extraerNombreArchivo(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;
  const match = CONTENT_DISPOSITION_FILENAME_REGEX.exec(contentDisposition);
  return match ? match[1] : null;
}

/**
 * Descarga el censo ministerial (binario) del backend. Igual convención de
 * errores que apiFetch (ApiError con status), pero con fetch directo porque
 * apiFetch parsea JSON/texto y aquí necesitamos el Buffer.
 */
export async function descargarCenso(baseUrl: string, token: string): Promise<CensoDescarga> {
  const response = await fetch(`${baseUrl}/api/reportes/censo.xlsx`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const error = new Error("API request failed") as ApiError;
    error.status = response.status;
    error.body = await response.text();
    throw error;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const nombre =
    extraerNombreArchivo(response.headers.get("content-disposition")) ??
    `censo-${new Date().getFullYear()}.xlsx`;
  return { buffer, nombre };
}
