#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { runSuite, createTestHelper } from "../../lib/suite-runner.mjs";
import { loginAdmin, loginCapitana } from "../../lib/test-utils.mjs";

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

function runCli(base, token, args) {
  const env = {
    ...process.env,
    TATACHIO_BASE_URL: base,
    TATACHIO_TOKEN: token,
  };
  return spawnSync("apps/cli/node_modules/.bin/tsx", ["apps/cli/src/index.ts", ...args], {
    env,
    encoding: "utf-8",
    cwd: "/home/z/dev/Proyects/TatachioMirabel",
    maxBuffer: 10 * 1024 * 1024,
  });
}

function runCliNoToken(base, args) {
  const env = {
    ...process.env,
    TATACHIO_BASE_URL: base,
  };
  return spawnSync("apps/cli/node_modules/.bin/tsx", ["apps/cli/src/index.ts", ...args], {
    env,
    encoding: "utf-8",
    cwd: "/home/z/dev/Proyects/TatachioMirabel",
    maxBuffer: 10 * 1024 * 1024,
  });
}

function parseJsonOutput(stdout) {
  const text = stdout.trim();
  const start = text.indexOf("{");
  if (start === -1) throw new Error("No JSON object found");

  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) { escaped = false; }
      else if (ch === "\\") { escaped = true; }
      else if (ch === '"') { inString = false; }
    } else {
      if (ch === '"') { inString = true; }
      else if (ch === "{") { depth++; }
      else if (ch === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
  }
  if (end === -1) throw new Error("Unbalanced JSON");

  const parsed = JSON.parse(text.slice(start, end + 1));
  if (parsed && typeof parsed === "object" && "ok" in parsed) {
    if (!parsed.ok) throw new Error(parsed.error || "CLI error");
    return parsed.data;
  }
  return parsed;
}

async function getRealMiembroId(base, token) {
  const res = await fetch(`${base}/api/miembros`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("No miembros found in seeded database");
  }
  return data[0].id;
}

await runSuite({ name: "cli/miembros", seed: true, start: true }, async ({ base }) => {
  const helper = createTestHelper("cli/miembros");

  const adminToken = await loginAdmin(base);
  const existingMiembroId = await getRealMiembroId(base, adminToken);
  console.log(`  Using real miembro ID: ${existingMiembroId}`);

  // ── miembros list --json ─────────────────────────────────────────────────
  await helper.test("miembros list --json returns exit 0 and JSON array as admin", async () => {
    const res = runCli(base, adminToken, ["miembros", "list", "--json"]);
    if (res.status !== 0) throw new Error(`Expected exit 0, got ${res.status}: ${res.stderr}`);
    const data = parseJsonOutput(res.stdout);
    if (!Array.isArray(data)) throw new Error("Expected JSON array output");
  });

  await helper.test("miembros list --search --json returns filtered results", async () => {
    const res = runCli(base, adminToken, ["miembros", "list", "--search", "FANNY", "--json"]);
    if (res.status !== 0) throw new Error(`Expected exit 0, got ${res.status}: ${res.stderr}`);
    const data = parseJsonOutput(res.stdout);
    if (!Array.isArray(data)) throw new Error("Expected JSON array output");
    for (const m of data) {
      const haystack = `${m.nombres} ${m.apellidos}`.toUpperCase();
      if (!haystack.includes("FANNY")) {
        throw new Error(`Search leak: member ${m.id} does not match FANNY`);
      }
    }
  });

  await helper.test("miembros list --cabildo-id --json returns filtered results", async () => {
    // First, get all members without filter to establish baseline
    const allRes = runCli(base, adminToken, ["miembros", "list", "--json"]);
    if (allRes.status !== 0) throw new Error(`Expected exit 0, got ${allRes.status}: ${allRes.stderr}`);
    const allMembers = parseJsonOutput(allRes.stdout);
    if (!Array.isArray(allMembers)) throw new Error("Expected JSON array output for all members");

    // Now run with --cabildo-id filter
    const res = runCli(base, adminToken, ["miembros", "list", "--cabildo-id", CABILDO_ID, "--json"]);
    if (res.status !== 0) throw new Error(`Expected exit 0, got ${res.status}: ${res.stderr}`);
    const filteredMembers = parseJsonOutput(res.stdout);
    if (!Array.isArray(filteredMembers)) throw new Error("Expected JSON array output for filtered members");

    // The --cabildo-id backend filter is FIXED (08a418f): the controller applies
    // where.cabildoId for ADMINISTRATOR. The seed has 438 members from other
    // cabildos, so the filtered list MUST be a proper subset of the full list
    // AND every returned member MUST belong to CABILDO_ID — fail loudly if not.
    const hasOtherCabildos = allMembers.some(m => m.cabildoId !== CABILDO_ID);
    if (hasOtherCabildos && filteredMembers.length >= allMembers.length) {
      throw new Error(
        `Cabildo filter not applied: expected fewer than ${allMembers.length} members, got ${filteredMembers.length}`
      );
    }
    for (const m of filteredMembers) {
      if (m.cabildoId !== CABILDO_ID) {
        throw new Error(`Cabildo filter leak: member ${m.id} has cabildoId ${m.cabildoId}`);
      }
    }
  });

  await helper.test("miembros list --json without token returns auth error", async () => {
    const res = runCliNoToken(base, ["miembros", "list", "--json"]);
    if (res.status === 0) throw new Error("Expected non-zero exit without token");
    const stderr = res.stderr.toLowerCase();
    if (!stderr.includes("token") && !stderr.includes("auth") && !stderr.includes("login")) {
      throw new Error(`Expected auth error in stderr, got: ${res.stderr}`);
    }
  });

  // ── miembros get <id> --json ─────────────────────────────────────────────
  await helper.test("miembros get <id> --json returns single member as admin", async () => {
    const res = runCli(base, adminToken, ["miembros", "get", existingMiembroId, "--json"]);
    if (res.status !== 0) throw new Error(`Expected exit 0, got ${res.status}: ${res.stderr}`);
    const data = parseJsonOutput(res.stdout);
    if (data.id !== existingMiembroId) throw new Error(`Unexpected id: ${data.id}`);
  });

  await helper.test("miembros get <fake-uuid> --json returns error/not found", async () => {
    const res = runCli(base, adminToken, ["miembros", "get", FAKE_UUID, "--json"]);
    if (res.status === 0) throw new Error("Expected non-zero exit for fake UUID");
  });

  await helper.test("miembros get <id> --json without token returns auth error", async () => {
    const res = runCliNoToken(base, ["miembros", "get", existingMiembroId, "--json"]);
    if (res.status === 0) throw new Error("Expected non-zero exit without token");
    const stderr = res.stderr.toLowerCase();
    if (!stderr.includes("token") && !stderr.includes("auth") && !stderr.includes("login")) {
      throw new Error(`Expected auth error in stderr, got: ${res.stderr}`);
    }
  });

  // ── miembros create --json ───────────────────────────────────────────────
  // The Commander flag-parsing bug for --json <body> is FIXED (92b9f9b):
  // create/update declare .option("--json <jsonString>") and parse the body
  // correctly. These tests now assert the strict contract — a regression
  // fails the suite loudly instead of being tolerated with a warning.

  async function createMemberViaCli(body) {
    const res = runCli(base, adminToken, ["miembros", "create", "--json", body]);
    if (res.status !== 0) throw new Error(`Expected exit 0, got ${res.status}: ${res.stderr}`);
    const data = parseJsonOutput(res.stdout);
    if (!data.id) throw new Error("Response missing id");
    return data.id;
  }

  async function deleteMemberViaCli(id) {
    const res = runCli(base, adminToken, ["miembros", "delete", id, "--json"]);
    if (res.status !== 0) throw new Error(`Cleanup delete failed: ${res.status}: ${res.stderr}`);
  }

  await helper.test("miembros create --json <body> creates member as admin", async () => {
    const body = JSON.stringify(VALID_MEMBER);
    const createdId = await createMemberViaCli(body);
    // Clean up after itself so the suite stays deterministic.
    await deleteMemberViaCli(createdId);
  });

  await helper.test("miembros create --json with missing required fields returns error", async () => {
    const body = JSON.stringify({ nombres: "INCOMPLETE" });
    const res = runCli(base, adminToken, ["miembros", "create", "--json", body]);
    if (res.status === 0) throw new Error("Expected non-zero exit for invalid body");
  });

  await helper.test("miembros create --json without token returns auth error", async () => {
    const body = JSON.stringify(VALID_MEMBER);
    const res = runCliNoToken(base, ["miembros", "create", "--json", body]);
    if (res.status === 0) throw new Error("Expected non-zero exit without token");
    const stderr = (res.stderr || "").toLowerCase();
    if (!stderr.includes("token") && !stderr.includes("auth") && !stderr.includes("login")) {
      throw new Error(`Expected auth error in stderr, got: ${res.stderr}`);
    }
  });

  // ── miembros update <id> --json ──────────────────────────────────────────
  // Update tests create their own throwaway member via the CLI (create --json
  // is fixed) so they no longer depend on — or skip for — a create failure.
  await helper.test("miembros update <id> --json updates member as admin", async () => {
    const id = await createMemberViaCli(JSON.stringify(VALID_MEMBER));
    try {
      const body = JSON.stringify({ nombres: "UPDATED", direccion: "NEW ADDRESS" });
      const res = runCli(base, adminToken, ["miembros", "update", id, "--json", body]);
      if (res.status !== 0) throw new Error(`Expected exit 0, got ${res.status}: ${res.stderr}`);
      const data = parseJsonOutput(res.stdout);
      if (data.nombres !== "UPDATED") throw new Error(`nombres not updated: ${data.nombres}`);
    } finally {
      await deleteMemberViaCli(id);
    }
  });

  await helper.test("miembros update <fake-uuid> --json returns error", async () => {
    const body = JSON.stringify({ nombres: "GHOST" });
    const res = runCli(base, adminToken, ["miembros", "update", FAKE_UUID, "--json", body]);
    if (res.status === 0) throw new Error("Expected non-zero exit for fake UUID");
  });

  await helper.test("miembros update <id> --json without token returns auth error", async () => {
    // A real member id works fine: without a token the CLI fails auth
    // client-side before any API call, so the id never reaches the backend.
    const body = JSON.stringify({ nombres: "NOAUTH" });
    const res = runCliNoToken(base, ["miembros", "update", existingMiembroId, "--json", body]);
    if (res.status === 0) throw new Error("Expected non-zero exit without token");
    const stderr = res.stderr.toLowerCase();
    if (!stderr.includes("token") && !stderr.includes("auth") && !stderr.includes("login")) {
      throw new Error(`Expected auth error in stderr, got: ${res.stderr}`);
    }
  });

  // ── miembros delete <id> --json ──────────────────────────────────────
  // Create a throwaway member via the API so the delete command has a real
  // record to remove (the CLI create path is covered by the create tests).
  let deleteTargetId = null;
  {
    const res = await fetch(`${base}/api/miembros`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ ...VALID_MEMBER, numeroDocumento: "88774455" }),
    });
    const data = await res.json();
    if (res.status !== 201 || !data.id) {
      throw new Error(`Failed to create member for delete test: ${res.status} ${JSON.stringify(data)}`);
    }
    deleteTargetId = data.id;
  }

  await helper.test("miembros delete <id> --json deletes member as admin (exit 0)", async () => {
    const res = runCli(base, adminToken, ["miembros", "delete", deleteTargetId, "--json"]);
    if (res.status !== 0) throw new Error(`Expected exit 0, got ${res.status}: ${res.stderr}`);
    const data = parseJsonOutput(res.stdout);
    if (typeof data !== "string" || !data.toLowerCase().includes("deleted")) {
      throw new Error(`Expected success message, got: ${JSON.stringify(data)}`);
    }

    const check = await fetch(`${base}/api/miembros/${deleteTargetId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (check.status !== 404) throw new Error(`Expected 404 after delete, got ${check.status}`);
  });

  await helper.test("miembros delete <fake-uuid> --json returns error (404)", async () => {
    const res = runCli(base, adminToken, ["miembros", "delete", FAKE_UUID, "--json"]);
    if (res.status === 0) throw new Error("Expected non-zero exit for fake UUID");
  });

  await helper.test("miembros delete <id> --json as capitana returns error (admin-only)", async () => {
    const capitanaToken = await loginCapitana(base);
    const res = runCli(base, capitanaToken, ["miembros", "delete", existingMiembroId, "--json"]);
    if (res.status === 0) throw new Error("Expected non-zero exit for capitana delete");
    const out = `${res.stderr} ${res.stdout}`.toLowerCase();
    if (!out.includes("error") && !out.includes("403") && !out.includes("denegad")) {
      throw new Error(`Expected error output, got: ${res.stderr} ${res.stdout}`);
    }
  });

  await helper.test("miembros delete <id> --json without token returns auth error", async () => {
    const res = runCliNoToken(base, ["miembros", "delete", existingMiembroId, "--json"]);
    if (res.status === 0) throw new Error("Expected non-zero exit without token");
    const stderr = res.stderr.toLowerCase();
    if (!stderr.includes("token") && !stderr.includes("auth") && !stderr.includes("login")) {
      throw new Error(`Expected auth error in stderr, got: ${res.stderr}`);
    }
  });

  return helper.finish();
});