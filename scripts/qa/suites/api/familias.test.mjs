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

async function runFamiliasSuite() {
  try {
    // Step 1: Seed DB
    console.log("[1/4] Seeding database...");
    execSync("node lib/seed-db.mjs", { cwd: qaDir, stdio: "inherit" });

    // Step 2: Start server
    console.log("[2/4] Starting server...");
    const { startServer, stopServer } = await import("../../lib/server.mjs");
    const ctx = await startServer({});
    const base = `http://localhost:${ctx.port}`;

    // ── Login to get tokens ──────────────────────────────────────────

    /** @type {string} */
    let adminToken;
    /** @type {string} */
    let capitanaToken;

    {
      const res = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@tatachio.com", password: "admin123" }),
      });
      const data = await res.json();
      if (res.status !== 200) throw new Error(`Admin login failed: ${res.status} ${JSON.stringify(data)}`);
      adminToken = data.token;
    }

    {
      const res = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "capitana@tatachio.com", password: "cap123" }),
      });
      const data = await res.json();
      if (res.status !== 200) throw new Error(`Capitana login failed: ${res.status} ${JSON.stringify(data)}`);
      capitanaToken = data.token;
    }

    // Known cabildo UUIDs from fixtures/seed.json
    const cabTatachio = "5dee2149-4442-486a-9ec5-3c20479d8261";
    const cabSanJuan = "61a3b0fc-d8a3-4e0d-ab00-3883b2b891ab";
    const cabLaEsperanza = "561b87f6-51b2-480c-b9fa-ff6b6742148e";

    // Known familia UUID from fixtures
    const familiaId = "cd8031c4-d2f7-423c-b5a8-1e98b793690a";

    // ── Run test suite ────────────────────────────────────────────────

    console.log("[3/4] Testing familias...\n");

    // ── GET /api/familias ─────────────────────────────────────────────

    console.log("GET /api/familias");

    await test("returns 200 and an array", async () => {
      const res = await fetch(`${base}/api/familias`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
      if (!Array.isArray(data)) throw new Error("Response is not an array");
      if (data.length === 0) throw new Error("Expected at least one familia");
    });

    await test("filter by cabildoId returns only matching familias", async () => {
      const resAll = await fetch(`${base}/api/familias`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const all = await resAll.json();

      const resFiltered = await fetch(`${base}/api/familias?cabildoId=${cabTatachio}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const filtered = await resFiltered.json();
      if (resFiltered.status !== 200) throw new Error(`Expected 200, got ${resFiltered.status}`);
      if (!Array.isArray(filtered)) throw new Error("Response is not an array");
      if (filtered.length >= all.length) throw new Error(`Filtered (${filtered.length}) should be fewer than all (${all.length})`);
      for (const f of filtered) {
        if (f.cabildoId !== cabTatachio) throw new Error(`Familia ${f.id} has cabildoId ${f.cabildoId}, expected ${cabTatachio}`);
      }
    });

    await test("returns 401 without token", async () => {
      const res = await fetch(`${base}/api/familias`);
      if (res.status !== 401) {
        const data = await res.json();
        throw new Error(`Expected 401, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    await test("capitana sees only her cabildo's familias", async () => {
      const res = await fetch(`${base}/api/familias`, {
        headers: { Authorization: `Bearer ${capitanaToken}` },
      });
      const data = await res.json();
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
      if (!Array.isArray(data)) throw new Error("Response is not an array");
      // Capitana is assigned to cabTatachio — every familia must belong to it
      for (const f of data) {
        if (f.cabildoId !== cabTatachio) throw new Error(`Capitana scoping violated: familia ${f.id} belongs to ${f.cabildoId}`);
      }
    });

    // ── GET /api/familias/:id ─────────────────────────────────────────

    console.log("\nGET /api/familias/:id");

    await test("returns 200 for a valid familia id", async () => {
      const res = await fetch(`${base}/api/familias/${familiaId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
      if (data.id !== familiaId) throw new Error(`Expected id ${familiaId}, got ${data.id}`);
      if (typeof data.numero !== "number") throw new Error("Missing numero field");
    });

    await test("returns 404 for a non-existent familia id", async () => {
      const res = await fetch(`${base}/api/familias/00000000-0000-0000-0000-000000000000`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.status !== 404) {
        const data = await res.json();
        throw new Error(`Expected 404, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    await test("returns 401 without token", async () => {
      const res = await fetch(`${base}/api/familias/${familiaId}`);
      if (res.status !== 401) {
        const data = await res.json();
        throw new Error(`Expected 401, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    // ── POST /api/familias ────────────────────────────────────────────

    console.log("\nPOST /api/familias");

    /** @type {string} */
    let createdFamiliaId;

    await test("returns 201 with valid body", async () => {
      const body = { numero: 999, direccion: "Calle Test 999", cabildoId: cabTatachio };
      const res = await fetch(`${base}/api/familias`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}: ${JSON.stringify(data)}`);
      if (!data.id) throw new Error("Response missing id");
      if (data.numero !== 999) throw new Error(`Expected numero 999, got ${data.numero}`);
      if (data.cabildoId !== cabTatachio) throw new Error(`Expected cabildoId ${cabTatachio}, got ${data.cabildoId}`);
      createdFamiliaId = data.id;
    });

    await test("returns 400 with missing required fields", async () => {
      const res = await fetch(`${base}/api/familias`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ direccion: "Sin numero ni cabildo" }),
      });
      if (res.status !== 400) {
        const data = await res.json();
        throw new Error(`Expected 400, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    await test("returns 400 with invalid cabildoId format", async () => {
      const body = { numero: 998, cabildoId: "not-a-uuid" };
      const res = await fetch(`${base}/api/familias`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(body),
      });
      if (res.status !== 400) {
        const data = await res.json();
        throw new Error(`Expected 400, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    await test("returns 403 when capitana tries to create", async () => {
      const body = { numero: 997, cabildoId: cabTatachio };
      const res = await fetch(`${base}/api/familias`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${capitanaToken}`,
        },
        body: JSON.stringify(body),
      });
      if (res.status !== 403) {
        const data = await res.json();
        throw new Error(`Expected 403, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    // ── PUT /api/familias/:id ─────────────────────────────────────────

    console.log("\nPUT /api/familias/:id");

    await test("returns 200 on valid update", async () => {
      const body = { numero: 999, direccion: "Calle Test 999 Updated" };
      const res = await fetch(`${base}/api/familias/${createdFamiliaId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
      if (data.direccion !== "Calle Test 999 Updated") throw new Error(`Unexpected direccion: ${data.direccion}`);
    });

    await test("returns 404 for non-existent familia", async () => {
      const body = { numero: 1 };
      const res = await fetch(`${base}/api/familias/00000000-0000-0000-0000-000000000000`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(body),
      });
      if (res.status !== 404) {
        const data = await res.json();
        throw new Error(`Expected 404, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    // ── DELETE /api/familias/:id ──────────────────────────────────────

    console.log("\nDELETE /api/familias/:id");

    await test("returns 204 on valid delete", async () => {
      const res = await fetch(`${base}/api/familias/${createdFamiliaId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.status !== 204) {
        const data = await res.text();
        throw new Error(`Expected 204, got ${res.status}: ${data}`);
      }
    });

    await test("returns 404 for already-deleted familia", async () => {
      const res = await fetch(`${base}/api/familias/${createdFamiliaId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.status !== 404) {
        const data = await res.json();
        throw new Error(`Expected 404, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    await test("returns 403 when capitana tries to delete", async () => {
      const res = await fetch(`${base}/api/familias/${familiaId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${capitanaToken}` },
      });
      if (res.status !== 403) {
        const data = await res.json();
        throw new Error(`Expected 403, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    // Step 4: Stop + Report
    console.log("\n[4/4] Generating report...");
    await stopServer(ctx);

    const duration = Date.now() - startTime;
    const total = passed + failed;

    const { createReporter, addSuite, writeReport } = await import("../../lib/reporter.mjs");
    const rep = createReporter();
    addSuite(rep, "familias", {
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
    console.error("Familias suite failed:", error.message);
    console.error("Stack:", error.stack);

    try {
      const { createReporter, addSuite, writeReport } = await import("../../lib/reporter.mjs");
      const rep = createReporter();
      addSuite(rep, "familias", {
        total: 1,
        passed: 0,
        failed: 1,
        skipped: 0,
        duration_ms: 0,
        failures: [
          { test: "runFamiliasSuite", expected: "Suite completed", actual: error.message, detail: error.message, blocker: true },
        ],
      });
      writeReport(rep, qaDir);
    } catch (reportError) {
      console.error("Failed to generate error report:", reportError.message);
    }

    process.exit(1);
  }
}

runFamiliasSuite();
