import { getApiBaseUrl } from "../env";
import { ApiError } from "./client";

/**
 * Downloads the censo Excel report as a blob.
 * Parses Content-Disposition for filename; falls back to `censo-YYYY.xlsx`.
 * When `cabildoId` is provided, the request is scoped to that cabildo (XLSX-4);
 * the backend then returns a slugged `censo-<cabildo>-<year>.xlsx` filename.
 */
export async function downloadCenso(token: string, cabildoId?: string): Promise<void> {
  const base = getApiBaseUrl();
  const query = cabildoId ? `?cabildoId=${encodeURIComponent(cabildoId)}` : "";
  const res = await fetch(`${base}/api/reportes/censo.xlsx${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const contentType = res.headers.get("Content-Type") ?? "";
    let body: { error: string };
    if (contentType.includes("application/json")) {
      try {
        body = (await res.json()) as { error: string };
      } catch {
        body = { error: `HTTP ${res.status}` };
      }
    } else {
      body = { error: `HTTP ${res.status}` };
    }
    throw new ApiError(res.status, body);
  }

  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") ?? "";
  const filenameMatch = /filename="?([^";\s]+)"?/.exec(disposition);
  const filename = filenameMatch?.[1] ?? `censo-${new Date().getFullYear()}.xlsx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
