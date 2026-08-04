#!/usr/bin/env node
import { runSuite, createTestHelper } from "../../lib/suite-runner.mjs";
import { loginAdmin, loginCapitana } from "../../lib/test-utils.mjs";
import { spawnSync } from "node:child_process";

const CAB_TATACHIO = "5dee2149-4442-486a-9ec5-3c20479d8261";
const CAB_SAN_JUAN = "61a3b0fc-d8a3-4e0d-ab00-3883b2b891ab";
const CAB_ESPERANZA = "561b87f6-51b2-480c-b9fa-ff6b6742148e";
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

await runSuite({ name: "cli/cabildos", seed: true, start: true }, async ({ base }) => {
  const h = createTestHelper("cli/cabildos");
  const adminToken = await loginAdmin(base);
  const capitanaToken = await loginCapitana(base);

  // ── cabildos list --json ────────────────────────────────────────────────
  console.log("\ncabildos list --json");

  await h.test("cabildos list --json returns exit 0 and JSON array with 3 cabildos (admin)", async () => {
    const res = runCli(base, adminToken, ["cabildos", "list", "--json"]);
    if (res.status !== 0) throw new Error(`Expected exit 0, got ${res.status}: ${res.stderr}`);
    const data = parseJsonOutput(res.stdout);
    if (!Array.isArray(data)) throw new Error("Response is not an array");
    if (data.length < 3) throw new Error(`Expected at least 3 cabildos from seed, got ${data.length}`);
  });

  await h.test("cabildos list --json returns exit 0 and JSON array (capitana)", async () => {
    const res = runCli(base, capitanaToken, ["cabildos", "list", "--json"]);
    if (res.status !== 0) throw new Error(`Expected exit 0, got ${res.status}: ${res.stderr}`);
    const data = parseJsonOutput(res.stdout);
    if (!Array.isArray(data)) throw new Error("Response is not an array");
  });

  await h.test("cabildos list --json returns auth error without token", async () => {
    const res = runCliNoToken(base, ["cabildos", "list", "--json"]);
    if (res.status === 0) throw new Error("Expected non-zero exit without token");
    if (!res.stderr.toLowerCase().includes("token") && !res.stderr.toLowerCase().includes("auth") && !res.stdout.toLowerCase().includes("token")) {
      throw new Error(`Expected auth error, got: ${res.stderr || res.stdout}`);
    }
  });

  // ── cabildos get <id> --json ────────────────────────────────────────────
  console.log("\ncabildos get <id> --json");

  await h.test("cabildos get <real-id> --json returns single cabildo (admin)", async () => {
    const res = runCli(base, adminToken, ["cabildos", "get", CAB_TATACHIO, "--json"]);
    if (res.status !== 0) throw new Error(`Expected exit 0, got ${res.status}: ${res.stderr}`);
    const data = parseJsonOutput(res.stdout);
    if (data.id !== CAB_TATACHIO) throw new Error(`Expected id ${CAB_TATACHIO}, got ${data.id}`);
    if (!data.nombre) throw new Error("Response missing nombre");
    if (!data.resguardo) throw new Error("Response missing resguardo");
  });

  await h.test("cabildos get <real-id> --json returns single cabildo (capitana)", async () => {
    const res = runCli(base, capitanaToken, ["cabildos", "get", CAB_TATACHIO, "--json"]);
    if (res.status !== 0) throw new Error(`Expected exit 0, got ${res.status}: ${res.stderr}`);
    const data = parseJsonOutput(res.stdout);
    if (data.id !== CAB_TATACHIO) throw new Error(`Expected id ${CAB_TATACHIO}, got ${data.id}`);
  });

  await h.test("cabildos get <fake-uuid> --json returns error", async () => {
    const res = runCli(base, adminToken, ["cabildos", "get", FAKE_UUID, "--json"]);
    if (res.status === 0) throw new Error("Expected non-zero exit for non-existent cabildo");
  });

  await h.test("cabildos get <id> --json returns auth error without token", async () => {
    const res = runCliNoToken(base, ["cabildos", "get", CAB_TATACHIO, "--json"]);
    if (res.status === 0) throw new Error("Expected non-zero exit without token");
    if (!res.stderr.toLowerCase().includes("token") && !res.stderr.toLowerCase().includes("auth") && !res.stdout.toLowerCase().includes("token")) {
      throw new Error(`Expected auth error, got: ${res.stderr || res.stdout}`);
    }
  });

  return h.finish();
});