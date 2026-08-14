#!/usr/bin/env node
/**
 * cleanup.mjs — destroys ALL disposable QA artifacts (issue #62)
 *
 * Principle: test → report → destroy. The QA never leaves residue and never
 * touches the real production environment. Idempotent; runs at the start and
 * end of run-all.mjs and as the pre-push rule.
 */
import { existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = resolve(dirname(fileURLToPath(import.meta.url)));

const QA_DIR = __dirname;
const QA_HOME_PREFIX = "tatachio-qa-home-";

function qaDirPath(name) {
  return join(QA_DIR, name);
}

function eliminar(path) {
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
    console.log(`  cleaned: ${path}`);
  }
}

export function cleanupQa() {
  console.log("[cleanup] QA artifacts...");
  let count = 0;

  // 1. Temporary QA homes (in os.tmpdir)
  const tmp = tmpdir();
  let tmpEntries = [];
  try {
    tmpEntries = readdirSync(tmp);
  } catch {
    /* tmpdir unreadable — skip */
  }
  for (const entry of tmpEntries) {
    if (entry.startsWith(QA_HOME_PREFIX)) {
      eliminar(join(tmp, entry));
      count++;
    }
  }

  // 2. QA artifacts inside scripts/qa/
  for (const name of [
    "qa.db",
    "qa-report.json",
    "qa-report.xml",
    "backend-startup.log",
    "backend-error.log",
    "report.md",
  ]) {
    const p = qaDirPath(name);
    if (existsSync(p)) {
      eliminar(p);
      count++;
    }
  }

  // 3. Residual QA xlsx files (never touches the real ~/.tatachio/reportes)
  try {
    for (const entry of readdirSync(QA_DIR)) {
      if (entry.endsWith(".xlsx")) {
        eliminar(join(QA_DIR, entry));
        count++;
      }
    }
  } catch {
    /* directory unreadable */
  }

  console.log(`[cleanup] done (${count} artifacts removed)`);
  return count;
}

if (process.argv[1] && process.argv[1].endsWith("cleanup.mjs")) {
  cleanupQa();
}
