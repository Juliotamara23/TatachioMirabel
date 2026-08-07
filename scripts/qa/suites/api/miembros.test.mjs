#!/usr/bin/env node
import { loadSpec, getStatusCodes } from "../../lib/spec-reader.mjs";
import { runSuite, createTestHelper } from "../../lib/suite-runner.mjs";
import { loginAdmin, loginCapitana, request, expectStatus } from "../../lib/test-utils.mjs";

const spec = loadSpec();

const FAKE_UUID = "00000000-0000-0000-0000-000000000000";
const CABILDO_ID = "5dee2149-4442-486a-9ec5-3c20479d8261";
const FAMILIA_ID = "cd8031c4-d2f7-423c-b5a8-1e98b793690a";

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

async function getRealMiembroId(base, token) {
  const { data } = await request(base, "GET", "/api/miembros", { token });
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("No miembros found in seeded database");
  }
  return data[0].id;
}

await runSuite({ name: "api/miembros", seed: true, start: true }, async ({ base }) => {
  const helper = createTestHelper("api/miembros");

  const adminToken = await loginAdmin(base);
  const capitanaToken = await loginCapitana(base);

  // Fetch a real miembro ID from the seeded data
  const existingMiembroId = await getRealMiembroId(base, adminToken);
  console.log(`  Using real miembro ID: ${existingMiembroId}`);

  // ── GET /api/miembros ─────────────────────────────────────────────────
  const getMiembrosStatusCodes = getStatusCodes(spec, "GET", "/api/miembros");
  console.log(`  GET /api/miembros — expected status codes: ${getMiembrosStatusCodes.join(", ")}`);

  await helper.test("GET /api/miembros returns 200 array as admin", async () => {
    const { status, data } = await request(base, "GET", "/api/miembros", { token: adminToken });
    expectStatus(status, 200, "admin list miembros");
    if (!Array.isArray(data)) throw new Error("Expected array response");
  });

  await helper.test("GET /api/miembros returns 200 array as capitana (scoped)", async () => {
    const { status, data } = await request(base, "GET", "/api/miembros", { token: capitanaToken });
    expectStatus(status, 200, "capitana list miembros");
    if (!Array.isArray(data)) throw new Error("Expected array response");
    for (const m of data) {
      if (m.cabildoId !== CABILDO_ID) {
        throw new Error(`Capitana scope leak: miembro ${m.id} has cabildoId ${m.cabildoId}, expected ${CABILDO_ID}`);
      }
    }
  });

  await helper.test("GET /api/miembros with search query returns 200", async () => {
    const { status, data } = await request(base, "GET", "/api/miembros?search=TEST", { token: adminToken });
    expectStatus(status, 200, "search query");
    if (!Array.isArray(data)) throw new Error("Expected array response");
  });

  await helper.test("GET /api/miembros without token returns 401", async () => {
    const { status } = await request(base, "GET", "/api/miembros");
    expectStatus(status, 401, "no token");
  });

  // ── GET /api/miembros/{id} ─────────────────────────────────────────────
  const getMiembroByIdStatusCodes = getStatusCodes(spec, "GET", "/api/miembros/{id}");
  console.log(`  GET /api/miembros/:id — expected status codes: ${getMiembroByIdStatusCodes.join(", ")}`);

  await helper.test("GET /api/miembros/:id returns 200 for existing miembro as admin", async () => {
    const { status, data } = await request(base, "GET", `/api/miembros/${existingMiembroId}`, { token: adminToken });
    expectStatus(status, 200, "admin get existing miembro");
    if (data.id !== existingMiembroId) throw new Error(`Unexpected id: ${data.id}`);
  });

  await helper.test("GET /api/miembros/:id returns 200 for existing miembro as capitana (same cabildo)", async () => {
    const { status, data } = await request(base, "GET", `/api/miembros/${existingMiembroId}`, { token: capitanaToken });
    expectStatus(status, 200, "capitana get existing miembro");
    if (data.id !== existingMiembroId) throw new Error(`Unexpected id: ${data.id}`);
  });

  await helper.test("GET /api/miembros/:id returns 404 for fake UUID", async () => {
    const { status } = await request(base, "GET", `/api/miembros/${FAKE_UUID}`, { token: adminToken });
    expectStatus(status, 404, "fake UUID");
  });

  await helper.test("GET /api/miembros/:id without token returns 401", async () => {
    const { status } = await request(base, "GET", `/api/miembros/${existingMiembroId}`);
    expectStatus(status, 401, "no token");
  });

  // ── POST /api/miembros ────────────────────────────────────────────────
  const postMiembrosStatusCodes = getStatusCodes(spec, "POST", "/api/miembros");
  console.log(`  POST /api/miembros — expected status codes: ${postMiembrosStatusCodes.join(", ")}`);

  let createdId = null;

  await helper.test("POST /api/miembros returns 201 with valid body as admin", async () => {
    const { status, data } = await request(base, "POST", "/api/miembros", { token: adminToken, body: VALID_MEMBER });
    expectStatus(status, 201, "admin create miembro");
    if (!data.id) throw new Error("Response missing id");
    createdId = data.id;
  });

  await helper.test("POST /api/miembros returns 201 with valid body as capitana (captain+admin per spec)", async () => {
    const { status, data } = await request(base, "POST", "/api/miembros", { token: capitanaToken, body: { ...VALID_MEMBER, numeroDocumento: "88888888" } });
    expectStatus(status, 201, "capitana create miembro");
    if (!data.id) throw new Error("Response missing id");
  });

  await helper.test("POST /api/miembros returns 400 with missing required fields", async () => {
    const { status } = await request(base, "POST", "/api/miembros", { token: adminToken, body: { nombres: "INCOMPLETE" } });
    expectStatus(status, 400, "missing required fields");
  });

  await helper.test("POST /api/miembros without token returns 401", async () => {
    const { status } = await request(base, "POST", "/api/miembros", { body: VALID_MEMBER });
    expectStatus(status, 401, "no token");
  });

  // ── PUT /api/miembros/{id} ─────────────────────────────────────────────
  const putMiembroStatusCodes = getStatusCodes(spec, "PUT", "/api/miembros/{id}");
  console.log(`  PUT /api/miembros/:id — expected status codes: ${putMiembroStatusCodes.join(", ")}`);

  await helper.test("PUT /api/miembros/:id returns 200 updating existing miembro as admin", async () => {
    const { status, data } = await request(base, "PUT", `/api/miembros/${createdId}`, {
      token: adminToken,
      body: { nombres: "UPDATED", direccion: "NEW ADDRESS" },
    });
    expectStatus(status, 200, "admin update miembro");
    if (data.nombres !== "UPDATED") throw new Error(`nombres not updated: ${data.nombres}`);
  });

  await helper.test("PUT /api/miembros/:id returns 404 for non-existent id", async () => {
    const { status } = await request(base, "PUT", `/api/miembros/${FAKE_UUID}`, {
      token: adminToken,
      body: { nombres: "GHOST" },
    });
    expectStatus(status, 404, "non-existent id");
  });

  await helper.test("PUT /api/miembros/:id without token returns 401", async () => {
    const { status } = await request(base, "PUT", `/api/miembros/${existingMiembroId}`, {
      body: { nombres: "NOAUTH" },
    });
    expectStatus(status, 401, "no token");
  });

  // ── DELETE /api/miembros/{id} ──────────────────────────────────────────
  const deleteMiembroStatusCodes = getStatusCodes(spec, "DELETE", "/api/miembros/{id}");
  console.log(`  DELETE /api/miembros/:id — expected status codes: ${deleteMiembroStatusCodes.join(", ")}`);

  await helper.test("DELETE /api/miembros/:id returns 204 deleting existing miembro as admin", async () => {
    const { status } = await request(base, "DELETE", `/api/miembros/${createdId}`, { token: adminToken });
    expectStatus(status, 204, "admin delete miembro");
  });

  await helper.test("DELETE /api/miembros/:id returns 404 for already deleted miembro", async () => {
    const { status } = await request(base, "DELETE", `/api/miembros/${createdId}`, { token: adminToken });
    expectStatus(status, 404, "already deleted");
  });

  await helper.test("DELETE /api/miembros/:id returns 403 for capitana (admin-only per spec)", async () => {
    const { status } = await request(base, "DELETE", `/api/miembros/${existingMiembroId}`, { token: capitanaToken });
    expectStatus(status, 403, "capitana delete forbidden");
  });

  await helper.test("DELETE /api/miembros/:id without token returns 401", async () => {
    const { status } = await request(base, "DELETE", `/api/miembros/${existingMiembroId}`);
    expectStatus(status, 401, "no token");
  });

  return helper.finish();
});