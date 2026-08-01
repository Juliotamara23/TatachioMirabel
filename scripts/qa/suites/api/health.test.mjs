#!/usr/bin/env node
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..", "..", "..", "..");
const qaDir = join(projectRoot, "scripts", "qa");

async function runSmokeTest() {
  try {
    // Step 1: Seed DB
    console.log("[1/5] Seeding database...");
    execSync("node lib/seed-db.mjs", { cwd: qaDir, stdio: "inherit" });

    // Step 2: Start server
    console.log("[2/5] Starting server...");
    const { startServer, stopServer } = await import("../../lib/server.mjs");
    const ctx = await startServer({});

    // Step 3: Login
    console.log("[3/5] Testing auth...");
    const base = `http://localhost:${ctx.port}`;
    const loginRes = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@tatachio.com", password: "admin123" }),
    });
    const loginData = await loginRes.json();
    if (!loginData.token) throw new Error("Login failed: no token");

    // Step 4: Protected endpoint
    console.log("[4/5] Testing protected endpoint...");
    const cabRes = await fetch(`${base}/api/cabildos`, {
      headers: { Authorization: `Bearer ${loginData.token}` },
    });
    const cabData = await cabRes.json();
    if (!Array.isArray(cabData)) throw new Error("GET /api/cabildos returned non-array");

    // Step 5: Stop + Report
    console.log("[5/5] Generating report...");
    await stopServer(ctx);

    const { createReporter, addSuite, generateReport, writeReport } = await import("../../lib/reporter.mjs");
    const rep = createReporter();
    addSuite(rep, "smoke", {
      total: 2, passed: 2, failed: 0, skipped: 0, duration_ms: 0,
      failures: [],
    });
    const { json, xml } = generateReport(rep);
    writeReport(rep, qaDir);

    console.log(`Verdict: ${json.verdict}`);
    process.exit(0);

  } catch (error) {
    console.error("Smoke test failed:", error.message);
    console.error("Stack:", error.stack);
    
    // Generate error report
    try {
      const { createReporter, addSuite, generateReport, writeReport } = await import("../../lib/reporter.mjs");
      const rep = createReporter();
      addSuite(rep, "smoke", {
        total: 2, passed: 0, failed: 2, skipped: 0, duration_ms: 0,
        failures: [
          { test: "Step 1", expected: "Seed database success", actual: error.message, detail: error.message },
          { test: "Step 2-5", expected: "Full pipeline success", actual: error.message, detail: error.message },
        ],
      });
      writeReport(rep, qaDir);
    } catch (reportError) {
      console.error("Failed to generate error report:", reportError.message);
    }

    process.exit(1);
  }
}

runSmokeTest();