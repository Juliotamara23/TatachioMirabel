export type OutputMode = "pretty" | "json";

export interface CliConfig {
  token?: string;
  baseUrl: string;
  user?: {
    id: string;
    email: string;
    nombre: string;
    rol: string;
  };
}

export interface ApiError extends Error {
  status: number;
  body: unknown;
}

// Discriminated union for structured output
export type Envelope<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };
