#!/usr/bin/env node
import { runSuite } from "../../lib/suite-runner.mjs";
import { createTestHelper } from "../../lib/suite-runner.mjs";
import { request, loginAdmin } from "../../lib/test-utils.mjs";
import { loadSpec, getStatusCodes } from "../../lib/spec-reader.mjs";

const spec = loadSpec();

/**
 * Get expected status codes from OpenAPI spec for an endpoint
 * @param {string} method - HTTP method
 * @param {string} path - Path pattern
 * @returns {string[]} Array of status code strings
 */
function getExpectedStatuses(method, path) {
  return getStatusCodes(spec, method, path);
}

/**
 * Tolerant assertion: accept a set of valid outcomes, reject 5xx (server crash)
 * @param {number} actual - Actual status code
 * @param {number[]} acceptable - Array of acceptable status codes
 * @param {string} context - Test context for error message
 */
function expectTolerant(actual, acceptable, context = "") {
  if (acceptable.includes(actual)) return;
  if (actual >= 500) {
    throw new Error(`Server error ${actual} (crash)${context ? ` — ${context}` : ""}`);
  }
  throw new Error(`Expected one of [${acceptable.join(", ")}], got ${actual}${context ? ` — ${context}` : ""}`);
}

/**
 * Get valid token for authenticated requests (admin for captain+admin endpoints)
 */
async function getAuthToken(base) {
  return loginAdmin(base);
}

await runSuite(
  { name: "chaos/boundary", seed: true, start: true },
  async ({ base }) => {
    const th = createTestHelper("chaos/boundary");
    const token = await getAuthToken(base);
    const auth = { token };

    const MIEMBROS = "/api/miembros";

    // 1. POST with empty body
    await th.test("POST /api/miembros with empty body → 400", async () => {
      const res = await request(base, "POST", MIEMBROS, {
        ...auth,
        body: undefined,
        headers: { "Content-Type": "application/json" },
      });
      expectTolerant(res.status, [400], "empty body");
    });

    // 2. POST with extra unknown fields → 201 (backend should ignore unknown)
    await th.test("POST /api/miembros with extra unknown fields → 201", async () => {
      const res = await request(base, "POST", MIEMBROS, {
        ...auth,
        body: {
          tipoIdentificacion: "CC",
          numeroDocumento: `123456789${Date.now()}`,
          nombres: "Test Boundary",
          apellidos: "Extra",
          fechaNacimiento: "01/01/2000",
          parentesco: "PA",
          sexo: "M",
          integrantes: 1,
          familiaId: "00000000-0000-0000-0000-000000000001",
          cabildoId: "00000000-0000-0000-0000-000000000001",
          algunCampoInventado: "should be ignored",
          otroFalso: 42,
        },
      });
      expectTolerant(res.status, [201], "extra fields");
    });

    // 3. GET with 1000-char ID → 400 or 404
    await th.test("GET /api/miembros/:id with 1000-char ID → 400 or 404", async () => {
      const longId = "x".repeat(1000);
      const res = await request(base, "GET", `${MIEMBROS}/${longId}`, auth);
      expectTolerant(res.status, [400, 404], "1000-char ID");
    });

    // 4. POST with wrong Content-Type (text/plain) → 400 or 201
    await th.test("POST /api/miembros with text/plain Content-Type → 400 or 201", async () => {
      const res = await fetch(`${base}${MIEMBROS}`, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tipoIdentificacion: "CC",
          numeroDocumento: `ctype${Date.now()}`,
          nombres: "ContentType",
          apellidos: "Test",
          fechaNacimiento: "01/01/2000",
          parentesco: "PA",
          sexo: "M",
          integrantes: 1,
          familiaId: "00000000-0000-0000-0000-000000000001",
          cabildoId: "00000000-0000-0000-0000-000000000001",
        }),
      });
      expectTolerant(res.status, [400, 201], "wrong Content-Type");
    });

    // 5. Negative page → 400 or 200 (default)
    await th.test("GET /api/miembros?page=-1 → 400 or 200 (default)", async () => {
      const res = await request(base, "GET", `${MIEMBROS}?page=-1`, auth);
      expectTolerant(res.status, [400, 200], "negative page");
    });

    // 6. Boolean where string expected → 400
    await th.test("POST /api/miembros with nombres as boolean → 400", async () => {
      const res = await request(base, "POST", MIEMBROS, {
        ...auth,
        body: {
          tipoIdentificacion: "CC",
          numeroDocumento: `bool${Date.now()}`,
          nombres: true,
          apellidos: "Boolean",
          fechaNacimiento: "01/01/2000",
          parentesco: "PA",
          sexo: "M",
          integrantes: 1,
          familiaId: "00000000-0000-0000-0000-000000000001",
          cabildoId: "00000000-0000-0000-0000-000000000001",
        },
      });
      expectTolerant(res.status, [400], "boolean nombres");
    });

    // 7. Array where object expected → 400
    await th.test("POST /api/miembros with array body → 400", async () => {
      const res = await fetch(`${base}${MIEMBROS}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(["not", "an", "object"]),
      });
      expectTolerant(res.status, [400], "array body");
    });

    // 8. Null for required field → 400
    await th.test("POST /api/miembros with null nombres → 400", async () => {
      const res = await request(base, "POST", MIEMBROS, {
        ...auth,
        body: {
          tipoIdentificacion: "CC",
          numeroDocumento: `null${Date.now()}`,
          nombres: null,
          apellidos: "NullTest",
          fechaNacimiento: "01/01/2000",
          parentesco: "PA",
          sexo: "M",
          integrantes: 1,
          familiaId: "00000000-0000-0000-0000-000000000001",
          cabildoId: "00000000-0000-0000-0000-000000000001",
        },
      });
      expectTolerant(res.status, [400], "null required field");
    });

    // 9. Concurrent requests (Promise.all, 5 parallel GET /api/miembros) → all 200
    await th.test("Concurrent requests (5 parallel GETs) → all 200", async () => {
      const requests = Array.from({ length: 5 }, () =>
        request(base, "GET", `${MIEMBROS}?limit=10`, auth)
      );
      const results = await Promise.all(requests);
      for (const res of results) {
        expectTolerant(res.status, [200], "concurrent request");
      }
    });

    // 10. Unicode in fields (中文, ñ) → 200 or 201
    await th.test("POST /api/miembros with unicode in fields → 200 or 201", async () => {
      const res = await request(base, "POST", MIEMBROS, {
        ...auth,
        body: {
          tipoIdentificacion: "CC",
          numeroDocumento: `unicode${Date.now()}`,
          nombres: "Ñoño 中文",
          apellidos: "García ñandú",
          fechaNacimiento: "01/01/2000",
          parentesco: "PA",
          sexo: "M",
          integrantes: 1,
          familiaId: "00000000-0000-0000-0000-000000000001",
          cabildoId: "00000000-0000-0000-0000-000000000001",
        },
      });
      expectTolerant(res.status, [200, 201], "unicode fields");
    });

    return th.finish();
  }
);