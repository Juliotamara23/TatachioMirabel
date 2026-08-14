#!/usr/bin/env node
/**
 * run-all.mjs — Main QA orchestrator.
 * Runs all 17 test suites sequentially and generates unified report.
 */

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..", "..");
const qaDir = join(projectRoot, "scripts", "qa");

async function runAllSuites() {
  // Import shared utilities
  const { createReporter, addSuite, writeReport } = await import("./lib/reporter.mjs");

  const reporter = createReporter();

  // Suite list - 17 test suites in order
  const suites = [
    "suites/api/health",
    "suites/api/auth",
    "suites/api/miembros",
    "suites/api/familias",
    "suites/api/cabildos",
    "suites/api/chat",
    "suites/api/admin",
    "suites/api/reportes",
    "suites/chaos/auth-bypass",
    "suites/chaos/injection",
    "suites/chaos/rate-limit",
    "suites/chaos/boundary",
    "suites/cli/auth",
    "suites/cli/cabildos",
    "suites/cli/familias",
    "suites/cli/miembros",
    "suites/cli/reportes",
  ];

  let anyFailed = false;
  let anyBlocked = false;
  let anyWarn = false;

  try {
    // Seed ONCE for all suites (suites skip their own seed via QA_SKIP_SEED)
    console.log("\n========== SEED DATABASE (once) ==========");
    execSync("node lib/seed-db.mjs", { cwd: qaDir, stdio: "inherit" });
    process.env.QA_SKIP_SEED = "1";

    // Each suite manages its own lifecycle: seed → server → tests → stop → report.
    // The orchestrator runs them sequentially and aggregates the per-suite reports.
    for (let i = 0; i < suites.length; i++) {
      const suite = suites[i];
      const suiteName = suite.split("/").pop(); // e.g., "health", "auth", "auth-bypass"
      const suitePath = `${suite}.test.mjs`;

      console.log(`\n========== [${i + 1}/${suites.length}] ${suiteName.toUpperCase()} =========="`);

      try {
        execSync(`node ${suitePath}`, { cwd: qaDir, stdio: "inherit" });

        // Read the generated qa-report.json to accumulate totals
        const reportPath = join(qaDir, "qa-report.json");
        if (existsSync(reportPath)) {
          const suiteReport = JSON.parse(readFileSync(reportPath, "utf-8"));

          // Add suite results to main reporter
          if (suiteReport.by_suite && suiteReport.by_suite[suiteName]) {
            const suiteData = suiteReport.by_suite[suiteName];
            const failures = suiteReport.failures?.filter(f => f.suite === suiteName) || [];

            addSuite(reporter, suiteName, {
              total: suiteData.total,
              passed: suiteData.passed,
              failed: suiteData.failed,
              skipped: suiteData.skipped,
              duration_ms: suiteData.duration_ms,
              failures,
            });

            // Track verdicts
            if (suiteReport.verdict === "BLOCKED") {
              anyBlocked = true;
            } else if (suiteReport.verdict === "WARN") {
              anyWarn = true;
            }

            if (suiteData.failed > 0) {
              anyFailed = true;
            }

            console.log(`  ✓ ${suiteName}: ${suiteData.passed}/${suiteData.total} passed, ${suiteData.failed} failed`);
          }
        }
      } catch (error) {
        console.error(`  ✗ ${suiteName} suite failed:`, error.message);
        anyFailed = true;

        // Add failed suite to reporter
        addSuite(reporter, suiteName, {
          total: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration_ms: 0,
          failures: [{
            test: suiteName,
            expected: "Suite execution success",
            actual: error.message,
            detail: error.message,
            blocker: suiteName === "auth" || suiteName === "auth-bypass",
          }],
        });
      }
    }

    // Step 4: Determine final verdict
    let finalVerdict = "PASS";
    if (anyBlocked) {
      finalVerdict = "BLOCKED";
    } else if (anyWarn || anyFailed) {
      finalVerdict = "WARN";
    }

    // Override the reporter's internal verdict by generating final report manually
    // The reporter's generateReport will compute verdict based on accumulated data
    const reportPath = join(qaDir, "qa-report.json");
    const finalReport = {
      timestamp: new Date().toISOString(),
      commit: reporter._commit,
      summary: reporter._summaries,
      verdict: finalVerdict,
      by_suite: reporter._by_suite,
      failures: reporter._failures,
    };

    // Write final unified report
    console.log("\n========== FINAL REPORT ==========");
    console.log(`Total:  ${reporter._summaries.total}`);
    console.log(`Passed: ${reporter._summaries.passed}`);
    console.log(`Failed: ${reporter._summaries.failed}`);
    console.log(`Skipped: ${reporter._summaries.skipped}`);
    console.log(`Duration: ${reporter._summaries.duration_ms}ms`);
    console.log(`Verdict: ${finalVerdict}`);

    writeReport(reporter, qaDir);

    // Also write the explicit final verdict to qa-report.json
    import("node:fs").then(fs => {
      fs.writeFileSync(reportPath, JSON.stringify(finalReport, null, 2), "utf-8");
    });

    console.log(`\nReport written to ${qaDir}/qa-report.json`);
    console.log(`Report written to ${qaDir}/qa-report.xml`);

    process.exit(anyFailed ? 1 : 0);

  } catch (error) {
    console.error("\n========== ORCHESTRATOR ERROR ==========");
    console.error("Fatal error:", error.message);
    console.error("Stack:", error.stack);

    // Attempt cleanup
    if (ctx) {
      try {
        await stopServer(ctx);
      } catch (cleanupError) {
        console.error("Cleanup failed:", cleanupError.message);
      }
    }

    // Generate error report
    try {
      addSuite(reporter, "orchestrator", {
        total: 1,
        passed: 0,
        failed: 1,
        skipped: 0,
        duration_ms: 0,
        failures: [{
          test: "run-all",
          expected: "Orchestrator completes successfully",
          actual: error.message,
          detail: error.message,
          blocker: true,
        }],
      });
      writeReport(reporter, qaDir);
    } catch (reportError) {
      console.error("Failed to generate error report:", reportError.message);
    }

    process.exit(1);
  }
}

runAllSuites();