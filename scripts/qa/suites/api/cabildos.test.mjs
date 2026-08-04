#!/usr/bin/env node
import { loadSpec, getStatusCodes } from "../../lib/spec-reader.mjs";
import { runSuite, createTestHelper } from "../../lib/suite-runner.mjs";
import { loginAdmin, loginCapitana, request, expectStatus } from "../../lib/test-utils.mjs";

const spec = loadSpec();

/**
 * Get expected status codes from OpenAPI spec for a cabildos endpoint
 * @param {string} method - HTTP method
 * @param {string} path - Path pattern
 * @returns {string[]} Expected status codes from spec
 */
function getContractCodes(method, path) {
  return getStatusCodes(spec, method, path);
}

/**
 * Get the "success" status code (2xx) from contract codes
 * @param {string[]} codes - Status codes from spec
 * @returns {string} Success code (200, 201, 204)
 */
function getSuccessCode(codes) {
  return codes.find(c => c.startsWith("2")) || "200";
}

/**
 * Get the "not found" status code (404) from contract codes
 * @param {string[]} codes - Status codes from spec
 * @returns {string} Not found code (404)
 */
function getNotFoundCode(codes) {
  return codes.find(c => c === "404") || "404";
}

/**
 * Get the "unauthorized" status code (401) from contract codes
 * @param {string[]} codes - Status codes from spec
 * @returns {string} Unauthorized code (401)
 */
function getUnauthorizedCode(codes) {
  return codes.find(c => c === "401") || "401";
}

/**
 * Get the "forbidden" status code (403) from contract codes
 * @param {string[]} codes - Status codes from spec
 * @returns {string} Forbidden code (403)
 */
function getForbiddenCode(codes) {
  return codes.find(c => c === "403") || "403";
}

/**
 * Get the "validation error" status code (400) from contract codes
 * @param {string[]} codes - Status codes from spec
 * @returns {string} Validation error code (400)
 */
function getValidationCode(codes) {
  return codes.find(c => c === "400") || "400";
}

await runSuite({ name: "api/cabildos", seed: true, start: true }, async ({ base }) => {
  const t = createTestHelper("api/cabildos");

  // Load tokens
  const adminToken = await loginAdmin(base);
  const capitanaToken = await loginCapitana(base);

  // Fetch seed cabildos for ID-dependent tests
  const listRes = await request(base, "GET", "/api/cabildos", { token: adminToken });
  expectStatus(listRes.status, 200, "seed list");
  const allCabildos = listRes.data;
  const firstId = allCabildos[0]?.id;
  const fakeId = "00000000-0000-0000-0000-000000000000";

  if (!firstId) {
    t.addFailure("seed data", new Error("No cabildos in seed to test with"));
    return t.finish();
  }

  // Contract codes for each endpoint
  const listCodes = getContractCodes("GET", "/api/cabildos");
  const createCodes = getContractCodes("POST", "/api/cabildos");
  const getByIdCodes = getContractCodes("GET", "/api/cabildos/{id}");
  const updateCodes = getContractCodes("PUT", "/api/cabildos/{id}");
  const deleteCodes = getContractCodes("DELETE", "/api/cabildos/{id}");

  const LIST_OK = getSuccessCode(listCodes);
  const CREATE_OK = getSuccessCode(createCodes);
  const GET_OK = getSuccessCode(getByIdCodes);
  const UPDATE_OK = getSuccessCode(updateCodes);
  const DELETE_OK = getSuccessCode(deleteCodes);
  const NOT_FOUND = getNotFoundCode(getByIdCodes); // same for all :id endpoints
  const UNAUTH = getUnauthorizedCode(listCodes);   // same for all
  const FORBIDDEN = getForbiddenCode(createCodes); // same for mutating endpoints
  const VALIDATION = getValidationCode(createCodes);

  // ── GET /api/cabildos ──────────────────────────────────────────────────────

  await t.test("GET /api/cabildos → 200 array for admin", async () => {
    const res = await request(base, "GET", "/api/cabildos", { token: adminToken });
    expectStatus(res.status, LIST_OK, "admin list");
    if (!Array.isArray(res.data)) throw new Error(`Expected array, got ${typeof res.data}`);
    if (res.data.length < 3) throw new Error(`Expected at least 3 cabildos from seed, got ${res.data.length}`);
  });

  await t.test("GET /api/cabildos → 200 array for capitana", async () => {
    const res = await request(base, "GET", "/api/cabildos", { token: capitanaToken });
    expectStatus(res.status, LIST_OK, "capitana list");
    if (!Array.isArray(res.data)) throw new Error(`Expected array, got ${typeof res.data}`);
  });

  await t.test("GET /api/cabildos → 401 without token", async () => {
    const res = await request(base, "GET", "/api/cabildos");
    expectStatus(res.status, UNAUTH, "no token");
  });

  await t.test("GET /api/cabildos → 401 with invalid token", async () => {
    const res = await request(base, "GET", "/api/cabildos", { token: "invalid.token.here" });
    expectStatus(res.status, UNAUTH, "invalid token");
  });

  // ── GET /api/cabildos/{id} ─────────────────────────────────────────────────

  await t.test("GET /api/cabildos/{id} → 200 for existing cabildo (admin)", async () => {
    const res = await request(base, "GET", `/api/cabildos/${firstId}`, { token: adminToken });
    expectStatus(res.status, GET_OK, "admin get by id");
    if (res.data.id !== firstId) throw new Error(`Expected id ${firstId}, got ${res.data.id}`);
    if (!res.data.nombre) throw new Error("Response missing nombre");
    if (!res.data.resguardo) throw new Error("Response missing resguardo");
  });

  await t.test("GET /api/cabildos/{id} → 200 for existing cabildo (capitana)", async () => {
    const res = await request(base, "GET", `/api/cabildos/${firstId}`, { token: capitanaToken });
    expectStatus(res.status, GET_OK, "capitana get by id");
  });

  await t.test("GET /api/cabildos/{id} → 404 for non-existent cabildo", async () => {
    const res = await request(base, "GET", `/api/cabildos/${fakeId}`, { token: adminToken });
    expectStatus(res.status, NOT_FOUND, "non-existent");
  });

  await t.test("GET /api/cabildos/{id} → 401 without token", async () => {
    const res = await request(base, "GET", `/api/cabildos/${firstId}`);
    expectStatus(res.status, UNAUTH, "no token");
  });

  // ── POST /api/cabildos ─────────────────────────────────────────────────────

  await t.test("POST /api/cabildos → 201 valid cabildo for admin", async () => {
    const res = await request(base, "POST", "/api/cabildos", {
      token: adminToken,
      body: {
        nombre: "Test Cabildo QA",
        resguardo: "Resguardo QA",
        comunidad: "Comunidad QA",
        vigencia: 2026,
      },
    });
    expectStatus(res.status, CREATE_OK, "admin create");
    if (!res.data.id) throw new Error("Response missing id");
    if (res.data.nombre !== "Test Cabildo QA") throw new Error(`Unexpected nombre: ${res.data.nombre}`);
  });

  await t.test("POST /api/cabildos → 400 missing nombre", async () => {
    const res = await request(base, "POST", "/api/cabildos", {
      token: adminToken,
      body: {
        resguardo: "Resguardo QA",
        comunidad: "Comunidad QA",
        vigencia: 2026,
      },
    });
    expectStatus(res.status, VALIDATION, "missing nombre");
  });

  await t.test("POST /api/cabildos → 400 missing resguardo", async () => {
    const res = await request(base, "POST", "/api/cabildos", {
      token: adminToken,
      body: {
        nombre: "Test Cabildo QA",
        comunidad: "Comunidad QA",
        vigencia: 2026,
      },
    });
    expectStatus(res.status, VALIDATION, "missing resguardo");
  });

  await t.test("POST /api/cabildos → 400 vigencia out of range", async () => {
    const res = await request(base, "POST", "/api/cabildos", {
      token: adminToken,
      body: {
        nombre: "Test Cabildo QA",
        resguardo: "Resguardo QA",
        comunidad: "Comunidad QA",
        vigencia: 1999,
      },
    });
    expectStatus(res.status, VALIDATION, "vigencia out of range");
  });

  await t.test("POST /api/cabildos → 403 for capitana", async () => {
    const res = await request(base, "POST", "/api/cabildos", {
      token: capitanaToken,
      body: {
        nombre: "Test Cabildo QA",
        resguardo: "Resguardo QA",
        comunidad: "Comunidad QA",
        vigencia: 2026,
      },
    });
    expectStatus(res.status, FORBIDDEN, "capitana forbidden");
  });

  await t.test("POST /api/cabildos → 401 without token", async () => {
    const res = await request(base, "POST", "/api/cabildos", {
      body: {
        nombre: "Test Cabildo QA",
        resguardo: "Resguardo QA",
        comunidad: "Comunidad QA",
        vigencia: 2026,
      },
    });
    expectStatus(res.status, UNAUTH, "no token");
  });

  // ── PUT /api/cabildos/{id} ─────────────────────────────────────────────────

  await t.test("PUT /api/cabildos/{id} → 200 update for admin", async () => {
    const res = await request(base, "PUT", `/api/cabildos/${firstId}`, {
      token: adminToken,
      body: { nombre: "Updated QA Cabildo" },
    });
    expectStatus(res.status, UPDATE_OK, "admin update");
    if (res.data.nombre !== "Updated QA Cabildo") throw new Error(`Unexpected nombre: ${res.data.nombre}`);
  });

  await t.test("PUT /api/cabildos/{id} → 404 for non-existent cabildo (contract)", async () => {
    const res = await request(base, "PUT", `/api/cabildos/${fakeId}`, {
      token: adminToken,
      body: { nombre: "Ghost" },
    });
    expectStatus(res.status, NOT_FOUND, "non-existent (contract: 404)");
  });

  await t.test("PUT /api/cabildos/{id} → 403 for capitana", async () => {
    const res = await request(base, "PUT", `/api/cabildos/${firstId}`, {
      token: capitanaToken,
      body: { nombre: "Hacked" },
    });
    expectStatus(res.status, FORBIDDEN, "capitana forbidden");
  });

  await t.test("PUT /api/cabildos/{id} → 401 without token", async () => {
    const res = await request(base, "PUT", `/api/cabildos/${firstId}`, {
      body: { nombre: "No auth" },
    });
    expectStatus(res.status, UNAUTH, "no token");
  });

  // ── DELETE /api/cabildos/{id} ──────────────────────────────────────────────

  // Create a cabildo to delete
  let createdId;
  {
    const res = await request(base, "POST", "/api/cabildos", {
      token: adminToken,
      body: {
        nombre: "To Delete QA",
        resguardo: "Resguardo Delete",
        comunidad: "Comunidad Delete",
        vigencia: 2026,
      },
    });
    createdId = res.data.id;
  }

  await t.test("DELETE /api/cabildos/{id} → 204 for admin", async () => {
    if (!createdId) throw new Error("Failed to create cabildo for delete test");
    const res = await request(base, "DELETE", `/api/cabildos/${createdId}`, { token: adminToken });
    expectStatus(res.status, DELETE_OK, "admin delete");

    // Verify it's gone
    const check = await request(base, "GET", `/api/cabildos/${createdId}`, { token: adminToken });
    expectStatus(check.status, NOT_FOUND, "gone after delete");
  });

  await t.test("DELETE /api/cabildos/{id} → 404 for non-existent cabildo (contract)", async () => {
    const res = await request(base, "DELETE", `/api/cabildos/${fakeId}`, { token: adminToken });
    expectStatus(res.status, NOT_FOUND, "non-existent (contract: 404)");
  });

  await t.test("DELETE /api/cabildos/{id} → 403 for capitana", async () => {
    const res = await request(base, "DELETE", `/api/cabildos/${firstId}`, { token: capitanaToken });
    expectStatus(res.status, FORBIDDEN, "capitana forbidden");
  });

  await t.test("DELETE /api/cabildos/{id} → 401 without token", async () => {
    const res = await request(base, "DELETE", `/api/cabildos/${firstId}`);
    expectStatus(res.status, UNAUTH, "no token");
  });

  return t.finish();
});