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
import { QA_HOME_PREFIX } from "./lib/isolation.mjs";

const __dirname = resolve(dirname(fileURLToPath(import.meta.url)));

const QA_DIR = __dirname;
const TEST_HOME_PREFIX = "tatachio-test-home-";

function qaDirPath(name) {
  return join(QA_DIR, name);
}

function eliminar(path) {
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
    console.log(`  cleaned: ${path}`);
  }
}

/**
 * Destroys disposable QA artifacts.
 * @param {Object} [opts]
 * @param {boolean} [opts.preservarReportes=false] - when true, keeps the QA
 *   reports (qa-report.json/xml, logs) — used by the end-of-run cleanup so a
 *   run does not destroy its own deliverable (fix R4-001, issue #62).
 */
export function cleanupQa(opts = {}) {
  const { preservarReportes = false } = opts;
  console.log(`[cleanup] QA artifacts (preservarReportes=${preservarReportes})...`);
  let count = 0;

  // 1. Temporary QA homes (in os.tmpdir) — both QA suites and vitest helpers
  const tmp = tmpdir();
  let tmpEntries = [];
  try {
    tmpEntries = readdirSync(tmp);
  } catch {
    /* tmpdir unreadable — skip */
  }
  for (const entry of tmpEntries) {
    if (entry.startsWith(QA_HOME_PREFIX) || entry.startsWith(TEST_HOME_PREFIX)) {
      eliminar(join(tmp, entry));
      count++;
    }
  }

  // 2. QA artifacts inside scripts/qa/
  const artifactNames = ["qa.db", "report.md"];
  if (!preservarReportes) {
    artifactNames.push("qa-report.json", "qa-report.xml", "backend-startup.log", "backend-error.log");
  }
  for (const name of artifactNames) {
    const p = qaDirPath(name);
    if (existsSync(p)) {
      eliminar(p);
      count++;
    }
  }

  // 3. QA reports dir (scripts/qa/reportes/) and residual QA xlsx files
  //    (never touches the real ~/.tatachio/reportes)
  try {
    for (const entry of readdirSync(QA_DIR)) {
      if (entry.endsWith(".xlsx")) {
        eliminar(join(QA_DIR, entry));
        count++;
      }
    }
    eliminar(join(QA_DIR, "reportes"));
    if (existsSync(join(QA_DIR, "reportes"))) count++;
  } catch {
    /* directory unreadable */
  }

  console.log(`[cleanup] done (${count} artifacts removed)`);
  return count;
}

if (process.argv[1] && process.argv[1].endsWith("cleanup.mjs")) {
  cleanupQa();
}
