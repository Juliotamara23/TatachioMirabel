#!/usr/bin/env node
/**
 * isolation-check.mjs — proves the QA never touches the real environment
 * (issue #62).
 *
 * Snapshots `~/.tatachio` and the real HOME BEFORE and AFTER running a
 * workload (tests / suites), then asserts ZERO changes. Run with:
 *
 *   node scripts/qa/isolation-check.mjs --vitest
 *   node scripts/qa/isolation-check.mjs --suite cli/reportes
 *   node scripts/qa/isolation-check.mjs --all
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = resolve(dirname(fileURLToPath(import.meta.url)));

const ROOT = resolve(__dirname, "..", "..");
const QA_DIR = join(ROOT, "scripts", "qa");

const TARGETS = [
  join(homedir(), ".tatachio"),
  join(homedir(), ".tatachio", "config.json"),
  join(homedir(), ".tatachio", "reportes"),
];

/** Recursive snapshot of a dir (paths + sizes + mtimes normalized). */
function snapshot(targets) {
  const out = {};
  for (const t of targets) {
    out[t] = walk(t);
  }
  return JSON.stringify(out, null, 0);
}

function walk(p) {
  if (!existsSync(p)) return null;
  const st = statSync(p);
  if (st.isFile()) {
    return { size: st.size, mtimeMs: Math.floor(st.mtimeMs / 1000) };
  }
  if (st.isDirectory()) {
    const entries = {};
    for (const e of readdirSync(p).sort()) {
      entries[e] = walk(join(p, e));
    }
    return entries;
  }
  return null;
}

function run(label, cmd, opts = {}) {
  console.log(`\n=== ${label} ===`);
  execSync(cmd, { cwd: opts.cwd ?? ROOT, stdio: "inherit", env: process.env });
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args.includes("--vitest")
    ? "vitest"
    : args.includes("--suite")
      ? "suite"
      : "all";

  const before = snapshot(TARGETS);

  if (mode === "vitest" || mode === "all") {
    run("CLI vitest suite", "pnpm --filter @tatachio/cli test");
  }
  if (mode === "suite" || mode === "all") {
    const suite = args[args.indexOf("--suite") + 1] ?? "cli/reportes";
    run(`QA suite ${suite}`, `node suites/${suite}.test.mjs`, { cwd: QA_DIR });
  }

  const after = snapshot(TARGETS);

  if (before === after) {
    console.log("\n✅ ISOLATION OK — the real environment was NOT modified.");
    process.exit(0);
  }
  console.error("\n❌ ISOLATION FAILED — the real environment WAS modified:");
  console.error("before:", before);
  console.error("after: ", after);
  process.exit(1);
}

main().catch((err) => {
  console.error("isolation-check error:", err.message);
  process.exit(2);
});
