#!/usr/bin/env node
import { runSuite, createTestHelper } from "../lib/suite-runner.mjs";
import { loginAdmin, loginCapitana, request, expectStatus } from "../lib/test-utils.mjs";
import { loadSpec, getStatusCodes } from "../lib/spec-reader.mjs";

const spec = loadSpec();
const adminPaths = [
  { method: "POST", path: "/api/admin/cabildos/{cabildoId}/captains/{usuarioId}" },
  { method: "DELETE", path: "/api/admin/cabildos/{cabildoId}/captains/{usuarioId}" },
];

const CABILDO_ID = "5dee2149-4442-486a-9ec5-3c20479d8261";
const FAMILIA_ID = "cd8031c4-d2f7-423c-b5a8-1e98b793690a";
const FAKE_UUID = "00000000-0000-0000-0000-000000000000";
const EXISTING_MIEMBRO_ID = "c73da2ef-a84e-4d47-8e5a-e2d45b7af7d6";

async function registerCaptainUser(base, adminToken) {
  const unique = `captain_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@tatachio.com`;
  const { status, data } = await request(base, "POST", "/api/auth/register", {
    token: adminToken,
    body: {
      email: unique,
      password: "cap123",
      nombre: "Test Captain",
      rol: "CAPTAIN",
      cabildoId: CABILDO_ID,
    },
  });
  expectStatus(status, 201, "register captain");
  return data.id;
}

export async function main() {
  return runSuite({ name: "api/admin" }, async ({ base }) => {
    const t = createTestHelper("api/admin");

    const adminToken = await loginAdmin(base);
    const capitanaToken = await loginCapitana(base);

    // ── POST /api/admin/cabildos/{cabildoId}/captains/{usuarioId} ──────────
    console.log("\nPOST /api/admin/cabildos/{cabildoId}/captains/{usuarioId}");

    await t.test("admin assigns existing CAPTAIN user → 201", async () => {
      const captainUserId = await registerCaptainUser(base, adminToken);
      const { status, data } = await request(base, "POST", `/api/admin/cabildos/${CABILDO_ID}/captains/${captainUserId}`, {
        token: adminToken,
      });
      expectStatus(status, 201, "assign captain");
      if (!data.usuarioId || !data.cabildoId || data.rolEnCabildo !== "CAPTAIN") {
        throw new Error(`Invalid response shape: ${JSON.stringify(data)}`);
      }
    });

    await t.test("admin assigns non-existent user → 404", async () => {
      const { status, data } = await request(base, "POST", `/api/admin/cabildos/${CABILDO_ID}/captains/${FAKE_UUID}`, {
        token: adminToken,
      });
      expectStatus(status, 404, "assign non-existent user");
    });

    await t.test("capitana tries to assign captain → 403", async () => {
      const captainUserId = await registerCaptainUser(base, adminToken);
      const { status, data } = await request(base, "POST", `/api/admin/cabildos/${CABILDO_ID}/captains/${captainUserId}`, {
        token: capitanaToken,
      });
      expectStatus(status, 403, "capitana assign captain");
    });

    await t.test("without token → 401", async () => {
      const { status, data } = await request(base, "POST", `/api/admin/cabildos/${CABILDO_ID}/captains/${FAKE_UUID}`);
      expectStatus(status, 401, "no token");
    });

    await t.test("admin assigns already-assigned captain → 409", async () => {
      const captainUserId = await registerCaptainUser(base, adminToken);
      // First assignment
      await request(base, "POST", `/api/admin/cabildos/${CABILDO_ID}/captains/${captainUserId}`, { token: adminToken });
      // Second assignment should conflict
      const { status, data } = await request(base, "POST", `/api/admin/cabildos/${CABILDO_ID}/captains/${captainUserId}`, {
        token: adminToken,
      });
      expectStatus(status, 409, "already assigned");
    });

    await t.test("admin assigns non-CAPTAIN user → 400", async () => {
      // Register a user with ADMINISTRATOR role
      const unique = `admin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@tatachio.com`;
      const { status: regStatus, data: regData } = await request(base, "POST", "/api/auth/register", {
        token: adminToken,
        body: { email: unique, password: "admin123", nombre: "Test Admin", rol: "ADMINISTRATOR" },
      });
      expectStatus(regStatus, 201, "register admin user");
      const adminUserId = regData.id;

      const { status, data } = await request(base, "POST", `/api/admin/cabildos/${CABILDO_ID}/captains/${adminUserId}`, {
        token: adminToken,
      });
      expectStatus(status, 400, "assign non-captain user");
    });

    // ── DELETE /api/admin/cabildos/{cabildoId}/captains/{usuarioId} ─────────
    console.log("\nDELETE /api/admin/cabildos/{cabildoId}/captains/{usuarioId}");

    await t.test("admin removes assignment → 204", async () => {
      const captainUserId = await registerCaptainUser(base, adminToken);
      await request(base, "POST", `/api/admin/cabildos/${CABILDO_ID}/captains/${captainUserId}`, { token: adminToken });
      const { status, data } = await request(base, "DELETE", `/api/admin/cabildos/${CABILDO_ID}/captains/${captainUserId}`, {
        token: adminToken,
      });
      expectStatus(status, 204, "remove captain");
    });

    await t.test("capitana tries to remove captain → 403", async () => {
      const captainUserId = await registerCaptainUser(base, adminToken);
      await request(base, "POST", `/api/admin/cabildos/${CABILDO_ID}/captains/${captainUserId}`, { token: adminToken });
      const { status, data } = await request(base, "DELETE", `/api/admin/cabildos/${CABILDO_ID}/captains/${captainUserId}`, {
        token: capitanaToken,
      });
      expectStatus(status, 403, "capitana remove captain");
    });

    await t.test("without token → 401", async () => {
      const { status, data } = await request(base, "DELETE", `/api/admin/cabildos/${CABILDO_ID}/captains/${FAKE_UUID}`);
      expectStatus(status, 401, "no token");
    });

    await t.test("admin removes non-existent assignment → 404", async () => {
      const { status, data } = await request(base, "DELETE", `/api/admin/cabildos/${CABILDO_ID}/captains/${FAKE_UUID}`, {
        token: adminToken,
      });
      expectStatus(status, 404, "remove non-existent assignment");
    });

    // ── Role isolation (from spec) ──────────────────────────────────────────
    console.log("\nRole isolation");

    await t.test("capitana GET /api/cabildos → 200 scoped to own cabildo", async () => {
      const { status, data } = await request(base, "GET", "/api/cabildos", { token: capitanaToken });
      expectStatus(status, 200, "capitana list cabildos");
      if (!Array.isArray(data)) throw new Error(`Expected array, got ${typeof data}`);
      for (const c of data) {
        if (c.id !== CABILDO_ID) {
          throw new Error(`Capitana scope leak: cabildo ${c.id} returned, expected only ${CABILDO_ID}`);
        }
      }
    });

    await t.test("capitana POST /api/miembros → 201 (backend allows capitana create)", async () => {
      const { status, data } = await request(base, "POST", "/api/miembros", {
        token: capitanaToken,
        body: {
          tipoIdentificacion: "CC",
          numeroDocumento: `888${Date.now().toString().slice(-5)}`,
          nombres: "TEST",
          apellidos: "ISOLATION",
          fechaNacimiento: "01/01/1990",
          parentesco: "PA",
          sexo: "M",
          integrantes: 1,
          familiaId: FAMILIA_ID,
          cabildoId: CABILDO_ID,
        },
      });
      expectStatus(status, 201, "capitana create miembro");
      if (!data.id || data.cabildoId !== CABILDO_ID) {
        throw new Error(`Invalid miembro response: ${JSON.stringify(data)}`);
      }
    });

    await t.test("capitana DELETE /api/miembros/{id} → 403 (DELETE is admin-only)", async () => {
      const { status, data } = await request(base, "DELETE", `/api/miembros/${EXISTING_MIEMBRO_ID}`, {
        token: capitanaToken,
      });
      expectStatus(status, 403, "capitana delete miembro");
    });

    return t.finish();
  });
}

main().catch((err) => {
  console.error("Admin suite crashed:", err);
  process.exit(1);
});