// Node-only entry point.
//
// `@tatachio/shared` must stay browser-safe (no Node built-ins at top level)
// so Vite can bundle the schemas/types for the frontend. Helpers that depend
// on `node:os` / `node:path` live here and are re-exported alongside the
// browser-safe surface.
import { homedir } from "node:os";
import { join } from "node:path";

export * from "./index.js";

// ── Shared reports folder (decision 2026-08-14, issue #60) ──────────────
// Single source of truth for backend and CLI: TATACHIO_REPORTES_DIR if set,
// otherwise ~/.tatachio/reportes/. Always outside the repo (never committed);
// consumers call mkdir(dir, { recursive: true }) at runtime.
export const REPORTES_DIR_ENV = "TATACHIO_REPORTES_DIR";

export function resolveReportesDir(
  env: Record<string, string | undefined> = process.env,
): string {
  const fromEnv = env[REPORTES_DIR_ENV]?.trim();
  return fromEnv || join(homedir(), ".tatachio", "reportes");
}
