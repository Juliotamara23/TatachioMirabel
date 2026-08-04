#!/usr/bin/env node
/**
 * rate-limit.test.mjs — Chaos suite: rate limiting per-role token bucket.
 *
 * ADMINISTRATOR: capacity=60, refill=1/sec, Retry-After=1
 * CAPTAIN:       capacity=20, refill=0.33/sec, Retry-After=4
 *
 * NOTE: This suite is naturally slow — it waits for bucket refill windows.
 */
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..", "..", "..", "..");
const qaDir = join(projectRoot, "scripts", "qa");

const ADMIN = { email: "admin@tatachio.com", password: "admin123" };
const CAPITANA = { email: "capitana@tatachio.com", password: "cap123" };

async function login(base, creds) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(creds),
  });
  const data = await res.json();
  if (!data.token) throw new Error(`Login failed for ${creds.email}`);
  return data.token;
}

async function fireBurst(base, token, count) {
  const results = [];
  const promises = [];
  for (let i = 0; i < count; i++) {
    promises.push(
      fetch(`${base}/api/cabildos`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => ({
        status: res.status,
        retryAfter: res.headers.get("Retry-After"),
      }))
    );
  }
  return Promise.all(promises);
}

async function runRateLimitTests() {
  const startedAt = Date.now();
  const failures = [];
  let total = 0;
  let passed = 0;

  try {
    // Step 1: Seed DB
    console.log("[1/4] Seeding database...");
    execSync("node lib/seed-db.mjs", { cwd: qaDir, stdio: "inherit" });

    // Step 2: Start server
    console.log("[2/4] Starting server...");
    const { startServer, stopServer } = await import("../../lib/server.mjs");
    const ctx = await startServer({ port: 3491 });
    const base = `http://localhost:${ctx.port}`;

    // Step 3: Login both users
    console.log("[3/4] Logging in...");
    const adminToken = await login(base, ADMIN);
    const capToken = await login(base, CAPITANA);

    // Step 4: Run tests
    console.log("[4/4] Running rate-limit tests...");

    // ── Test 1: Admin burst (65 requests) ─────────────────────────
    total++;
    console.log("  Test 1: Admin burst — 65 requests (capacity=60)");
    const adminResults = await fireBurst(base, adminToken, 65);
    const adminOk = adminResults.filter((r) => r.status === 200).length;
    const admin429 = adminResults.filter((r) => r.status === 429).length;

    if (adminOk === 60 && admin429 === 5) {
      passed++;
      console.log(`    PASS: ${adminOk} ok, ${admin429} rate-limited`);
    } else {
      failures.push({
        test: "Admin burst (65 req → 60 ok + 5 denied)",
        expected: "60 ok, 5 429s",
        actual: `${adminOk} ok, ${admin429} 429s, ${65 - adminOk - admin429} other`,
      });
      console.log(`    FAIL: ${adminOk} ok, ${admin429} 429s, expected 60/5`);
    }

    // ── Test 2: Captain burst (25 requests) ──────────────────────
    total++;
    console.log("  Test 2: Captain burst — 25 requests (capacity=20)");
    const capResults = await fireBurst(base, capToken, 25);
    const capOk = capResults.filter((r) => r.status === 200).length;
    const cap429 = capResults.filter((r) => r.status === 429).length;

    if (capOk === 20 && cap429 === 5) {
      passed++;
      console.log(`    PASS: ${capOk} ok, ${cap429} rate-limited`);
    } else {
      failures.push({
        test: "Captain burst (25 req → 20 ok + 5 denied)",
        expected: "20 ok, 5 429s",
        actual: `${capOk} ok, ${cap429} 429s, ${25 - capOk - cap429} other`,
      });
      console.log(`    FAIL: ${capOk} ok, ${cap429} 429s, expected 20/5`);
    }

    // ── Test 3: Retry-After header ───────────────────────────────
    total++;
    console.log("  Test 3: Retry-After header on 429 responses");
    const adminRetry = adminResults.find((r) => r.status === 429);
    const capRetry = capResults.find((r) => r.status === 429);

    const adminRetryOk = adminRetry && adminRetry.retryAfter === "1";
    const capRetryOk = capRetry && capRetry.retryAfter === "4";

    if (adminRetryOk && capRetryOk) {
      passed++;
      console.log(`    PASS: Admin Retry-After=1, Captain Retry-After=4`);
    } else {
      const adminActual = adminRetry ? adminRetry.retryAfter : "no 429 response";
      const capActual = capRetry ? capRetry.retryAfter : "no 429 response";
      failures.push({
        test: "Retry-After header",
        expected: "Admin=1, Captain=4",
        actual: `Admin=${adminActual}, Captain=${capActual}`,
      });
      console.log(`    FAIL: Admin=${adminActual}, Captain=${capActual}`);
    }

    // ── Test 4: Rate limit resets after window ───────────────────
    total++;
    console.log("  Test 4: Rate limit resets after refill window");

    // Login a fresh captain (capitana2) so bucket starts clean
    const cap2Token = await login(base, {
      email: "capitana2@tatachio.com",
      password: "cap123",
    });

    // Exhaust this captain's bucket fully (20 requests)
    const exhaustRes = await fireBurst(base, cap2Token, 25);
    const exhaustedOk = exhaustRes.filter((r) => r.status === 200).length;

    // Wait for 1 token to refill (CAPTAIN refill=0.33/sec → ~3s for 1 token)
    console.log("    Waiting 4s for captain bucket refill...");
    await new Promise((r) => setTimeout(r, 4000));

    // Try again — should get at least 1 success
    const afterWait = await fetch(`${base}/api/cabildos`, {
      headers: { Authorization: `Bearer ${cap2Token}` },
    });

    if (afterWait.status === 200 && exhaustedOk <= 20) {
      passed++;
      console.log(`    PASS: Request succeeded after waiting for refill`);
    } else {
      failures.push({
        test: "Rate limit reset after refill window",
        expected: "200 after waiting for refill",
        actual: `${afterWait.status} after ${exhaustedOk} exhausted`,
      });
      console.log(`    FAIL: ${afterWait.status} after ${exhaustedOk} exhausted`);
    }

    // ── Test 5: Independent limits across users ──────────────────
    total++;
    console.log("  Test 5: Independent limits — exhausting admin doesn't block captain");

    // Login fresh instances
    const admin2Token = await login(base, ADMIN);
    const cap3Token = await login(base, CAPITANA);

    // Exhaust admin first (60 requests)
    await fireBurst(base, admin2Token, 61);

    // Now captain should still have full capacity (20)
    const capIndependent = await fireBurst(base, cap3Token, 25);
    const capIndependentOk = capIndependent.filter((r) => r.status === 200).length;
    const capIndependent429 = capIndependent.filter((r) => r.status === 429).length;

    if (capIndependentOk === 20 && capIndependent429 === 5) {
      passed++;
      console.log(`    PASS: Captain ${capIndependentOk}/${capIndependent429} after admin exhausted`);
    } else {
      failures.push({
        test: "Independent rate limits across users",
        expected: "20 ok, 5 429s for captain after admin exhausted",
        actual: `${capIndependentOk} ok, ${capIndependent429} 429s`,
      });
      console.log(`    FAIL: ${capIndependentOk}/${capIndependent429} for captain after admin exhausted`);
    }

    // ── Report ──────────────────────────────────────────────────
    console.log("[Report] Generating report...");
    await stopServer(ctx);

    const { createReporter, addSuite, writeReport } = await import("../../lib/reporter.mjs");
    const rep = createReporter();
    addSuite(rep, "chaos/rate-limit", {
      total,
      passed,
      failed: total - passed,
      skipped: 0,
      duration_ms: Date.now() - startedAt,
      failures,
    });
    writeReport(rep, qaDir);

    const verdict = total === passed ? "PASS" : "WARN";
    console.log(`Verdict: ${verdict} (${passed}/${total})`);
    process.exit(total === passed ? 0 : 1);

  } catch (error) {
    console.error("Rate-limit test error:", error.message);
    console.error("Stack:", error.stack);

    try {
      const { createReporter, addSuite, writeReport } = await import("../../lib/reporter.mjs");
      const rep = createReporter();
      addSuite(rep, "chaos/rate-limit", {
        total: total || 5,
        passed: passed || 0,
        failed: total || 5,
        skipped: 0,
        duration_ms: Date.now() - startedAt,
        failures: [
          ...failures,
          {
            test: "Suite execution",
            expected: "All tests pass",
            actual: error.message,
            detail: error.message,
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

runRateLimitTests();
