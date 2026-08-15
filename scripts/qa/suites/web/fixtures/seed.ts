import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..", "..", "..", "..");
const qaDir = join(projectRoot, "scripts", "qa");

/**
 * Seeds the QA database once per test run.
 * Skips if QA_SKIP_SEED is set (set by run-all.mjs orchestrator).
 */
export function seedOnce() {
  if (process.env.QA_SKIP_SEED === "1") return;
  if (process.env.SEED_DONE === "1") return;

  const seedScript = join(qaDir, "lib", "seed-db.mjs");
  if (!existsSync(seedScript)) {
    throw new Error(`Seed script not found: ${seedScript}`);
  }

  execSync(`node ${seedScript}`, { cwd: qaDir, stdio: "inherit" });
  process.env.SEED_DONE = "1";
}
