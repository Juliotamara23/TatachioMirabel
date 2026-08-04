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

async function runCabildosSuite() {
  try {
    // Step 1: Seed DB
    console.log("[1/4] Seeding database...");
    execSync("node lib/seed-db.mjs", { cwd: qaDir, stdio: "inherit" });

    // Step 2: Start server
    console.log("[2/4] Starting server...");
    const { startServer, stopServer } = await import("../../lib/server.mjs");
    const ctx = await startServer({});
    const base = `http://localhost:${ctx.port}`;

    // Obtain tokens
    let adminToken, capitanaToken;
    {
      const res = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@tatachio.com", password: "admin123" }),
      });
      const data = await res.json();
      adminToken = data.token;
    }
    {
      const res = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "capitana@tatachio.com", password: "cap123" }),
      });
      const data = await res.json();
      capitanaToken = data.token;
    }

    // Fetch seed cabildos for ID-dependent tests
    let allRes = await fetch(`${base}/api/cabildos`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const allCabildos = await allRes.json();
    const firstId = allCabildos[0]?.id;
    const fakeId = "00000000-0000-0000-0000-000000000000";

    // ── Step 3: Run cabildos tests ────────────────────────────────────────
    console.log("[3/4] Testing cabildos...\n");

    // ── GET /api/cabildos ──────────────────────────────────────────────────

    console.log("GET /api/cabildos");

    await test("returns 200 with cabildos array for admin", async () => {
      const res = await fetch(`${base}/api/cabildos`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
      if (!Array.isArray(data)) throw new Error(`Expected array, got ${typeof data}`);
      if (data.length < 3) throw new Error(`Expected at least 3 cabildos from seed, got ${data.length}`);
    });

    await test("returns 200 with cabildos array for capitana", async () => {
      const res = await fetch(`${base}/api/cabildos`, {
        headers: { Authorization: `Bearer ${capitanaToken}` },
      });
      const data = await res.json();
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
      if (!Array.isArray(data)) throw new Error(`Expected array, got ${typeof data}`);
    });

    await test("returns 401 without token", async () => {
      const res = await fetch(`${base}/api/cabildos`);
      if (res.status !== 401) {
        const data = await res.json();
        throw new Error(`Expected 401, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    await test("returns 401 with invalid token", async () => {
      const res = await fetch(`${base}/api/cabildos`, {
        headers: { Authorization: "Bearer invalid.token.here" },
      });
      if (res.status !== 401) {
        const data = await res.json();
        throw new Error(`Expected 401, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    // ── GET /api/cabildos/:id ──────────────────────────────────────────────

    console.log("\nGET /api/cabildos/:id");

    await test("returns 200 for existing cabildo", async () => {
      if (!firstId) throw new Error("No cabildos in seed to test with");
      const res = await fetch(`${base}/api/cabildos/${firstId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
      if (data.id !== firstId) throw new Error(`Expected id ${firstId}, got ${data.id}`);
      if (!data.nombre) throw new Error("Response missing nombre");
      if (!data.resguardo) throw new Error("Response missing resguardo");
    });

    await test("returns 200 for existing cabildo as capitana", async () => {
      const res = await fetch(`${base}/api/cabildos/${firstId}`, {
        headers: { Authorization: `Bearer ${capitanaToken}` },
      });
      if (res.status !== 200) {
        const data = await res.json();
        throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    await test("returns 404 for non-existent cabildo", async () => {
      const res = await fetch(`${base}/api/cabildos/${fakeId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.status !== 404) {
        const data = await res.json();
        throw new Error(`Expected 404, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    await test("returns 401 for :id without token", async () => {
      const res = await fetch(`${base}/api/cabildos/${firstId}`);
      if (res.status !== 401) {
        const data = await res.json();
        throw new Error(`Expected 401, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    // ── POST /api/cabildos ─────────────────────────────────────────────────

    console.log("\nPOST /api/cabildos");

    await test("creates cabildo and returns 201 for admin", async () => {
      const res = await fetch(`${base}/api/cabildos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          nombre: "Test Cabildo QA",
          resguardo: "Resguardo QA",
          comunidad: "Comunidad QA",
          vigencia: 2026,
        }),
      });
      const data = await res.json();
      if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}: ${JSON.stringify(data)}`);
      if (!data.id) throw new Error("Response missing id");
      if (data.nombre !== "Test Cabildo QA") throw new Error(`Unexpected nombre: ${data.nombre}`);
    });

    await test("returns 400 when nombre is missing", async () => {
      const res = await fetch(`${base}/api/cabildos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          resguardo: "Resguardo QA",
          comunidad: "Comunidad QA",
          vigencia: 2026,
        }),
      });
      if (res.status !== 400) {
        const data = await res.json();
        throw new Error(`Expected 400, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    await test("returns 400 when resguardo is missing", async () => {
      const res = await fetch(`${base}/api/cabildos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          nombre: "Test Cabildo QA",
          comunidad: "Comunidad QA",
          vigencia: 2026,
        }),
      });
      if (res.status !== 400) {
        const data = await res.json();
        throw new Error(`Expected 400, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    await test("returns 400 when vigencia is out of range", async () => {
      const res = await fetch(`${base}/api/cabildos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          nombre: "Test Cabildo QA",
          resguardo: "Resguardo QA",
          comunidad: "Comunidad QA",
          vigencia: 1999,
        }),
      });
      if (res.status !== 400) {
        const data = await res.json();
        throw new Error(`Expected 400, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    await test("returns 403 for capitana on POST", async () => {
      const res = await fetch(`${base}/api/cabildos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${capitanaToken}`,
        },
        body: JSON.stringify({
          nombre: "Test Cabildo QA",
          resguardo: "Resguardo QA",
          comunidad: "Comunidad QA",
          vigencia: 2026,
        }),
      });
      if (res.status !== 403) {
        const data = await res.json();
        throw new Error(`Expected 403, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    await test("returns 401 on POST without token", async () => {
      const res = await fetch(`${base}/api/cabildos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: "Test Cabildo QA",
          resguardo: "Resguardo QA",
          comunidad: "Comunidad QA",
          vigencia: 2026,
        }),
      });
      if (res.status !== 401) {
        const data = await res.json();
        throw new Error(`Expected 401, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    // ── PUT /api/cabildos/:id ──────────────────────────────────────────────

    console.log("\nPUT /api/cabildos/:id");

    await test("updates cabildo and returns 200 for admin", async () => {
      if (!firstId) throw new Error("No cabildos in seed to test with");
      const res = await fetch(`${base}/api/cabildos/${firstId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ nombre: "Updated QA Cabildo" }),
      });
      const data = await res.json();
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
      if (data.nombre !== "Updated QA Cabildo") throw new Error(`Unexpected nombre: ${data.nombre}`);
    });

    await test("returns 404 when updating non-existent cabildo", async () => {
      const res = await fetch(`${base}/api/cabildos/${fakeId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ nombre: "Ghost" }),
      });
      if (res.status !== 404) {
        const data = await res.json();
        throw new Error(`Expected 404, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    await test("returns 403 for capitana on PUT", async () => {
      const res = await fetch(`${base}/api/cabildos/${firstId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${capitanaToken}`,
        },
        body: JSON.stringify({ nombre: "Hacked" }),
      });
      if (res.status !== 403) {
        const data = await res.json();
        throw new Error(`Expected 403, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    await test("returns 401 on PUT without token", async () => {
      const res = await fetch(`${base}/api/cabildos/${firstId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: "No auth" }),
      });
      if (res.status !== 401) {
        const data = await res.json();
        throw new Error(`Expected 401, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    // ── DELETE /api/cabildos/:id ───────────────────────────────────────────

    console.log("\nDELETE /api/cabildos/:id");

    let createdId;
    {
      const res = await fetch(`${base}/api/cabildos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          nombre: "To Delete QA",
          resguardo: "Resguardo Delete",
          comunidad: "Comunidad Delete",
          vigencia: 2026,
        }),
      });
      const data = await res.json();
      createdId = data.id;
    }

    await test("deletes cabildo and returns 204 for admin", async () => {
      if (!createdId) throw new Error("Failed to create cabildo for delete test");
      const res = await fetch(`${base}/api/cabildos/${createdId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.status !== 204) {
        const data = await res.json();
        throw new Error(`Expected 204, got ${res.status}: ${JSON.stringify(data)}`);
      }

      // Verify it's gone
      const check = await fetch(`${base}/api/cabildos/${createdId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (check.status !== 404) throw new Error(`Expected 404 after delete, got ${check.status}`);
    });

    await test("returns 404 when deleting non-existent cabildo", async () => {
      const res = await fetch(`${base}/api/cabildos/${fakeId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.status !== 404) {
        const data = await res.json();
        throw new Error(`Expected 404, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    await test("returns 403 for capitana on DELETE", async () => {
      const res = await fetch(`${base}/api/cabildos/${firstId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${capitanaToken}` },
      });
      if (res.status !== 403) {
        const data = await res.json();
        throw new Error(`Expected 403, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    await test("returns 401 on DELETE without token", async () => {
      const res = await fetch(`${base}/api/cabildos/${firstId}`, {
        method: "DELETE",
      });
      if (res.status !== 401) {
        const data = await res.json();
        throw new Error(`Expected 401, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    // ── Step 4: Stop + Report ──────────────────────────────────────────────
    console.log("\n[4/4] Generating report...");
    await stopServer(ctx);

    const duration = Date.now() - startTime;
    const total = passed + failed;

    const { createReporter, addSuite, writeReport } = await import("../../lib/reporter.mjs");
    const rep = createReporter();
    addSuite(rep, "cabildos", {
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
    console.error("Cabildos suite failed:", error.message);
    console.error("Stack:", error.stack);

    try {
      const { createReporter, addSuite, writeReport } = await import("../../lib/reporter.mjs");
      const rep = createReporter();
      addSuite(rep, "cabildos", {
        total: 1,
        passed: 0,
        failed: 1,
        skipped: 0,
        duration_ms: 0,
        failures: [
          { test: "runCabildosSuite", expected: "Suite completed", actual: error.message, detail: error.message, blocker: true },
        ],
      });
      writeReport(rep, qaDir);
    } catch (reportError) {
      console.error("Failed to generate error report:", reportError.message);
    }

    process.exit(1);
  }
}

runCabildosSuite();
