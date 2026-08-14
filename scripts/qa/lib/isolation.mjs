#!/usr/bin/env node
/**
 * isolation.mjs — QA disposable home (issue #62)
 *
 * The QA exercises the REAL backend/CLI but ALWAYS against fake, disposable
 * data. Mechanism: a temporary QA_HOME injected as $HOME into subprocesses
 * (CLI and QA server) — os.homedir() honors $HOME on POSIX, so everything the
 * CLI/backend writes under "~/.tatachio/*" lands inside the QA_HOME and NEVER
 * in the real home of the user running the QA.
 *
 * Principle: test → report → destroy. Nothing the QA creates touches the real
 * environment.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const QA_HOME_PREFIX = "tatachio-qa-home-";

/**
 * Creates a disposable QA_HOME and returns its absolute path.
 * The caller is responsible for cleaning it up with limpiarQaHome().
 */
export async function crearQaHome() {
  return mkdtemp(join(tmpdir(), QA_HOME_PREFIX));
}

/**
 * Returns the env object to inject into QA subprocesses (CLI / server):
 * - HOME points at the QA_HOME (total isolation from the real ~/.tatachio)
 * - TATACHIO_REPORTES_DIR lands inside the QA_HOME (fake reports)
 * - extra allows per-call overrides (token, baseUrl, etc.)
 */
export function envQa(qaHome, extra = {}) {
  return {
    HOME: qaHome,
    TATACHIO_REPORTES_DIR: join(qaHome, ".tatachio", "reportes"),
    ...extra,
  };
}

/**
 * Destroys a QA_HOME. Only removes paths created by crearQaHome() (prefix +
 * absolute-path guard) — never touches anything outside the tmpdir.
 */
export async function limpiarQaHome(qaHome) {
  if (!qaHome || !qaHome.startsWith(join(tmpdir(), QA_HOME_PREFIX))) {
    throw new Error(`limpiarQaHome: path does not look like a valid QA_HOME: ${qaHome}`);
  }
  await rm(qaHome, { recursive: true, force: true });
}

// ── Per-process QA_HOME (singleton) ───────────────────────────────────────
// Each QA suite runs in its own process; one QA_HOME per process is injected
// automatically into runCli and the QA server.

let homeGlobal = null;

/** Returns the process QA_HOME (creates it on first call). */
export async function obtenerQaHome() {
  if (!homeGlobal) {
    homeGlobal = await crearQaHome();
  }
  return homeGlobal;
}

/** Returns the process isolated env (HOME + TATACHIO_REPORTES_DIR). */
export async function obtenerQaEnv(extra = {}) {
  return envQa(await obtenerQaHome(), extra);
}

/** Destroys the process QA_HOME (at the end of each suite). */
export async function limpiarQaGlobal() {
  if (homeGlobal) {
    await limpiarQaHome(homeGlobal);
    homeGlobal = null;
  }
}
