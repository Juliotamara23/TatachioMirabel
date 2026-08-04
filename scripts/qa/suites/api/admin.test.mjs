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

const CABILDO_ID = "5dee2149-4442-486a-9ec5-3c20479d8261";
const FAKE_UUID = "00000000-0000-0000-0000-000000000000";
const EXISTING_MIEMBRO_ID = "c73da2ef-a84e-4d47-8e5a-e2d45b7af7d6";

async function runAdminSuite() {
  try {
    // Step 1: Seed DB
    console.log("[1/4] Seeding database...");
    execSync("node lib/seed-db.mjs", { cwd: qaDir, stdio: "inherit" });

    // Step 2: Start server
    console.log("[2/4] Starting server...");
    const { startServer, stopServer } = await import("../../lib/server.mjs");
    const ctx = await startServer({});
    const base = `http://localhost:${ctx.port}`;

    const headers = (token) => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

    let adminToken;
    let capitanaToken;
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

    // Step 3: Run admin tests
    console.log("[3/4] Testing admin endpoints...\n");

    // ── GET /api/admin/cabildos/:id/captains ──────────────────────────────

    console.log("GET /api/admin/cabildos/:id/captains");

    await test("admin can list captains for a cabildo", async () => {
      const res = await fetch(`${base}/api/admin/cabildos/${CABILDO_ID}/captains`, {
        headers: headers(adminToken),
      });
      const data = await res.json();
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
      if (!Array.isArray(data)) throw new Error(`Expected array, got ${typeof data}`);
    });

    await test("admin gets 404 for non-existent cabildo", async () => {
      const res = await fetch(`${base}/api/admin/cabildos/${FAKE_UUID}/captains`, {
        headers: headers(adminToken),
      });
      if (res.status !== 404) {
        const data = await res.json();
        throw new Error(`Expected 404, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    await test("capitana cannot access captains list → 403", async () => {
      const res = await fetch(`${base}/api/admin/cabildos/${CABILDO_ID}/captains`, {
        headers: headers(capitanaToken),
      });
      if (res.status !== 403) {
        const data = await res.json();
        throw new Error(`Expected 403, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    await test("without token returns 401", async () => {
      const res = await fetch(`${base}/api/admin/cabildos/${CABILDO_ID}/captains`);
      if (res.status !== 401) {
        const data = await res.json();
        throw new Error(`Expected 401, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    // ── Role isolation ─────────────────────────────────────────────────────

    console.log("\nRole isolation");

    await test("capitana GET /api/cabildos returns 200 scoped to own cabildo", async () => {
      const res = await fetch(`${base}/api/cabildos`, {
        headers: headers(capitanaToken),
      });
      const data = await res.json();
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
      if (!Array.isArray(data)) throw new Error(`Expected array, got ${typeof data}`);
      for (const c of data) {
        if (c.id !== CABILDO_ID) {
          throw new Error(`Capitana scope leak: cabildo ${c.id} returned, expected only ${CABILDO_ID}`);
        }
      }
    });

    await test("capitana POST /api/miembros returns 403", async () => {
      const res = await fetch(`${base}/api/miembros`, {
        method: "POST",
        headers: headers(capitanaToken),
        body: JSON.stringify({
          tipoIdentificacion: "CC",
          numeroDocumento: "88888888",
          nombres: "TEST",
          apellidos: "ISOLATION",
          fechaNacimiento: "01/01/1990",
          parentesco: "PA",
          sexo: "M",
          integrantes: 1,
          familiaId: "cd8031c4-d2f7-423c-b5a8-1e98b793690a",
          cabildoId: CABILDO_ID,
        }),
      });
      if (res.status !== 403) {
        const data = await res.json();
        throw new Error(`Expected 403, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    await test("capitana DELETE /api/miembros/:id returns 403", async () => {
      const res = await fetch(`${base}/api/miembros/${EXISTING_MIEMBRO_ID}`, {
        method: "DELETE",
        headers: headers(capitanaToken),
      });
      if (res.status !== 403) {
        const text = await res.text();
        throw new Error(`Expected 403, got ${res.status}: ${text}`);
      }
    });

    // Step 4: Stop + Report
    console.log("\n[4/4] Generating report...");
    await stopServer(ctx);

    const duration = Date.now() - startTime;
    const total = passed + failed;

    const { createReporter, addSuite, writeReport } = await import("../../lib/reporter.mjs");
    const rep = createReporter();
    addSuite(rep, "admin", {
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
    console.error("Admin suite failed:", error.message);
    console.error("Stack:", error.stack);

    try {
      const { createReporter, addSuite, writeReport } = await import("../../lib/reporter.mjs");
      const rep = createReporter();
      addSuite(rep, "admin", {
        total: 1,
        passed: 0,
        failed: 1,
        skipped: 0,
        duration_ms: 0,
        failures: [
          { test: "runAdminSuite", expected: "Suite completed", actual: error.message, detail: error.message, blocker: true },
        ],
      });
      writeReport(rep, qaDir);
    } catch (reportError) {
      console.error("Failed to generate error report:", reportError.message);
    }

    process.exit(1);
  }
}

runAdminSuite();
