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

const FAKE_UUID = "00000000-0000-0000-0000-000000000000";
const CABILDO_ID = "5dee2149-4442-486a-9ec5-3c20479d8261";
const FAMILIA_ID = "cd8031c4-d2f7-423c-b5a8-1e98b793690a";
const EXISTING_MIEMBRO_ID = "c73da2ef-a84e-4d47-8e5a-e2d45b7af7d6";

const VALID_MEMBER = {
  tipoIdentificacion: "CC",
  numeroDocumento: "99999999",
  nombres: "TEST",
  apellidos: "MEMBER",
  fechaNacimiento: "01/01/1990",
  parentesco: "PA",
  sexo: "M",
  integrantes: 1,
  familiaId: FAMILIA_ID,
  cabildoId: CABILDO_ID,
};

async function runMiembrosSuite() {
  try {
    // Step 1: Seed DB
    console.log("[1/4] Seeding database...");
    execSync("node lib/seed-db.mjs", { cwd: qaDir, stdio: "inherit" });

    // Step 2: Start server
    console.log("[2/4] Starting server...");
    const { startServer, stopServer } = await import("../../lib/server.mjs");
    const ctx = await startServer({});
    const base = `http://localhost:${ctx.port}`;

    // Login helpers
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

    // Step 3: Run miembros tests
    console.log("[3/4] Testing miembros...\n");

    // ── GET /api/miembros ─────────────────────────────────────────────────

    console.log("GET /api/miembros");

    await test("returns 200 and array as admin", async () => {
      const res = await fetch(`${base}/api/miembros`, {
        headers: headers(adminToken),
      });
      const data = await res.json();
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
      if (!Array.isArray(data)) throw new Error("Expected array response");
    });

    await test("returns 200 and array as capitana (scoped)", async () => {
      const res = await fetch(`${base}/api/miembros`, {
        headers: headers(capitanaToken),
      });
      const data = await res.json();
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
      if (!Array.isArray(data)) throw new Error("Expected array response");
      // Capitana is scoped: all returned members should belong to her cabildo
      for (const m of data) {
        if (m.cabildoId !== CABILDO_ID) {
          throw new Error(`Capitana scope leak: miembro ${m.id} has cabildoId ${m.cabildoId}, expected ${CABILDO_ID}`);
        }
      }
    });

    await test("without token returns 401", async () => {
      const res = await fetch(`${base}/api/miembros`);
      if (res.status !== 401) {
        const data = await res.json();
        throw new Error(`Expected 401, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    // ── GET /api/miembros/:id ─────────────────────────────────────────────

    console.log("\nGET /api/miembros/:id");

    await test("returns 200 for existing miembro as admin", async () => {
      const res = await fetch(`${base}/api/miembros/${EXISTING_MIEMBRO_ID}`, {
        headers: headers(adminToken),
      });
      const data = await res.json();
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
      if (data.id !== EXISTING_MIEMBRO_ID) throw new Error(`Unexpected id: ${data.id}`);
    });

    await test("returns 200 for existing miembro as capitana (same cabildo)", async () => {
      const res = await fetch(`${base}/api/miembros/${EXISTING_MIEMBRO_ID}`, {
        headers: headers(capitanaToken),
      });
      const data = await res.json();
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
      if (data.id !== EXISTING_MIEMBRO_ID) throw new Error(`Unexpected id: ${data.id}`);
    });

    await test("returns 404 for fake UUID", async () => {
      const res = await fetch(`${base}/api/miembros/${FAKE_UUID}`, {
        headers: headers(adminToken),
      });
      if (res.status !== 404) {
        const data = await res.json();
        throw new Error(`Expected 404, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    await test("without token returns 401", async () => {
      const res = await fetch(`${base}/api/miembros/${EXISTING_MIEMBRO_ID}`);
      if (res.status !== 401) {
        const data = await res.json();
        throw new Error(`Expected 401, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    // ── POST /api/miembros ────────────────────────────────────────────────

    console.log("\nPOST /api/miembros");

    let createdId;

    await test("returns 201 with valid body as admin", async () => {
      const res = await fetch(`${base}/api/miembros`, {
        method: "POST",
        headers: headers(adminToken),
        body: JSON.stringify(VALID_MEMBER),
      });
      const data = await res.json();
      if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}: ${JSON.stringify(data)}`);
      if (!data.id) throw new Error("Response missing id");
      createdId = data.id;
    });

    await test("returns 400 with missing required fields", async () => {
      const res = await fetch(`${base}/api/miembros`, {
        method: "POST",
        headers: headers(adminToken),
        body: JSON.stringify({ nombres: "INCOMPLETE" }),
      });
      if (res.status !== 400) {
        const data = await res.json();
        throw new Error(`Expected 400, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    await test("without token returns 401", async () => {
      const res = await fetch(`${base}/api/miembros`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(VALID_MEMBER),
      });
      if (res.status !== 401) {
        const data = await res.json();
        throw new Error(`Expected 401, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    await test("capitana returns 403", async () => {
      const res = await fetch(`${base}/api/miembros`, {
        method: "POST",
        headers: headers(capitanaToken),
        body: JSON.stringify(VALID_MEMBER),
      });
      if (res.status !== 403) {
        const data = await res.json();
        throw new Error(`Expected 403, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    // ── PUT /api/miembros/:id ─────────────────────────────────────────────

    console.log("\nPUT /api/miembros/:id");

    await test("returns 200 updating existing miembro as admin", async () => {
      const res = await fetch(`${base}/api/miembros/${createdId}`, {
        method: "PUT",
        headers: headers(adminToken),
        body: JSON.stringify({ nombres: "UPDATED", direccion: "NEW ADDRESS" }),
      });
      const data = await res.json();
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
      if (data.nombres !== "UPDATED") throw new Error(`nombres not updated: ${data.nombres}`);
    });

    await test("returns 404 for non-existent id", async () => {
      const res = await fetch(`${base}/api/miembros/${FAKE_UUID}`, {
        method: "PUT",
        headers: headers(adminToken),
        body: JSON.stringify({ nombres: "GHOST" }),
      });
      if (res.status !== 404) {
        const data = await res.json();
        throw new Error(`Expected 404, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    await test("without token returns 401", async () => {
      const res = await fetch(`${base}/api/miembros/${EXISTING_MIEMBRO_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombres: "NOAUTH" }),
      });
      if (res.status !== 401) {
        const data = await res.json();
        throw new Error(`Expected 401, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    // ── DELETE /api/miembros/:id ──────────────────────────────────────────

    console.log("\nDELETE /api/miembros/:id");

    await test("returns 204 deleting existing miembro as admin", async () => {
      const res = await fetch(`${base}/api/miembros/${createdId}`, {
        method: "DELETE",
        headers: headers(adminToken),
      });
      if (res.status !== 204) {
        const text = await res.text();
        throw new Error(`Expected 204, got ${res.status}: ${text}`);
      }
    });

    await test("returns 404 for already deleted miembro", async () => {
      const res = await fetch(`${base}/api/miembros/${createdId}`, {
        method: "DELETE",
        headers: headers(adminToken),
      });
      if (res.status !== 404) {
        const text = await res.text();
        throw new Error(`Expected 404, got ${res.status}: ${text}`);
      }
    });

    await test("capitana returns 403", async () => {
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
    addSuite(rep, "miembros", {
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
    console.error("Miembros suite failed:", error.message);
    console.error("Stack:", error.stack);

    try {
      const { createReporter, addSuite, writeReport } = await import("../../lib/reporter.mjs");
      const rep = createReporter();
      addSuite(rep, "miembros", {
        total: 1,
        passed: 0,
        failed: 1,
        skipped: 0,
        duration_ms: 0,
        failures: [
          { test: "runMiembrosSuite", expected: "Suite completed", actual: error.message, detail: error.message, blocker: true },
        ],
      });
      writeReport(rep, qaDir);
    } catch (reportError) {
      console.error("Failed to generate error report:", reportError.message);
    }

    process.exit(1);
  }
}

runMiembrosSuite();
