export type ApiError = Error & {
  status: number;
  body: unknown;
};

export interface ApiFetchOptions {
  method?: string;
  baseUrl?: string;
  token?: string;
  body?: unknown;
}

export async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<unknown> {
  const {
    method = "GET",
    baseUrl,
    token,
    body,
  } = options;

  const url = baseUrl ? `${baseUrl}${path}` : path;

  const headers: HeadersInit = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (body !== undefined && !["GET", "HEAD"].includes(method.toUpperCase())) {
    headers["Content-Type"] = "application/json";
  }

  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const response = await fetch(url, init);

  let responseBody: unknown;
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    responseBody = await response.json();
  } else {
    responseBody = await response.text();
  }

  if (!response.ok) {
    const error = new Error("API request failed") as ApiError;
    error.status = response.status;
    error.body = responseBody;
    throw error;
  }

  return responseBody;
}
