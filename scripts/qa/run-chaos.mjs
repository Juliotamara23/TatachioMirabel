#!/usr/bin/env node
/**
 * run-chaos.mjs — Runs all chaos test suites in a single session.
 *
 * Flow:
 *   1. Seed database (once)
 *   2. Start server (once)
 *   3. Run 4 chaos suites sequentially:
 *      - chaos/auth-bypass
 *      - chaos/injection
 *      - chaos/rate-limit
 *      - chaos/boundary
 *   4. Accumulate results
 *   5. Stop server
 *   6. Generate unified report
 */

import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..", "..", "..");
const qaDir = join(projectRoot, "scripts", "qa");

const CHAOS_SUITES = [
  "chaos/auth-bypass",
  "chaos/injection",
  "chaos/rate-limit",
  "chaos/boundary",
];

async function main() {
  const startedAt = Date.now();
  const allFailures = [];
  const allSuiteSummaries = {};
  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;

  let serverCtx = null;

  try {
    // Step 1: Seed database (once)
    console.log("[1/6] Seeding database...");
    execSync("node lib/seed-db.mjs", { cwd: qaDir, stdio: "inherit" });

    // Step 2: Start server (once)
    console.log("[2/6] Starting server...");
    const { startServer, stopServer } = await import("./lib/server.mjs");
    serverCtx = await startServer({});
    const base = `http://localhost:${serverCtx.port}`;
    console.log(`Server running on ${base}\n`);

    // Step 3: Run each chaos suite
    for (let i = 0; i < CHAOS_SUITES.length; i++) {
      const suiteName = CHAOS_SUITES[i];
      console.log(`[3.${i + 1}/${CHAOS_SUITES.length + 2}] Running ${suiteName}...`);

      const suiteStartTime = Date.now();
      const { createReporter, addSuite } = await import("./lib/reporter.mjs");
      const suiteReporter = createReporter();

      try {
        // Dynamic import of the suite
        const suiteModule = await import(`./suites/${suiteName}.test.mjs`);
        // Suites run immediately on import (they have runChaosSuite() or runRateLimitTests() at bottom)
        // But we need to capture their results — they write their own reports.
        // Instead, we'll run the suite logic inline by reusing their patterns.

        // For now, we execute the suite file as a subprocess to capture its output
        // and then merge its report. This keeps suites independent.
        const result = await runSuiteAsSubprocess(suiteName, base, qaDir);

        // Merge results
        totalTests += result.total;
        totalPassed += result.passed;
        totalFailed += result.failed;
        allSuiteSummaries[suiteName] = {
          total: result.total,
          passed: result.passed,
          failed: result.failed,
          skipped: 0,
          duration_ms: result.duration_ms,
        };

        if (result.failures && result.failures.length > 0) {
          for (const failure of result.failures) {
            allFailures.push({ ...failure, suite: suiteName });
          }
        }

        console.log(`  ✓ ${suiteName}: ${result.passed}/${result.total} passed${result.failed > 0 ? `, ${result.failed} failed` : ""} (${result.duration_ms}ms)\n`);

      } catch (suiteError) {
        console.error(`  ✗ ${suiteName} crashed:`, suiteError.message);
        totalTests += 1;
        totalFailed += 1;
        allSuiteSummaries[suiteName] = {
          total: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration_ms: Date.now() - suiteStartTime,
        };
        allFailures.push({
          suite: suiteName,
          test: "suite-execution",
          expected: "Suite completed",
          actual: suiteError.message,
          detail: suiteError.stack || suiteError.message,
          blocker: true,
        });
      }
    }

    // Step 4: Stop server
    console.log("[5/6] Stopping server...");
    await stopServer(serverCtx);
    serverCtx = null;

    // Step 5: Generate unified report
    console.log("[6/6] Generating unified report...");
    const { createReporter, addSuite, writeReport } = await import("./lib/reporter.mjs");
    const rep = createReporter();

    // Add all suite summaries
    for (const [suiteName, summary] of Object.entries(allSuiteSummaries)) {
      const suiteFailures = allFailures.filter(f => f.suite === suiteName);
      addSuite(rep, suiteName, {
        ...summary,
        failures: suiteFailures,
      });
    }

    const { json } = writeReport(rep, qaDir);

    const totalDuration = Date.now() - startedAt;
    console.log(`\n=== CHAOS SUITE SUMMARY ===`);
    console.log(`Total duration: ${totalDuration}ms`);
    console.log(`Verdict: ${json.verdict}`);
    console.log(`${totalPassed}/${totalTests} passed${totalFailed > 0 ? `, ${totalFailed} failed` : ""}`);

    for (const [suiteName, summary] of Object.entries(allSuiteSummaries)) {
      const status = summary.failed === 0 ? "✓" : "✗";
      console.log(`  ${status} ${suiteName}: ${summary.passed}/${summary.total}`);
    }

    process.exit(totalFailed > 0 ? 1 : 0);

  } catch (error) {
    console.error("Chaos runner failed:", error.message);
    console.error("Stack:", error.stack);

    // Cleanup server if running
    if (serverCtx) {
      try {
        const { stopServer } = await import("./lib/server.mjs");
        await stopServer(serverCtx);
      } catch (cleanupError) {
        console.error("Cleanup failed:", cleanupError.message);
      }
    }

    // Generate error report
    try {
      const { createReporter, addSuite, writeReport } = await import("./lib/reporter.mjs");
      const rep = createReporter();
      addSuite(rep, "chaos/runner", {
        total: 1,
        passed: 0,
        failed: 1,
        skipped: 0,
        duration_ms: Date.now() - startedAt,
        failures: [
          {
            test: "chaos-runner",
            expected: "All suites completed",
            actual: error.message,
            detail: error.stack || error.message,
            blocker: true,
          },
        ],
      });
      writeReport(rep, qaDir);
    } catch (reportError) {
      console.error("Failed to generate error report:", reportError.message);
    }

    process.exit(1);
  }
}

/**
 * Run a chaos suite as a subprocess and capture its JSON report.
 * @param {string} suiteName - Suite name (e.g., "chaos/auth-bypass")
 * @param {string} base - Base URL of the running server
 * @param {string} qaDir - QA directory path
 * @returns {Promise<{total: number, passed: number, failed: number, duration_ms: number, failures: Array}>}
 */
async function runSuiteAsSubprocess(suiteName, base, qaDir) {
  // Set environment variables for the suite to use the already-running server
  const env = {
    ...process.env,
    QA_BASE_URL: base,
    QA_SKIP_SEED: "1",
    QA_SKIP_SERVER_START: "1",
  };

  const suitePath = join(qaDir, "suites", `${suiteName}.test.mjs`);

  const { execSync } = await import("node:child_process");

  try {
    const output = execSync(`node "${suitePath}"`, {
      cwd: qaDir,
      env,
      encoding: "utf-8",
      timeout: 120000, // 2 min per suite (rate-limit can be slow)
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Parse the report generated by the suite
    const reportPath = join(qaDir, "qa-report.json");
    const { readFileSync } = await import("node:fs");
    const report = JSON.parse(readFileSync(reportPath, "utf-8"));

    const suiteData = report.by_suite[suiteName];
    if (!suiteData) {
      throw new Error(`No suite data found in report for ${suiteName}`);
    }

    return {
      total: suiteData.total,
      passed: suiteData.passed,
      failed: suiteData.failed,
      duration_ms: suiteData.duration_ms,
      failures: report.failures.filter(f => f.suite === suiteName) || [],
    };

  } catch (error) {
    // If subprocess fails, try to read any partial report
    try {
      const { readFileSync, existsSync } = await import("node:fs");
      const reportPath = join(qaDir, "qa-report.json");
      if (existsSync(reportPath)) {
        const report = JSON.parse(readFileSync(reportPath, "utf-8"));
        const suiteData = report.by_suite[suiteName];
        if (suiteData) {
          return {
            total: suiteData.total,
            passed: suiteData.passed,
            failed: suiteData.failed,
            duration_ms: suiteData.duration_ms,
            failures: report.failures.filter(f => f.suite === suiteName) || [],
          };
        }
      }
    } catch (_) {
      // Ignore report read errors
    }

    throw error;
  }
}

main();