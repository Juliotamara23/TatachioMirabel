#!/usr/bin/env node
import { runSuite, createTestHelper } from "../../lib/suite-runner.mjs";
import { loginAdmin, loginCapitana } from "../../lib/test-utils.mjs";
import { spawnSync } from "node:child_process";

const CAB_TATACHIO = "5dee2149-4442-486a-9ec5-3c20479d8261";
const FAMILIA_ID = "cd8031c4-d2f7-423c-b5a8-1e98b793690a";
const FAKE_UUID = "00000000-0000-0000-0000-000000000000";

function runCli(base, token, args) {
  return spawnSync("apps/cli/node_modules/.bin/tsx", ["apps/cli/src/index.ts", ...args], {
    env: { ...process.env, TATACHIO_BASE_URL: base, TATACHIO_TOKEN: token },
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
    cwd: "/home/z/dev/Proyects/TatachioMirabel",
  });
}

function runCliNoToken(base, args) {
  return spawnSync("apps/cli/node_modules/.bin/tsx", ["apps/cli/src/index.ts", ...args], {
    env: { ...process.env, TATACHIO_BASE_URL: base },
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
    cwd: "/home/z/dev/Proyects/TatachioMirabel",
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

await runSuite({ name: "cli/familias", seed: true, start: true }, async ({ base }) => {
  const h = createTestHelper("cli/familias");
  const adminToken = await loginAdmin(base);
  const capitanaToken = await loginCapitana(base);

  // ── familias list --json ────────────────────────────────────────────────
  console.log("\nfamilias list --json");

  await h.test("familias list --json returns exit 0 and JSON array (admin)", async () => {
    const res = runCli(base, adminToken, ["familias", "list", "--json"]);
    if (res.status !== 0) throw new Error(`Expected exit 0, got ${res.status}: ${res.stderr}`);
    const data = parseJsonOutput(res.stdout);
    if (!Array.isArray(data)) throw new Error("Response is not an array");
    if (data.length === 0) throw new Error("Expected at least one familia");
  });

  await h.test("familias list --cabildo-id <id> --json returns filtered results", async () => {
    const resAll = runCli(base, adminToken, ["familias", "list", "--json"]);
    if (resAll.status !== 0) throw new Error(`List all failed: ${resAll.stderr}`);
    const all = parseJsonOutput(resAll.stdout);

    const resFiltered = runCli(base, adminToken, ["familias", "list", "--cabildo-id", CAB_TATACHIO, "--json"]);
    if (resFiltered.status !== 0) throw new Error(`Filtered list failed: ${resFiltered.stderr}`);
    const filtered = parseJsonOutput(resFiltered.stdout);

    if (!Array.isArray(filtered)) throw new Error("Filtered response is not an array");
    if (filtered.length >= all.length) throw new Error(`Filtered (${filtered.length}) should be fewer than all (${all.length})`);
    for (const f of filtered) {
      if (f.cabildoId !== CAB_TATACHIO) throw new Error(`Familia ${f.id} has cabildoId ${f.cabildoId}, expected ${CAB_TATACHIO}`);
    }
  });

  await h.test("familias list --json returns auth error without token", async () => {
    const res = runCliNoToken(base, ["familias", "list", "--json"]);
    if (res.status === 0) throw new Error("Expected non-zero exit without token");
    if (!res.stderr.toLowerCase().includes("token") && !res.stderr.toLowerCase().includes("auth") && !res.stdout.toLowerCase().includes("token")) {
      throw new Error(`Expected auth error, got: ${res.stderr || res.stdout}`);
    }
  });

  // ── familias get <id> --json ────────────────────────────────────────────
  console.log("\nfamilias get <id> --json");

  await h.test("familias get <real-id> --json returns single familia (admin)", async () => {
    const res = runCli(base, adminToken, ["familias", "get", FAMILIA_ID, "--json"]);
    if (res.status !== 0) throw new Error(`Expected exit 0, got ${res.status}: ${res.stderr}`);
    const data = parseJsonOutput(res.stdout);
    if (data.id !== FAMILIA_ID) throw new Error(`Expected id ${FAMILIA_ID}, got ${data.id}`);
    if (typeof data.numero !== "number") throw new Error("Missing numero field");
  });

  await h.test("familias get <fake-uuid> --json returns error", async () => {
    const res = runCli(base, adminToken, ["familias", "get", FAKE_UUID, "--json"]);
    if (res.status === 0) throw new Error("Expected non-zero exit for non-existent familia");
  });

  await h.test("familias get <id> --json returns auth error without token", async () => {
    const res = runCliNoToken(base, ["familias", "get", FAMILIA_ID, "--json"]);
    if (res.status === 0) throw new Error("Expected non-zero exit without token");
    if (!res.stderr.toLowerCase().includes("token") && !res.stderr.toLowerCase().includes("auth") && !res.stdout.toLowerCase().includes("token")) {
      throw new Error(`Expected auth error, got: ${res.stderr || res.stdout}`);
    }
  });

  return h.finish();
});