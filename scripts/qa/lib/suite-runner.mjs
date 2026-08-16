#!/usr/bin/env node
import { execSync } from "node:child_process";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { obtenerQaEnv, limpiarQaGlobal } from "./isolation.mjs";

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
 * @param {Object} [options.env={}] - Environment variables to pass to the server process
 * @param {Function} testFn - Async function receiving { base } (base URL), returns suite results
 * @returns {Promise<Object>} Test results { verdict, passed, failed, duration_ms, failures }
 */
export async function runSuite({ name, seed = true, start = true, env = {} }, testFn) {
  let serverCtx = null;
  const startTime = Date.now();
  let verdict = "PASS";
  let passed = 0;
  let failed = 0;
  let failures = [];

  try {
    // Step 1: Seed database if requested (skip if orchestrator already seeded)
    if (seed && !process.env.QA_SKIP_SEED) {
      console.log(`[${name}] Seeding database...`);
      execSync("node lib/seed-db.mjs", { cwd: qaDir, stdio: "inherit" });
    }

    // Step 2: Start server if requested
    let base = null;
    if (start) {
      console.log(`[${name}] Starting server...`);
      const { startServer, QA_BACKEND_PORT } = await import("./server.mjs");
      // The QA server ALWAYS runs with the isolated QA_HOME (issue #62):
      // fake HOME + TATACHIO_REPORTES_DIR — never touches the real ~/.tatachio.
      const serverEnv = { ...(await obtenerQaEnv()), ...env };
      // Every suite runs on the SAME fixed port (QA_BACKEND_PORT = 3456),
      // shared with the web E2E flow. startServer retries EADDRINUSE itself,
      // so no per-suite port allocation is needed.
      serverCtx = await startServer({ env: serverEnv, port: QA_BACKEND_PORT });
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
    // Step 4b: Destroy the process QA_HOME (test → report → destroy)
    try {
      await limpiarQaGlobal();
    } catch (cleanupError) {
      console.error(`[${name}] QA cleanup failed:`, cleanupError.message);
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

  // Terminate explicitly — otherwise lingering handles (server logs, connections)
  // keep the event loop alive and the suite hangs after reporting.
  process.exit(verdict === "PASS" ? 0 : 1);
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
  const pending = [];

  function test(name, fn) {
    // Always await the promise so runSuite waits for all tests to complete
    const p = (async () => {
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
    })();
    pending.push(p);
    return p;
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

  async function finish() {
    // Wait for any in-flight tests registered without await
    await Promise.all(pending);
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