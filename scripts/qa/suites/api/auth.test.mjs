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

async function runAuthSuite() {
  try {
    // Step 1: Seed DB
    console.log("[1/4] Seeding database...");
    execSync("node lib/seed-db.mjs", { cwd: qaDir, stdio: "inherit" });

    // Step 2: Start server
    console.log("[2/4] Starting server...");
    const { startServer, stopServer } = await import("../../lib/server.mjs");
    const ctx = await startServer({});
    const base = `http://localhost:${ctx.port}`;

    // Step 3: Run auth tests
    console.log("[3/4] Testing auth...\n");

    // ── POST /api/auth/login ──────────────────────────────────────────────

    console.log("POST /api/auth/login");

    await test("login with valid admin credentials", async () => {
      const res = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@tatachio.com", password: "admin123" }),
      });
      const data = await res.json();
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
      if (!data.token || typeof data.token !== "string") throw new Error("Response missing token");
    });

    await test("login with valid capitana credentials", async () => {
      const res = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "capitana@tatachio.com", password: "cap123" }),
      });
      const data = await res.json();
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
      if (!data.token || typeof data.token !== "string") throw new Error("Response missing token");
    });

    await test("login with invalid password returns 401", async () => {
      const res = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@tatachio.com", password: "wrongpassword" }),
      });
      if (res.status !== 401) {
        const data = await res.json();
        throw new Error(`Expected 401, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    await test("login with non-existent email returns 401", async () => {
      const res = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "noexiste@tatachio.com", password: "admin123" }),
      });
      if (res.status !== 401) {
        const data = await res.json();
        throw new Error(`Expected 401, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    await test("login with missing fields returns 400", async () => {
      const res = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@tatachio.com" }),
      });
      if (res.status !== 400) {
        const data = await res.json();
        throw new Error(`Expected 400, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    // ── POST /api/auth/register ───────────────────────────────────────────

    console.log("\nPOST /api/auth/register");

    await test("register a new admin user returns 201", async () => {
      const res = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "nuevo-admin@tatachio.com",
          password: "Pass123!",
          nombre: "NUEVO ADMIN",
          rol: "ADMINISTRATOR",
        }),
      });
      const data = await res.json();
      if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}: ${JSON.stringify(data)}`);
      if (!data.id) throw new Error("Response missing user id");
      if (data.email !== "nuevo-admin@tatachio.com") throw new Error(`Unexpected email: ${data.email}`);
      if (data.rol !== "ADMINISTRATOR") throw new Error(`Unexpected rol: ${data.rol}`);
      // Must not leak passwordHash
      if (data.passwordHash) throw new Error("Response leaked passwordHash");
    });

    await test("register a new captain user returns 201", async () => {
      const cabildoId = "5dee2149-4442-486a-9ec5-3c20479d8261";
      const res = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "nueva-capitana@tatachio.com",
          password: "Pass123!",
          nombre: "NUEVA CAPITANA",
          rol: "CAPTAIN",
          cabildoId,
        }),
      });
      const data = await res.json();
      if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}: ${JSON.stringify(data)}`);
      if (data.rol !== "CAPTAIN") throw new Error(`Unexpected rol: ${data.rol}`);
      if (data.passwordHash) throw new Error("Response leaked passwordHash");
    });

    await test("register captain without cabildoId returns 400", async () => {
      const res = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "capitan-sin-cabildo@tatachio.com",
          password: "Pass123!",
          nombre: "CAPITAN SIN CABILDO",
          rol: "CAPTAIN",
        }),
      });
      if (res.status !== 400) {
        const data = await res.json();
        throw new Error(`Expected 400, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    await test("register with duplicate email returns 400", async () => {
      const res = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "admin@tatachio.com",
          password: "Admin123!",
          nombre: "DUPLICADO",
          rol: "ADMINISTRATOR",
        }),
      });
      if (res.status !== 400) {
        const data = await res.json();
        throw new Error(`Expected 400, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    await test("register with missing fields returns 400", async () => {
      const res = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "missing-fields@tatachio.com" }),
      });
      if (res.status !== 400) {
        const data = await res.json();
        throw new Error(`Expected 400, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    // ── GET /api/models ────────────────────────────────────────────────────

    console.log("\nGET /api/models");

    let adminToken;
    {
      const res = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@tatachio.com", password: "admin123" }),
      });
      const data = await res.json();
      adminToken = data.token;
    }

    await test("get models with valid token returns 200", async () => {
      const res = await fetch(`${base}/api/models`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json();
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(data)}`);
      if (!data.models || !Array.isArray(data.models)) throw new Error("Response missing models array");
      if (!data.defaults || typeof data.defaults !== "object") throw new Error("Response missing defaults object");
    });

    await test("get models without token returns 401", async () => {
      const res = await fetch(`${base}/api/models`);
      if (res.status !== 401) {
        const data = await res.json();
        throw new Error(`Expected 401, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    await test("get models with invalid token returns 401", async () => {
      const res = await fetch(`${base}/api/models`, {
        headers: { Authorization: "Bearer invalid.token.here" },
      });
      if (res.status !== 401) {
        const data = await res.json();
        throw new Error(`Expected 401, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    await test("get models with malformed auth header returns 401", async () => {
      const res = await fetch(`${base}/api/models`, {
        headers: { Authorization: "Basic xyz" },
      });
      if (res.status !== 401) {
        const data = await res.json();
        throw new Error(`Expected 401, got ${res.status}: ${JSON.stringify(data)}`);
      }
    });

    // Step 4: Stop + Report
    console.log("\n[4/4] Generating report...");
    await stopServer(ctx);

    const duration = Date.now() - startTime;
    const total = passed + failed;

    const { createReporter, addSuite, writeReport } = await import("../../lib/reporter.mjs");
    const rep = createReporter();
    addSuite(rep, "auth", {
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
    console.error("Auth suite failed:", error.message);
    console.error("Stack:", error.stack);

    try {
      const { createReporter, addSuite, writeReport } = await import("../../lib/reporter.mjs");
      const rep = createReporter();
      addSuite(rep, "auth", {
        total: 1,
        passed: 0,
        failed: 1,
        skipped: 0,
        duration_ms: 0,
        failures: [
          { test: "runAuthSuite", expected: "Suite completed", actual: error.message, detail: error.message, blocker: true },
        ],
      });
      writeReport(rep, qaDir);
    } catch (reportError) {
      console.error("Failed to generate error report:", reportError.message);
    }

    process.exit(1);
  }
}

runAuthSuite();
