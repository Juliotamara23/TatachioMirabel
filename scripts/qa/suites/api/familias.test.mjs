#!/usr/bin/env node
import { loadSpec, getStatusCodes } from "../../lib/spec-reader.mjs";
import { runSuite, createTestHelper } from "../../lib/suite-runner.mjs";
import { loginAdmin, loginCapitana, request, expectStatus } from "../../lib/test-utils.mjs";

const spec = loadSpec();
const status = {
  getList: getStatusCodes(spec, "GET", "/api/familias"),
  post: getStatusCodes(spec, "POST", "/api/familias"),
  getById: getStatusCodes(spec, "GET", "/api/familias/{id}"),
  put: getStatusCodes(spec, "PUT", "/api/familias/{id}"),
  delete: getStatusCodes(spec, "DELETE", "/api/familias/{id}"),
};

console.log("[familias] Contract status codes loaded:", status);

await runSuite({ name: "api/familias", seed: true, start: true }, async ({ base }) => {
  const h = createTestHelper("api/familias");
  const adminToken = await loginAdmin(base);
  const capitanaToken = await loginCapitana(base);

  const cabTatachio = "5dee2149-4442-486a-9ec5-3c20479d8261";
  const familiaId = "cd8031c4-d2f7-423c-b5a8-1e98b793690a";
  const nonExistentId = "00000000-0000-0000-0000-000000000000";
  let createdFamiliaId = null;

  // ── GET /api/familias ────────────────────────────────────────────────
  console.log("\nGET /api/familias");

  await h.test("returns 200 and an array (ADMIN)", async () => {
    const { status: s, data } = await request(base, "GET", "/api/familias", { token: adminToken });
    expectStatus(s, 200, "GET /api/familias ADMIN");
    if (!Array.isArray(data)) throw new Error("Response is not an array");
    if (data.length === 0) throw new Error("Expected at least one familia");
  });

  await h.test("filter by cabildoId returns only matching familias", async () => {
    const { status: sAll, data: all } = await request(base, "GET", "/api/familias", { token: adminToken });
    expectStatus(sAll, 200, "GET /api/familias all");
    const { status: sFiltered, data: filtered } = await request(base, "GET", `/api/familias?cabildoId=${cabTatachio}`, { token: adminToken });
    expectStatus(sFiltered, 200, "GET /api/familias filtered");
    if (!Array.isArray(filtered)) throw new Error("Filtered response is not an array");
    if (filtered.length >= all.length) throw new Error(`Filtered (${filtered.length}) should be fewer than all (${all.length})`);
    for (const f of filtered) {
      if (f.cabildoId !== cabTatachio) throw new Error(`Familia ${f.id} has cabildoId ${f.cabildoId}, expected ${cabTatachio}`);
    }
  });

  await h.test("returns 401 without token", async () => {
    const { status: s } = await request(base, "GET", "/api/familias");
    expectStatus(s, 401, "GET /api/familias no token");
  });

  await h.test("capitana sees only her cabildo's familias", async () => {
    const { status: s, data } = await request(base, "GET", "/api/familias", { token: capitanaToken });
    expectStatus(s, 200, "GET /api/familias capitana");
    if (!Array.isArray(data)) throw new Error("Capitana response is not an array");
    for (const f of data) {
      if (f.cabildoId !== cabTatachio) throw new Error(`Capitana scoping violated: familia ${f.id} belongs to ${f.cabildoId}`);
    }
  });

  // ── GET /api/familias/:id ────────────────────────────────────────────
  console.log("\nGET /api/familias/:id");

  await h.test("returns 200 for a valid familia id (with miembros)", async () => {
    const { status: s, data } = await request(base, "GET", `/api/familias/${familiaId}`, { token: adminToken });
    expectStatus(s, 200, "GET /api/familias/:id valid");
    if (data.id !== familiaId) throw new Error(`Expected id ${familiaId}, got ${data.id}`);
    if (typeof data.numero !== "number") throw new Error("Missing numero field");
    if (!Array.isArray(data.miembros)) throw new Error("Missing miembros array");
  });

  await h.test("returns 404 for a non-existent familia id", async () => {
    const { status: s } = await request(base, "GET", `/api/familias/${nonExistentId}`, { token: adminToken });
    expectStatus(s, 404, "GET /api/familias/:id not found");
  });

  await h.test("returns 401 without token", async () => {
    const { status: s } = await request(base, "GET", `/api/familias/${familiaId}`);
    expectStatus(s, 401, "GET /api/familias/:id no token");
  });

  // ── POST /api/familias ───────────────────────────────────────────────
  console.log("\nPOST /api/familias");

  await h.test("returns 201 with valid body", async () => {
    const body = { numero: 999, direccion: "Calle Test 999", cabildoId: cabTatachio };
    const { status: s, data } = await request(base, "POST", "/api/familias", { token: adminToken, body });
    expectStatus(s, 201, "POST /api/familias valid");
    if (!data.id) throw new Error("Response missing id");
    if (data.numero !== 999) throw new Error(`Expected numero 999, got ${data.numero}`);
    if (data.cabildoId !== cabTatachio) throw new Error(`Expected cabildoId ${cabTatachio}, got ${data.cabildoId}`);
    createdFamiliaId = data.id;
  });

  await h.test("returns 400 with missing required fields", async () => {
    const body = { direccion: "Sin numero ni cabildo" };
    const { status: s } = await request(base, "POST", "/api/familias", { token: adminToken, body });
    expectStatus(s, 400, "POST /api/familias missing fields");
  });

  await h.test("returns 400 with invalid cabildoId format", async () => {
    const body = { numero: 998, cabildoId: "not-a-uuid" };
    const { status: s } = await request(base, "POST", "/api/familias", { token: adminToken, body });
    expectStatus(s, 400, "POST /api/familias invalid cabildoId");
  });

  await h.test("returns 403 when capitana tries to create", async () => {
    const body = { numero: 997, cabildoId: cabTatachio };
    const { status: s } = await request(base, "POST", "/api/familias", { token: capitanaToken, body });
    expectStatus(s, 403, "POST /api/familias capitana forbidden");
  });

  // ── PUT /api/familias/:id ────────────────────────────────────────────
  console.log("\nPUT /api/familias/:id");

  await h.test("returns 200 on valid update", async () => {
    if (!createdFamiliaId) throw new Error("No created familia to update");
    const body = { numero: 999, direccion: "Calle Test 999 Updated" };
    const { status: s, data } = await request(base, "PUT", `/api/familias/${createdFamiliaId}`, { token: adminToken, body });
    expectStatus(s, 200, "PUT /api/familias/:id valid");
    if (data.direccion !== "Calle Test 999 Updated") throw new Error(`Unexpected direccion: ${data.direccion}`);
  });

  await h.test("returns 404 for non-existent familia (contract)", async () => {
    const body = { numero: 1 };
    const { status: s } = await request(base, "PUT", `/api/familias/${nonExistentId}`, { token: adminToken, body });
    expectStatus(s, 404, "PUT /api/familias/:id not found (contract)");
  });

  await h.test("returns 401 without token", async () => {
    if (!createdFamiliaId) throw new Error("No created familia to update");
    const body = { numero: 1 };
    const { status: s } = await request(base, "PUT", `/api/familias/${createdFamiliaId}`, { body });
    expectStatus(s, 401, "PUT /api/familias/:id no token");
  });

  // ── DELETE /api/familias/:id ─────────────────────────────────────────
  console.log("\nDELETE /api/familias/:id");

  await h.test("returns 204 on valid delete", async () => {
    if (!createdFamiliaId) throw new Error("No created familia to delete");
    const { status: s } = await request(base, "DELETE", `/api/familias/${createdFamiliaId}`, { token: adminToken });
    expectStatus(s, 204, "DELETE /api/familias/:id valid");
  });

  await h.test("returns 404 for already-deleted familia (contract)", async () => {
    if (!createdFamiliaId) throw new Error("No created familia to delete again");
    const { status: s } = await request(base, "DELETE", `/api/familias/${createdFamiliaId}`, { token: adminToken });
    expectStatus(s, 404, "DELETE /api/familias/:id already deleted (contract)");
  });

  await h.test("returns 404 for non-existent familia (contract)", async () => {
    const { status: s } = await request(base, "DELETE", `/api/familias/${nonExistentId}`, { token: adminToken });
    expectStatus(s, 404, "DELETE /api/familias/:id not found (contract)");
  });

  await h.test("returns 401 without token", async () => {
    const { status: s } = await request(base, "DELETE", `/api/familias/${nonExistentId}`);
    expectStatus(s, 401, "DELETE /api/familias/:id no token");
  });

  await h.test("returns 403 when capitana tries to delete", async () => {
    const { status: s } = await request(base, "DELETE", `/api/familias/${familiaId}`, { token: capitanaToken });
    expectStatus(s, 403, "DELETE /api/familias/:id capitana forbidden");
  });

  return h.finish();
});