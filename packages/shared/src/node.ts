// Node-only entry point.
//
// `@tatachio/shared` must stay browser-safe (no Node built-ins at top level)
// so Vite can bundle the schemas/types for the frontend. Helpers that depend
// on `node:os` / `node:path` live here and are re-exported alongside the
// browser-safe surface.
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

export * from "./index.js";

// ── Shared reports folder (decision 2026-08-14, issue #60) ──────────────
// Single source of truth for backend and CLI: TATACHIO_REPORTES_DIR if set,
// otherwise ~/.tatachio/reportes/. Always outside the repo (never committed);
// consumers call mkdir(dir, { recursive: true }) at runtime.
export const REPORTES_DIR_ENV = "TATACHIO_REPORTES_DIR";

/**
 * Validates a reports-dir path coming from either TATACHIO_REPORTES_DIR or
 * the CLI `--output` flag. Returns the trimmed absolute path, or throws an
 * Error with an actionable message naming the source (so the user knows
 * which config to fix).
 *
 * Rules:
 *  - Empty / whitespace-only -> throw (the user set it, so we must honor it;
 *    silent fallback would hide misconfiguration — issue #66).
 *  - Must be absolute (relative paths would resolve against cwd, which is
 *    almost never what the user intends — issue #66).
 */
export function validateReportesDirPath(dir: string, source: string): string {
  if (typeof dir !== "string" || dir.trim() === "") {
    throw new Error(`${source} cannot be empty or whitespace-only`);
  }
  const trimmed = dir.trim();
  if (!isAbsolute(trimmed)) {
    throw new Error(`${source} must be an absolute path (got: "${trimmed}")`);
  }
  return trimmed;
}

export function resolveReportesDir(
  env: Record<string, string | undefined> = process.env,
): string {
  const raw = env[REPORTES_DIR_ENV];
  if (raw === undefined) {
    // Unset: use the default. No validation needed — we control the value.
    return join(homedir(), ".tatachio", "reportes");
  }
  // Set (even to "" or whitespace): the user configured it, so it MUST be
  // honored or rejected loudly. Silent fallback would hide misconfiguration.
  return validateReportesDirPath(raw, REPORTES_DIR_ENV);
}
