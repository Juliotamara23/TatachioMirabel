#!/usr/bin/env node
import { execSync } from "node:child_process";
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

async function runChaosSuite() {
  try {
    console.log("[1/4] Seeding database...");
    execSync("node lib/seed-db.mjs", { cwd: qaDir, stdio: "inherit" });

    console.log("[2/4] Starting server...");
    const { startServer, stopServer } = await import("../../lib/server.mjs");
    const ctx = await startServer({});
    const base = `http://localhost:${ctx.port}`;

    const CREDENTIALS = { email: "admin@tatachio.com", password: "admin123" };

    // Obtain a valid token for authenticated requests
    let token;
    {
      const res = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(CREDENTIALS),
      });
      const data = await res.json();
      token = data.token;
      console.log("  Got valid token for boundary tests\n");
    }

    const authHeaders = () => ({
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    });

    // ═══════════════════════════════════════════════════════════════
    //  Boundary / input validation tests
    // ═══════════════════════════════════════════════════════════════

    console.log("[3/4] Running chaos boundary tests...\n");

    const MIEMBROS = `${base}/api/miembros`;

    // 1. POST with empty body
    await test("POST /api/miembros with empty body → 400", async () => {
      const res = await fetch(MIEMBROS, {
        method: "POST",
        headers: authHeaders(),
        body: "",
      });
      await assertStatus(res, 400);
    });

    // 2. POST with extra unknown fields
    await test("POST /api/miembros with extra unknown fields → 201", async () => {
      const res = await fetch(MIEMBROS, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          nombre: "Test Boundary",
          apellido: "Extra",
          email: `boundary-extra-${Date.now()}@test.com`,
          telefono: "1234567890",
          algunCampoInventado: "should be ignored",
          otroFalso: 42,
        }),
      });
      await assertStatus(res, 201);
    });

    // 3. GET with 1000-char ID
    await test("GET /api/miembros/:id with 1000-char ID → 400", async () => {
      const longId = "x".repeat(1000);
      const res = await fetch(`${MIEMBROS}/${longId}`, {
        headers: authHeaders(),
      });
      await assertStatus(res, 400);
    });

    // 4. POST with wrong Content-Type
    await test("POST /api/miembros with text/plain Content-Type → 400 or parsed", async () => {
      const res = await fetch(MIEMBROS, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          nombre: "ContentType",
          apellido: "Test",
          email: `boundary-ctype-${Date.now()}@test.com`,
          telefono: "1234567890",
        }),
      });
      if (res.status !== 400 && res.status !== 201) {
        throw new Error(`Expected 400 or 201, got ${res.status}`);
      }
    });

    // 5. Negative page
    await test("GET /api/miembros?page=-1 → 400 or defaults to 1", async () => {
      const res = await fetch(`${MIEMBROS}?page=-1`, {
        headers: authHeaders(),
      });
      if (res.status !== 400 && res.status !== 200) {
        throw new Error(`Expected 400 or 200, got ${res.status}`);
      }
    });

    // 6. Boolean where string expected
    await test("POST /api/miembros with nombre as boolean → 400", async () => {
      const res = await fetch(MIEMBROS, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          nombre: true,
          apellido: "Boolean",
          email: `boundary-bool-${Date.now()}@test.com`,
          telefono: "1234567890",
        }),
      });
      await assertStatus(res, 400);
    });

    // 7. Array where object expected
    await test("POST /api/miembros with array body → 400", async () => {
      const res = await fetch(MIEMBROS, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(["not", "an", "object"]),
      });
      await assertStatus(res, 400);
    });

    // 8. Null for required field
    await test("POST /api/miembros with null nombre → 400", async () => {
      const res = await fetch(MIEMBROS, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          nombre: null,
          apellido: "NullTest",
          email: `boundary-null-${Date.now()}@test.com`,
          telefono: "1234567890",
        }),
      });
      await assertStatus(res, 400);
    });

    // 9. Concurrent requests
    await test("Concurrent requests (5 parallel GETs) → all 200", async () => {
      const requests = Array.from({ length: 5 }, () =>
        fetch(`${MIEMBROS}?limit=10`, { headers: authHeaders() })
      );
      const results = await Promise.all(requests);
      for (const res of results) {
        if (res.status !== 200) {
          throw new Error(`Concurrent request got ${res.status}`);
        }
      }
    });

    // 10. Unicode in fields
    await test("POST /api/miembros with unicode in fields → 200 or 201", async () => {
      const res = await fetch(MIEMBROS, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          nombre: "Ñoño 中文",
          apellido: "García ñandú",
          email: `boundary-unicode-${Date.now()}@test.com`,
          telefono: "1234567890",
        }),
      });
      if (res.status !== 200 && res.status !== 201) {
        throw new Error(`Expected 200 or 201, got ${res.status}`);
      }
    });

    console.log("\n  All boundary tests completed.\n");

    // Step 4: Stop + Report
    console.log("[4/4] Generating report...");
    await stopServer(ctx);

    const duration = Date.now() - startTime;
    const total = passed + failed;

    const { createReporter, addSuite, writeReport } = await import("../../lib/reporter.mjs");
    const rep = createReporter();
    addSuite(rep, "chaos/boundary", {
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
    console.error("Chaos boundary suite failed:", error.message);
    console.error("Stack:", error.stack);

    try {
      const { createReporter, addSuite, writeReport } = await import("../../lib/reporter.mjs");
      const rep = createReporter();
      addSuite(rep, "chaos/boundary", {
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
