#!/usr/bin/env node
import { execSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..", "..", "..", "..");
const qaDir = join(projectRoot, "scripts", "qa");

const failures = [];
let passed = 0;
let failed = 0;
const startTime = Date.now();

/**
 * @param {string} name Test name
 * @param {() => Promise<void>} fn Test body
 */
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed++;
    console.log(`  ✗ ${name}: ${error.message}`);
    failures.push({ test: name, expected: "Passed", actual: error.message, detail: error.message });
  }
}

function base64url(str) {
  return Buffer.from(str).toString("base64url");
}

function base64urlDecode(str) {
  return Buffer.from(str, "base64url").toString("utf-8");
}

function signHS256(headerB64, payloadB64, secret) {
  const data = `${headerB64}.${payloadB64}`;
  return createHmac("sha256", secret).update(data).digest("base64url");
}

async function runChaosSuite() {
  try {
    console.log("[1/4] Seeding database...");
    execSync("node lib/seed-db.mjs", { cwd: qaDir, stdio: "inherit" });

    console.log("[2/4] Starting server...");
    const { startServer, stopServer } = await import("../../lib/server.mjs");
    const ctx = await startServer({});
    const base = `http://localhost:${ctx.port}`;

    const PROTECTED = `${base}/api/cabildos`;
    const SA_QA_SECRET = "qa-secret";
    const SA_WRONG_SECRET = "wrong-secret-key";

    // ── Obtain a valid token for tampering tests ──
    console.log("[3/4] Running chaos auth-bypass tests...\n");

    let validToken;
    {
      const res = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@tatachio.com", password: "admin123" }),
      });
      const data = await res.json();
      validToken = data.token;
      console.log("  Got valid token for tampering\n");
    }

    // ═══════════════════════════════════════════════════════════════
    //  Chaos auth-bypass attempts
    // ═══════════════════════════════════════════════════════════════

    await test("No Authorization header → 401", async () => {
      const res = await fetch(PROTECTED);
      await assertStatus(res, 401);
    });

    await test('"Bearer" with no token → 401', async () => {
      const res = await fetch(PROTECTED, {
        headers: { Authorization: "Bearer" },
      });
      await assertStatus(res, 401);
    });

    await test('"Bearer invalidtoken" → 401', async () => {
      const res = await fetch(PROTECTED, {
        headers: { Authorization: "Bearer invalidtoken" },
      });
      await assertStatus(res, 401);
    });

    await test("Tampered JWT (changed payload, kept signature) → 401", async () => {
      const parts = validToken.split(".");
      const headerB64 = parts[0];
      const payloadB64 = parts[1];
      const signature = parts[2];

      const payload = JSON.parse(base64urlDecode(payloadB64));
      payload.rol = "ADMINISTRATOR"; // escalate privilege
      payload.id = "00000000-0000-0000-0000-000000000001"; // different user
      const tamperedPayloadB64 = base64url(JSON.stringify(payload));

      const tamperedToken = `${headerB64}.${tamperedPayloadB64}.${signature}`;

      const res = await fetch(PROTECTED, {
        headers: { Authorization: `Bearer ${tamperedToken}` },
      });
      await assertStatus(res, 401);
    });

    await test("Expired token → 401", async () => {
      const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
      const payload = base64url(JSON.stringify({
        id: "00000000-0000-0000-0000-000000000001",
        rol: "ADMINISTRATOR",
        cabildoId: null,
        exp: Math.floor(Date.now() / 1000) - 7200,
        iat: Math.floor(Date.now() / 1000) - 10800,
      }));
      const sig = signHS256(header, payload, SA_QA_SECRET);
      const expiredToken = `${header}.${payload}.${sig}`;

      const res = await fetch(PROTECTED, {
        headers: { Authorization: `Bearer ${expiredToken}` },
      });
      await assertStatus(res, 401);
    });

    await test('Token signed with alg "none" → 401', async () => {
      const header = base64url(JSON.stringify({ alg: "none", typ: "JWT" }));
      const payload = base64url(JSON.stringify({
        id: "00000000-0000-0000-0000-000000000001",
        rol: "ADMINISTRATOR",
        cabildoId: null,
      }));
      const noneToken = `${header}.${payload}.`;

      const res = await fetch(PROTECTED, {
        headers: { Authorization: `Bearer ${noneToken}` },
      });
      await assertStatus(res, 401);
    });

    await test('Authorization: "Basic ..." → 401', async () => {
      const res = await fetch(PROTECTED, {
        headers: { Authorization: "Basic YWRtaW46YWRtaW4xMjM=" },
      });
      await assertStatus(res, 401);
    });

    await test("Token signed with different secret → 401", async () => {
      const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
      const payload = base64url(JSON.stringify({
        id: "00000000-0000-0000-0000-000000000001",
        rol: "ADMINISTRATOR",
        cabildoId: null,
      }));
      const sig = signHS256(header, payload, SA_WRONG_SECRET);
      const wrongSecretToken = `${header}.${payload}.${sig}`;

      const res = await fetch(PROTECTED, {
        headers: { Authorization: `Bearer ${wrongSecretToken}` },
      });
      await assertStatus(res, 401);
    });

    await test("Empty Authorization header → 401", async () => {
      const res = await fetch(PROTECTED, {
        headers: { Authorization: "" },
      });
      await assertStatus(res, 401);
    });

    console.log("\n  All chaos bypass attempts correctly rejected.\n");

    // Step 4: Stop + Report
    console.log("[4/4] Generating report...");
    await stopServer(ctx);

    const duration = Date.now() - startTime;
    const total = passed + failed;

    const { createReporter, addSuite, writeReport } = await import("../../lib/reporter.mjs");
    const rep = createReporter();
    addSuite(rep, "chaos/auth-bypass", {
      total,
      passed,
      failed,
      skipped: 0,
      duration_ms: duration,
      failures,
    });
    const { json } = writeReport(rep, qaDir);

    console.log(`\nVerdict: ${json.verdict}`);
    console.log(`${passed}/${total} passed${failed > 0 ? `, ${failed} failed` : ""}`);
    process.exit(failed > 0 ? 1 : 0);

  } catch (error) {
    console.error("Chaos auth-bypass suite failed:", error.message);
    console.error("Stack:", error.stack);

    try {
      const { createReporter, addSuite, writeReport } = await import("../../lib/reporter.mjs");
      const rep = createReporter();
      addSuite(rep, "chaos/auth-bypass", {
        total: 1,
        passed: 0,
        failed: 1,
        skipped: 0,
        duration_ms: 0,
        failures: [
          { test: "runChaosSuite", expected: "Suite completed", actual: error.message, detail: error.message, blocker: true },
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
 * Assert that response status matches expected, reading body for error detail.
 * @param {Response} res
 * @param {number} expected
 */
async function assertStatus(res, expected) {
  if (res.status !== expected) {
    const body = await res.text().catch(() => "<read error>");
    throw new Error(`Expected ${expected}, got ${res.status}: ${body}`);
  }
}

runChaosSuite();
