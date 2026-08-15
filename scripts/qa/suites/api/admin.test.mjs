#!/usr/bin/env node
import { runSuite, createTestHelper } from "../../lib/suite-runner.mjs";
import { loginAdmin, loginCapitana, request, expectStatus } from "../../lib/test-utils.mjs";
import { loadSpec, getStatusCodes } from "../../lib/spec-reader.mjs";

const spec = loadSpec();
const adminPaths = [
  { method: "POST", path: "/api/admin/cabildos/{cabildoId}/captains/{usuarioId}" },
  { method: "DELETE", path: "/api/admin/cabildos/{cabildoId}/captains/{usuarioId}" },
];

const CABILDO_ID = "5dee2149-4442-486a-9ec5-3c20479d8261";
const FAMILIA_ID = "cd8031c4-d2f7-423c-b5a8-1e98b793690a";
const FAKE_UUID = "00000000-0000-0000-0000-000000000000";
const EXISTING_MIEMBRO_ID = "c73da2ef-a84e-4d47-8e5a-e2d45b7af7d6";
// San Juan cabildo — has exactly 1 captain in seed (capitana2@tatachio.com).
// Used to test the "last captain" rule without interference from other tests
// that register captains on CABILDO_ID (Tatachio Mirabel).
const SAN_JUAN_CABILDO_ID = "61a3b0fc-d8a3-4e0d-ab00-3883b2b891ab";
const CAPITANA2_USER_ID = "8c716522-f800-4d05-a4c0-31a4da01c346";

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

    await t.test("admin assigns captain already assigned at registration → 409", async () => {
      const captainUserId = await registerCaptainUser(base, adminToken);
      const { status, data } = await request(base, "POST", `/api/admin/cabildos/${CABILDO_ID}/captains/${captainUserId}`, {
        token: adminToken,
      });
      expectStatus(status, 409, "assign captain already assigned");
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
      // Captain is already assigned at registration, so directly test removal
      const { status, data } = await request(base, "DELETE", `/api/admin/cabildos/${CABILDO_ID}/captains/${captainUserId}`, {
        token: adminToken,
      });
      expectStatus(status, 204, "remove captain");
    });

    await t.test("capitana tries to remove captain → 403", async () => {
      const captainUserId = await registerCaptainUser(base, adminToken);
      // Captain is already assigned at registration
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

    await t.test("admin removes the last captain of a cabildo → 409 (issue #72)", async () => {
      // San Juan has exactly 1 captain (capitana2@tatachio.com) from seed.
      // Trying to remove her must fail — a cabildo cannot be left without a captain.
      const { status, data } = await request(base, "DELETE", `/api/admin/cabildos/${SAN_JUAN_CABILDO_ID}/captains/${CAPITANA2_USER_ID}`, {
        token: adminToken,
      });
      expectStatus(status, 409, "remove last captain");
      if (!data.error || !String(data.error).includes("al menos una capitana")) {
        throw new Error(`Expected last-captain error message, got: ${JSON.stringify(data)}`);
      }
    });

    // ── GET /api/admin/captains (issue #72) ────────────────────────────────
    console.log("\nGET /api/admin/captains");

    await t.test("admin lists all captains → 200 (no cabildoId filter)", async () => {
      const { status, data } = await request(base, "GET", "/api/admin/captains", {
        token: adminToken,
      });
      expectStatus(status, 200, "list all captains");
      if (!Array.isArray(data)) throw new Error(`Expected array, got ${typeof data}`);
      if (data.length === 0) throw new Error("Expected at least one captain");
      for (const c of data) {
        if (!c.id || !c.email || !c.nombre) {
          throw new Error(`Invalid captain shape: ${JSON.stringify(c)}`);
        }
        if ("passwordHash" in c) {
          throw new Error("passwordHash leaked in captain list response");
        }
      }
    });

    await t.test("admin lists captains filtered by cabildoId → 200 (issue #72)", async () => {
      const { status, data } = await request(base, "GET", `/api/admin/captains?cabildoId=${CABILDO_ID}`, {
        token: adminToken,
      });
      expectStatus(status, 200, "list captains by cabildo");
      if (!Array.isArray(data)) throw new Error(`Expected array, got ${typeof data}`);
      for (const c of data) {
        if (c.cabildoId !== CABILDO_ID) {
          throw new Error(`Captain ${c.id} has wrong cabildoId: ${c.cabildoId} (expected ${CABILDO_ID})`);
        }
      }
    });

    await t.test("capitana lists captains → 403 (admin-only, issue #72)", async () => {
      const { status } = await request(base, "GET", "/api/admin/captains", {
        token: capitanaToken,
      });
      expectStatus(status, 403, "capitana list captains");
    });

    await t.test("without token → 401 (issue #72)", async () => {
      const { status } = await request(base, "GET", "/api/admin/captains");
      expectStatus(status, 401, "no token list captains");
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