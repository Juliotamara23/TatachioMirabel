#!/usr/bin/env node
import { execSync } from "node:child_process";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..", "..", "..");
const qaDir = join(projectRoot, "scripts", "qa");

/**
 * Run a QA test suite with shared lifecycle: seed → start server → run tests → stop server → write report.
 *
 * @param {Object} options
 * @param {string} options.name - Suite name (e.g. "api/auth")
 * @param {boolean} [options.seed=true] - Whether to seed the database before running
 * @param {boolean} [options.start=true] - Whether to start the server
 * @param {Function} testFn - Async function receiving { base } (base URL), returns suite results
 * @returns {Promise<Object>} Test results { verdict, passed, failed, duration_ms, failures }
 */
export async function runSuite({ name, seed = true, start = true }, testFn) {
  let serverCtx = null;
  const startTime = Date.now();
  let verdict = "PASS";
  let passed = 0;
  let failed = 0;
  let failures = [];

  try {
    // Step 1: Seed database if requested
    if (seed) {
      console.log(`[${name}] Seeding database...`);
      execSync("node lib/seed-db.mjs", { cwd: qaDir, stdio: "inherit" });
    }

    // Step 2: Start server if requested
    let base = null;
    if (start) {
      console.log(`[${name}] Starting server...`);
      const { startServer } = await import("./server.mjs");
      serverCtx = await startServer({});
      base = `http://localhost:${serverCtx.port}`;
      global.__QA_BASE_URL__ = base;
      console.log(`[${name}] Server ready at ${base}`);
    }

    // Step 3: Run the test function
    console.log(`[${name}] Running tests...`);
    const results = await testFn({ base });

    // Aggregate results from test function
    passed = results.passed ?? 0;
    failed = results.failed ?? 0;
    failures = results.failures ?? [];

    // Determine verdict
    if (failed > 0) {
      verdict = "WARN";
    }
    // Check for blocked conditions (auth suite failures)
    if ((name === "auth" || name.startsWith("auth/")) && failed > 0) {
      verdict = "BLOCKED";
    }

  } catch (error) {
    console.error(`[${name}] Test failed:`, error.message);
    verdict = "ERROR";
    failed += 1;
    failures.push({
      test: name,
      expected: "Test suite to pass",
      actual: error.message,
      detail: error.stack,
      blocker: false,
    });
  } finally {
    // Step 4: Stop server if we started it
    if (start && serverCtx) {
      try {
        console.log(`[${name}] Stopping server...`);
        const { stopServer } = await import("./server.mjs");
        await stopServer(serverCtx);
      } catch (stopError) {
        console.error(`[${name}] Failed to stop server:`, stopError.message);
      }
    }
  }

  // Step 5: Write report
  const duration_ms = Date.now() - startTime;
  console.log(`[${name}] Writing report...`);
  
  const { createReporter, addSuite, writeReport } = await import("./reporter.mjs");
  const rep = createReporter();
  addSuite(rep, name, {
    total: passed + failed,
    passed,
    failed,
    skipped: 0,
    duration_ms,
    failures,
  });
  writeReport(rep, qaDir);

  console.log(`[${name}] Verdict: ${verdict} (passed: ${passed}, failed: ${failed})`);

  return { verdict, passed, failed, duration_ms, failures };
}

/**
 * Create a test helper for a suite to track individual test results.
 *
 * @param {string} suiteName - Name of the suite (e.g. "api/auth")
 * @returns {Object} Test helper with test(), addFailure(), finish(), and counters
 */
export function createTestHelper(suiteName) {
  let passed = 0;
  let failed = 0;
  const failures = [];

  async function test(name, fn) {
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (error) {
      failed++;
      failures.push({
        test: name,
        expected: "Test to pass",
        actual: error.message,
        detail: error.stack,
        blocker: false,
      });
      console.log(`  ✗ ${name}: ${error.message}`);
    }
  }

  function addFailure(name, error) {
    failed++;
    failures.push({
      test: name,
      expected: "Test to pass",
      actual: error?.message ?? String(error),
      detail: error?.stack ?? String(error),
      blocker: false,
    });
    console.log(`  ✗ ${name}: ${error?.message ?? error}`);
  }

  function finish() {
    const duration_ms = 0; // Duration tracked externally if needed
    const verdict = failed > 0 ? "WARN" : "PASS";
    if ((suiteName === "auth" || suiteName.startsWith("auth/")) && failed > 0) {
      return { verdict: "BLOCKED", passed, failed };
    }
    return { verdict, passed, failed };
  }

  return {
    test,
    addFailure,
    finish,
    get passed() { return passed; },
    get failed() { return failed; },
    get failures() { return failures; },
  };
}