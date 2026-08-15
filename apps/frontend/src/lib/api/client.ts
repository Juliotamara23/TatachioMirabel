import { getApiBaseUrl } from "../env";
import type { ApiErrorBody } from "../../types/api";

export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type TokenProvider = () => string | null;
type UnauthorizedHandler = () => void;

let tokenProvider: TokenProvider | null = null;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setTokenProvider(provider: TokenProvider | null): void {
  tokenProvider = provider;
}

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = getApiBaseUrl();
  const url = `${base}${path}`;

  // Build headers as plain Record for testability and compatibility
  const headers: Record<string, string> = {};
  if (init.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((value, key) => { headers[key] = value; });
    } else if (Array.isArray(init.headers)) {
      for (const [key, value] of init.headers) { headers[key] = value; }
    } else {
      Object.assign(headers, init.headers);
    }
  }

  if (tokenProvider) {
    const token = tokenProvider();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }
  // Default to JSON content-type when body is present
  if (init.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, { ...init, headers });

  if (!response.ok) {
    const contentType = response.headers.get("Content-Type") ?? "";
    let body: ApiErrorBody;

    if (contentType.includes("application/json")) {
      try {
        body = await response.json() as ApiErrorBody;
      } catch {
        body = { error: `HTTP ${response.status}` };
      }
    } else {
      const text = await response.text();
      body = { error: text || `HTTP ${response.status}` };
    }

    if (response.status === 401 && unauthorizedHandler) {
      unauthorizedHandler();
    }

    throw new ApiError(response.status, body);
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
