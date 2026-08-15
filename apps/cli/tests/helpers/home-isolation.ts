/**
 * HOME isolation for CLI vitest tests (issue #62).
 *
 * Tests write/delete the real `~/.tatachio/config.json` through the
 * writeConfig/clearConfig helpers (join(homedir(), ".tatachio")). To ensure
 * they NEVER touch the real environment of the user running the tests,
 * `process.env.HOME` is pointed at a temporary directory (os.homedir() honors
 * $HOME on POSIX) and restored/cleaned when the test file finishes.
 *
 * Usage (top-level hooks in each test file):
 *   beforeAll(() => { aislarHome(); });
 *   afterAll(() => { restaurarHome(); });
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOME_PREFIX = "tatachio-test-home-";
let originalHome: string | undefined;

/** Creates and activates a fake HOME; returns its path. */
export function aislarHome(): string {
  originalHome = process.env.HOME;
  const fakeHome = mkdtempSync(join(tmpdir(), HOME_PREFIX));
  process.env.HOME = fakeHome;
  return fakeHome;
}

/** Restores the original HOME and destroys the fake one (if still active). */
export function restaurarHome(): void {
  const current = process.env.HOME;
  // Guard like isolation.mjs: only delete a path we actually created
  // (startsWith tmpdir + prefix), never anything else (fix R4-002).
  if (current && current.startsWith(join(tmpdir(), HOME_PREFIX))) {
    try {
      rmSync(current, { recursive: true, force: true });
    } catch {
      // best-effort cleanup; never breaks the test
    }
  }
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
  originalHome = undefined;
}
