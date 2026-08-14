#!/usr/bin/env node
/**
 * intensive-http-cli-ia.test.mjs — Intensive QA suite: HTTP + CLI + AI chat.
 *
 * Exercises, against a live backend + the OpenAI-compatible mock:
 *   A. HTTP CRUD — ADMINISTRATOR (miembros / familias / cabildos full CRUD)
 *   B. HTTP CRUD — CAPTAIN     (cabildo scoping, 403s on admin-only routes)
 *   C. CLI flows               (miembros list/get/create/update, captain scoping)
 *   D. AI chat — ADMINISTRATOR (mocked LLM, tool-driven answers, call-log proof)
 *   E. AI chat — CAPTAIN       (role-gating proof: getReporteData never requested;
 *                              R2.7: captain requests send NO model, backend auto-resolves)
 *   M. Mock protocol level     (direct /v1/chat/completions against the mock)
 *   CT. Chat error contract    (401 / 400 invalid model / 400 missing messages)
 *
 * Standalone script (not registered in run-all.mjs). Exit code: 0 when every
 * test passes, 1 otherwise.
 *
 * ── Wire protocol ──────────────────────────────────────────────────────
 * The mock speaks the OpenAI wire protocol (OpenAI-compatible endpoints),
 * which the backend reaches through @ai-sdk/openai with baseURL
 * OLLAMA_BASE_URL=<mock>/v1:
 *   GET  /v1/models           → { object: "list", data: [{ id, object: "model" }] }
 *   POST /v1/chat/completions → SSE: `data: {…}` lines + `data: [DONE]`
 * Streamed tool calls use choices[0].delta.tool_calls[i].function.{name,arguments}.
 * Sections D/E always run (no static provider-compatibility detection).
 */

import { spawnSync, execSync } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..", "..");
const qaDir = join(projectRoot, "scripts", "qa");

// ── Fixtures (from scripts/qa/fixtures/seed.json) ────────────────────────
const CABILDO_TATACHIO = "5dee2149-4442-486a-9ec5-3c20479d8261"; // capitana's cabildo
const CABILDO_SAN_JUAN = "61a3b0fc-d8a3-4e0d-ab00-3883b2b891ab"; // other cabildo
const FAMILIA_FIXTURE = "cd8031c4-d2f7-423c-b5a8-1e98b793690a"; // familia 1 (cabildo TATACHIO)

const ADMIN_EMAIL = "admin@tatachio.com";
const ADMIN_PASS = "admin123";
const CAPITANA_EMAIL = "capitana@tatachio.com";
const CAPITANA_PASS = "cap123";

// ── Result collection ────────────────────────────────────────────────────
const results = []; // { section, name, pass, blocked, note }

function record(section, name, fn, opts = {}) {
  return (async () => {
    try {
      await fn();
      results.push({ section, name, pass: true, blocked: false, note: opts.note || "" });
      console.log(`  ✓ ${name}`);
    } catch (error) {
      results.push({
        section,
        name,
        pass: false,
        blocked: Boolean(opts.blocked),
        note: opts.blocked ? String(error?.message || error) : "",
      });
      console.log(`  ✗ ${name}: ${error?.message || error}`);
    }
  })();
}

async function runSection(title, fn) {
  console.log(`\n── ${title} ──`);
  await fn();
}

// ── Small helpers ────────────────────────────────────────────────────────

async function httpJson(base, method, path, { token, body, timeoutMs = 30000 } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : await res.text();
  return { status: res.status, data };
}

async function login(base, email, password) {
  const { status, data } = await httpJson(base, "POST", "/api/auth/login", {
    body: { email, password },
  });
  if (status !== 200 || !data.token) {
    throw new Error(`Login failed (${status}): ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data.token;
}

function runCli(args, { base, token, homeDir } = {}) {
  const env = {
    ...process.env,
    TATACHIO_BASE_URL: base,
    ...(token ? { TATACHIO_TOKEN: token } : {}),
    HOME: homeDir || tmpCliHome,
  };
  const result = spawnSync("apps/cli/node_modules/.bin/tsx", ["apps/cli/src/index.ts", ...args], {
    cwd: projectRoot,
    env,
    encoding: "utf-8",
    timeout: 60000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return { code: result.status ?? 0, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function parseCliJson(stdout) {
  const text = stdout.trim();
  const start = text.indexOf("{");
  if (start === -1) return { ok: false, data: null, error: "no JSON object in stdout" };
  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
    } else {
      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
  }
  if (end === -1) return { ok: false, data: null, error: "unbalanced JSON" };
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return { ok: Boolean(parsed?.ok), data: parsed?.data ?? parsed, error: parsed?.error ?? null };
  } catch (e) {
    return { ok: false, data: null, error: e.message };
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function findFreePort(start = 3599, end = 3699) {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once("error", () => {
      probe.close(() => findFreePort(start + 1, end).then(resolve, reject));
    });
    probe.listen(start, () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

// ── Main ─────────────────────────────────────────────────────────────────

const tmpCliHome = mkdtempSync(join(tmpdir(), "tatachio-qa-cli-"));

async function main() {
  console.log("========== INTENSIVE QA: HTTP + CLI + AI (mocked LLM) ==========");
  console.log("Provider path: Ollama via OpenAI-compatible endpoint (@ai-sdk/openai)");

  // ── Setup: seed → mock → backend ──────────────────────────────────────
  console.log("\n── Setup ──");
  console.log("[setup] Seeding database (idempotent)...");
  execSync("node lib/seed-db.mjs", { cwd: qaDir, stdio: "inherit" });

  const mockPort = await findFreePort();
  const { startOpenAICompatMock, clearCallLog, getCallLog } = await import("./lib/openai-compat-mock.mjs");
  const mock = await startOpenAICompatMock({ port: mockPort });
  console.log(`[setup] OpenAI-compatible mock on http://localhost:${mockPort}/v1`);
  clearCallLog();

  const { startServer, stopServer } = await import("./lib/server.mjs");
  const serverCtx = await startServer({
    env: {
      OLLAMA_BASE_URL: `http://localhost:${mockPort}/v1`,
      AI_PROVIDER: "ollama",
      JWT_SECRET: "qa-secret",
      // Neutralize any provider keys present in the developer's .env so the
      // QA is hermetic: with R2.7 (captains always automatic) the backend
      // auto-resolves the model, and a local GOOGLE_GENERATIVE_AI_API_KEY
      // would otherwise make it call the real Gemini API instead of the mock.
      // dotenv.config() never overrides already-set vars, so these empty
      // values win over .env (same pattern as suites/chaos/rate-limit).
      GOOGLE_GENERATIVE_AI_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      OPENAI_API_KEY: "",
      OPENROUTER_API_KEY: "",
    },
  });
  const base = `http://localhost:${serverCtx.port}`;
  console.log(`[setup] Backend on ${base}`);

  const adminToken = await login(base, ADMIN_EMAIL, ADMIN_PASS);
  const capitanaToken = await login(base, CAPITANA_EMAIL, CAPITANA_PASS);

  // Shared fixture IDs used across sections
  let createdMemberId = null;
  let createdFamiliaId = null;
  let createdCabildoId = null;
  let captainCreatedMemberId = null;
  let foreignMemberId = null;

  try {
    // ══════════════ A. HTTP CRUD — ADMINISTRATOR ══════════════
    await runSection("A. HTTP CRUD — ADMINISTRATOR", async () => {
      await record("A", "admin login → 200 + token", async () => {
        assert(typeof adminToken === "string" && adminToken.length > 20, "token missing");
      });

      await record("A", "GET /api/miembros → 200 + non-empty array", async () => {
        const { status, data } = await httpJson(base, "GET", "/api/miembros", { token: adminToken });
        assert(status === 200, `expected 200 got ${status}`);
        assert(Array.isArray(data) && data.length > 0, "expected non-empty array");
      });

      await record("A", "POST /api/miembros → 201 create", async () => {
        const { status, data } = await httpJson(base, "POST", "/api/miembros", {
          token: adminToken,
          body: {
            tipoIdentificacion: "CC",
            numeroDocumento: "88990011",
            nombres: "QA ADMIN",
            apellidos: "CREATED",
            fechaNacimiento: "01/01/1990",
            parentesco: "PA",
            sexo: "M",
            integrantes: 1,
            familiaId: FAMILIA_FIXTURE,
            cabildoId: CABILDO_TATACHIO,
          },
        });
        assert(status === 201, `expected 201 got ${status}: ${JSON.stringify(data).slice(0, 200)}`);
        assert(data.id, "created member missing id");
        createdMemberId = data.id;
      });

      await record("A", "GET /api/miembros/{id} → 200", async () => {
        const { status, data } = await httpJson(base, "GET", `/api/miembros/${createdMemberId}`, {
          token: adminToken,
        });
        assert(status === 200, `expected 200 got ${status}`);
        assert(data.id === createdMemberId, "id mismatch");
      });

      await record("A", "PUT /api/miembros/{id} → 200 update nombre", async () => {
        const { status, data } = await httpJson(base, "PUT", `/api/miembros/${createdMemberId}`, {
          token: adminToken,
          body: { nombres: "QA ADMIN UPDATED" },
        });
        assert(status === 200, `expected 200 got ${status}`);
        assert(data.nombres === "QA ADMIN UPDATED", `nombres not updated: ${data.nombres}`);
      });

      await record("A", "DELETE /api/miembros/{id} → 204", async () => {
        const { status } = await httpJson(base, "DELETE", `/api/miembros/${createdMemberId}`, {
          token: adminToken,
        });
        assert(status === 204, `expected 204 got ${status}`);
      });

      await record("A", "GET deleted member → 404", async () => {
        const { status } = await httpJson(base, "GET", `/api/miembros/${createdMemberId}`, {
          token: adminToken,
        });
        assert(status === 404, `expected 404 got ${status}`);
      });

      await record("A", "POST /api/familias → 201 create", async () => {
        const { status, data } = await httpJson(base, "POST", "/api/familias", {
          token: adminToken,
          body: { numero: 999, direccion: "VDA QA CASA 999", cabildoId: CABILDO_TATACHIO },
        });
        assert(status === 201, `expected 201 got ${status}: ${JSON.stringify(data).slice(0, 200)}`);
        assert(data.id, "created familia missing id");
        createdFamiliaId = data.id;
      });

      await record("A", "GET /api/familias/{id} → 200", async () => {
        const { status, data } = await httpJson(base, "GET", `/api/familias/${createdFamiliaId}`, {
          token: adminToken,
        });
        assert(status === 200, `expected 200 got ${status}`);
        assert(data.id === createdFamiliaId, "id mismatch");
      });

      await record("A", "PUT /api/familias/{id} → 200 update", async () => {
        const { status, data } = await httpJson(base, "PUT", `/api/familias/${createdFamiliaId}`, {
          token: adminToken,
          body: { direccion: "VDA QA ACTUALIZADA" },
        });
        assert(status === 200, `expected 200 got ${status}`);
        assert(data.direccion === "VDA QA ACTUALIZADA", "direccion not updated");
      });

      await record("A", "DELETE /api/familias/{id} → 204", async () => {
        const { status } = await httpJson(base, "DELETE", `/api/familias/${createdFamiliaId}`, {
          token: adminToken,
        });
        assert(status === 204, `expected 204 got ${status}`);
      });

      await record("A", "GET deleted familia → 404", async () => {
        const { status } = await httpJson(base, "GET", `/api/familias/${createdFamiliaId}`, {
          token: adminToken,
        });
        assert(status === 404, `expected 404 got ${status}`);
      });

      await record("A", "POST /api/cabildos → 201 create", async () => {
        const { status, data } = await httpJson(base, "POST", "/api/cabildos", {
          token: adminToken,
          body: {
            nombre: "QA CABILDO TEST",
            resguardo: "RESGUARDO QA",
            comunidad: "COMUNIDAD QA",
            vigencia: 2026,
          },
        });
        assert(status === 201, `expected 201 got ${status}: ${JSON.stringify(data).slice(0, 200)}`);
        assert(data.id, "created cabildo missing id");
        createdCabildoId = data.id;
      });

      await record("A", "GET /api/cabildos/{id} → 200", async () => {
        const { status, data } = await httpJson(base, "GET", `/api/cabildos/${createdCabildoId}`, {
          token: adminToken,
        });
        assert(status === 200, `expected 200 got ${status}`);
        assert(data.id === createdCabildoId, "id mismatch");
      });

      await record("A", "PUT /api/cabildos/{id} → 200 update", async () => {
        const { status, data } = await httpJson(base, "PUT", `/api/cabildos/${createdCabildoId}`, {
          token: adminToken,
          body: { nombre: "QA CABILDO RENOMBRADO" },
        });
        assert(status === 200, `expected 200 got ${status}`);
        assert(data.nombre === "QA CABILDO RENOMBRADO", "nombre not updated");
      });

      await record("A", "DELETE /api/cabildos/{id} → 204", async () => {
        const { status } = await httpJson(base, "DELETE", `/api/cabildos/${createdCabildoId}`, {
          token: adminToken,
        });
        assert(status === 204, `expected 204 got ${status}`);
      });

      await record("A", "GET deleted cabildo → 404", async () => {
        const { status } = await httpJson(base, "GET", `/api/cabildos/${createdCabildoId}`, {
          token: adminToken,
        });
        assert(status === 404, `expected 404 got ${status}`);
      });

      // Fixture for cross-cabildo tests: a member of SAN JUAN (not capitana's cabildo)
      const { data: sanJuanMembers } = await httpJson(base, "GET", "/api/miembros", {
        token: adminToken,
        body: undefined,
      });
      const foreign = Array.isArray(sanJuanMembers)
        ? sanJuanMembers.find((m) => m.cabildoId === CABILDO_SAN_JUAN)
        : null;
      foreignMemberId = foreign ? foreign.id : null;
    });

    // ══════════════ B. HTTP CRUD — CAPTAIN (scoped) ══════════════
    await runSection("B. HTTP CRUD — CAPTAIN (scoped)", async () => {
      await record("B", "capitana login → 200 + token", async () => {
        assert(typeof capitanaToken === "string" && capitanaToken.length > 20, "token missing");
      });

      await record("B", "GET /api/miembros → 200, all scoped to her cabildo", async () => {
        const { status, data } = await httpJson(base, "GET", "/api/miembros", { token: capitanaToken });
        assert(status === 200, `expected 200 got ${status}`);
        assert(Array.isArray(data) && data.length >= 1, "expected non-empty array");
        const leaks = data.filter((m) => m.cabildoId !== CABILDO_TATACHIO);
        assert(leaks.length === 0, `${leaks.length} members leaked from another cabildo`);
      });

      await record("B", "POST /api/miembros (other cabildo) → 403", async () => {
        const { status } = await httpJson(base, "POST", "/api/miembros", {
          token: capitanaToken,
          body: {
            tipoIdentificacion: "CC",
            numeroDocumento: "88770099",
            nombres: "QA FORBIDDEN",
            apellidos: "CAPTAIN",
            fechaNacimiento: "02/02/1991",
            parentesco: "PA",
            sexo: "F",
            integrantes: 1,
            familiaId: FAMILIA_FIXTURE,
            cabildoId: CABILDO_SAN_JUAN,
          },
        });
        assert(status === 403, `expected 403 got ${status}`);
      });

      await record("B", "POST /api/miembros (own cabildo, body cabildoId omitted) → 201", async () => {
        const { status, data } = await httpJson(base, "POST", "/api/miembros", {
          token: capitanaToken,
          body: {
            tipoIdentificacion: "CC",
            numeroDocumento: "88001122",
            nombres: "QA CAPITANA",
            apellidos: "CREATED",
            fechaNacimiento: "03/03/1992",
            parentesco: "PA",
            sexo: "F",
            integrantes: 1,
            familiaId: FAMILIA_FIXTURE,
          },
        });
        assert(status === 201, `expected 201 got ${status}: ${JSON.stringify(data).slice(0, 200)}`);
        assert(data.cabildoId === CABILDO_TATACHIO, "JWT cabildo not applied to created member");
        captainCreatedMemberId = data.id;
      });

      await record("B", "GET member of another cabildo → 404", async () => {
        assert(foreignMemberId, "no foreign member fixture available");
        const { status } = await httpJson(base, "GET", `/api/miembros/${foreignMemberId}`, {
          token: capitanaToken,
        });
        assert(status === 404, `expected 404 got ${status}`);
      });

      await record("B", "GET /api/cabildos → 200, exactly her cabildo", async () => {
        const { status, data } = await httpJson(base, "GET", "/api/cabildos", { token: capitanaToken });
        assert(status === 200, `expected 200 got ${status}`);
        assert(Array.isArray(data) && data.length === 1, `expected 1 cabildo, got ${data.length}`);
        assert(data[0].id === CABILDO_TATACHIO, "captain sees wrong cabildo");
      });

      await record("B", "GET /api/familias → 200, all scoped to her cabildo", async () => {
        const { status, data } = await httpJson(base, "GET", "/api/familias", { token: capitanaToken });
        assert(status === 200, `expected 200 got ${status}`);
        assert(Array.isArray(data) && data.length >= 1, "expected non-empty array");
        const leaks = data.filter((f) => f.cabildoId !== CABILDO_TATACHIO);
        assert(leaks.length === 0, `${leaks.length} familias leaked from another cabildo`);
      });

      await record("B", "GET /api/reportes/censo.xlsx → 403 (admin-only)", async () => {
        const { status } = await httpJson(base, "GET", "/api/reportes/censo.xlsx", {
          token: capitanaToken,
        });
        assert(status === 403, `expected 403 got ${status}`);
      });

      await record("B", "POST /api/familias → 403 (admin-only)", async () => {
        const { status } = await httpJson(base, "POST", "/api/familias", {
          token: capitanaToken,
          body: { numero: 998, cabildoId: CABILDO_TATACHIO },
        });
        assert(status === 403, `expected 403 got ${status}`);
      });

      await record("B", "POST /api/cabildos → 403 (admin-only)", async () => {
        const { status } = await httpJson(base, "POST", "/api/cabildos", {
          token: capitanaToken,
          body: { nombre: "QA", resguardo: "QA", comunidad: "QA", vigencia: 2026 },
        });
        assert(status === 403, `expected 403 got ${status}`);
      });

      await record("B", "DELETE /api/miembros/{id} → 403 (admin-only)", async () => {
        assert(captainCreatedMemberId, "captain member not created");
        const { status } = await httpJson(base, "DELETE", `/api/miembros/${captainCreatedMemberId}`, {
          token: capitanaToken,
        });
        assert(status === 403, `expected 403 got ${status}`);
      });
    });

    // ══════════════ C. CLI flows ══════════════
    await runSection("C. CLI flows", async () => {
      await record("C", "cli login --help exits 0", async () => {
        const res = runCli(["login", "--help"], { base });
        assert(res.code === 0, `expected exit 0, got ${res.code}: ${res.stderr}`);
      });

      await record("C", "cli login --json in pipe mode requires TATACHIO_TOKEN", async () => {
        const res = runCli(["login", "--json"], { base });
        assert(res.code !== 0, "expected non-zero exit in pipe mode without token");
        const out = `${res.stderr} ${res.stdout}`;
        assert(/TATACHIO_TOKEN/.test(out), `expected TATACHIO_TOKEN error, got: ${out.slice(0, 200)}`);
      });

      await record("C", "cli miembros list --json (admin) → exit 0 + array", async () => {
        const res = runCli(["miembros", "list", "--json"], { base, token: adminToken });
        assert(res.code === 0, `expected exit 0, got ${res.code}: ${res.stderr}`);
        const parsed = parseCliJson(res.stdout);
        assert(Array.isArray(parsed.data), "expected array data");
      });

      const cliCreated = { id: null };

      await record("C", "cli miembros create --json (admin) → exit 0 + created id", async () => {
        const body = JSON.stringify({
          tipoIdentificacion: "CC",
          numeroDocumento: "88776655",
          nombres: "QA CLI",
          apellidos: "CREATED",
          fechaNacimiento: "04/04/1993",
          parentesco: "PA",
          sexo: "M",
          integrantes: 1,
          familiaId: FAMILIA_FIXTURE,
          cabildoId: CABILDO_TATACHIO,
        });
        const res = runCli(["miembros", "create", "--json", body], { base, token: adminToken });
        assert(res.code === 0, `expected exit 0, got ${res.code}: ${res.stderr.slice(0, 300)}`);
        const parsed = parseCliJson(res.stdout);
        assert(parsed.data?.id, `response missing id: ${res.stdout.slice(0, 300)}`);
        cliCreated.id = parsed.data.id;
      });

      await record("C", "cli miembros get <id> --json (admin) → exit 0 + id matches", async () => {
        // Use a live member (captain's created member survives; admin-created was deleted in A)
        const { data: members } = await httpJson(base, "GET", "/api/miembros", { token: adminToken });
        const targetId = Array.isArray(members) && members.length > 0 ? members[0].id : captainCreatedMemberId;
        assert(targetId, "no member id available for get test");
        const res = runCli(["miembros", "get", targetId, "--json"], {
          base,
          token: adminToken,
        });
        assert(res.code === 0, `expected exit 0, got ${res.code}: ${res.stderr}`);
        const parsed = parseCliJson(res.stdout);
        assert(parsed.data?.id === targetId, "get response id mismatch");
      });

      await record("C", "cli miembros update <id> --json (admin) → exit 0 + updated", async () => {
        assert(cliCreated.id, "no member id available for update (CLI create must succeed)");
        const res = runCli(["miembros", "update", cliCreated.id, "--json", JSON.stringify({ nombres: "QA CLI UPDATED" })], {
          base,
          token: adminToken,
        });
        assert(res.code === 0, `expected exit 0, got ${res.code}: ${res.stderr}`);
        const parsed = parseCliJson(res.stdout);
        assert(parsed.data?.nombres === "QA CLI UPDATED", `nombres not updated: ${parsed.data?.nombres}`);
      });

      await record("C", "cli miembros delete <id> --json (admin) → exit 0 + member gone", async () => {
        // Create a throwaway member via the API for the delete flow (the CLI
        // create path is already covered by the create test above).
        const { status: createStatus, data: created } = await httpJson(base, "POST", "/api/miembros", {
          token: adminToken,
          body: {
            tipoIdentificacion: "CC",
            numeroDocumento: "88998877",
            nombres: "QA DELETE",
            apellidos: "TARGET",
            fechaNacimiento: "06/06/1995",
            parentesco: "PA",
            sexo: "M",
            integrantes: 1,
            familiaId: FAMILIA_FIXTURE,
            cabildoId: CABILDO_TATACHIO,
          },
        });
        assert(createStatus === 201 && created.id, `create failed: ${createStatus} ${JSON.stringify(created).slice(0, 200)}`);
        const res = runCli(["miembros", "delete", created.id, "--json"], { base, token: adminToken });
        assert(res.code === 0, `expected exit 0, got ${res.code}: ${res.stderr}`);
        const parsed = parseCliJson(res.stdout);
        assert(parsed.ok === true, `expected ok envelope, got: ${res.stdout.slice(0, 200)}`);
        const gone = await httpJson(base, "GET", `/api/miembros/${created.id}`, { token: adminToken });
        assert(gone.status === 404, `expected 404 after delete, got ${gone.status}`);
      });

      await record("C", "cli miembros delete <id> --json (capitana) → non-zero exit (admin-only)", async () => {
        assert(captainCreatedMemberId, "no member id available for capitana delete");
        const res = runCli(["miembros", "delete", captainCreatedMemberId, "--json"], {
          base,
          token: capitanaToken,
        });
        // The backend's isAdmin middleware returns 403; the CLI's ApiError
        // surfaces the generic message, so denial is proven by non-zero exit
        // plus an error envelope. The strict 403 is asserted at API level (B).
        assert(res.code !== 0, "expected non-zero exit for forbidden delete");
        const out = `${res.stderr} ${res.stdout}`;
        assert(/ok.?:\s?false|error|403|denegad/i.test(out), `expected error envelope, got: ${out.slice(0, 300)}`);
      });

      await record("C", "cli miembros list --json (capitana) → scoped to her cabildo", async () => {
        const res = runCli(["miembros", "list", "--json"], { base, token: capitanaToken });
        assert(res.code === 0, `expected exit 0, got ${res.code}: ${res.stderr}`);
        const parsed = parseCliJson(res.stdout);
        assert(Array.isArray(parsed.data) && parsed.data.length >= 1, "expected array");
        const leaks = parsed.data.filter((m) => m.cabildoId !== CABILDO_TATACHIO);
        assert(leaks.length === 0, `${leaks.length} members leaked from another cabildo`);
      });

      await record("C", "cli miembros create (capitana, other cabildo) → denied", async () => {
        const body = JSON.stringify({
          tipoIdentificacion: "CC",
          numeroDocumento: "88665544",
          nombres: "QA DENIED",
          apellidos: "CAPTAIN",
          fechaNacimiento: "05/05/1994",
          parentesco: "PA",
          sexo: "F",
          integrantes: 1,
          familiaId: FAMILIA_FIXTURE,
          cabildoId: CABILDO_SAN_JUAN,
        });
        const res = runCli(["miembros", "create", "--json", body], { base, token: capitanaToken });
        // The backend returns 403 (cabildoId mismatch); the CLI's ApiError
        // surfaces only the generic message ("API request failed"), so denial
        // is proven by non-zero exit plus an error envelope. The strict 403 is
        // asserted at API level (B).
        assert(res.code !== 0, "expected non-zero exit for forbidden create");
        const out = `${res.stderr} ${res.stdout}`;
        assert(/ok.?:\s?false|error|403|denegad/i.test(out), `expected error envelope, got: ${out.slice(0, 300)}`);
      });

      await record("C", "cli cabildos list --json (capitana) → only her cabildo", async () => {
        const res = runCli(["cabildos", "list", "--json"], { base, token: capitanaToken });
        assert(res.code === 0, `expected exit 0, got ${res.code}: ${res.stderr}`);
        const parsed = parseCliJson(res.stdout);
        assert(Array.isArray(parsed.data) && parsed.data.length === 1, `expected 1 cabildo, got ${parsed.data?.length}`);
        assert(parsed.data[0].id === CABILDO_TATACHIO, "captain sees wrong cabildo via CLI");
      });
    });

    // ══════════════ CT. Chat error contract (always runs) ══════════════
    await runSection("CT. Chat error contract", async () => {
      await record("CT", "POST /api/chat without token → 401", async () => {
        const { status } = await httpJson(base, "POST", "/api/chat", {
          body: { messages: [{ role: "user", content: "hola" }] },
        });
        assert(status === 401, `expected 401 got ${status}`);
      });

      await record("CT", "POST /api/chat missing messages → 400", async () => {
        const { status } = await httpJson(base, "POST", "/api/chat", {
          token: adminToken,
          body: {},
        });
        assert(status === 400, `expected 400 got ${status}`);
      });

      await record("CT", "POST /api/chat invalid model → 400", async () => {
        const { status } = await httpJson(base, "POST", "/api/chat", {
          token: adminToken,
          body: { messages: [{ role: "user", content: "hola" }], model: "nonexistent-model" },
        });
        assert(status === 400, `expected 400 got ${status}`);
      });
    });

    // ══════════════ M. Mock protocol level (always runs) ══════════════
    await runSection("M. OpenAI-compatible mock protocol", async () => {
      const mockBase = `http://localhost:${mockPort}`;

      await record("M", "GET /v1/models → OpenAI-style list with llama3.2:3b", async () => {
        const res = await fetch(`${mockBase}/v1/models`);
        assert(res.status === 200, `expected 200 got ${res.status}`);
        const data = await res.json();
        assert(data.object === "list", `expected object: list, got ${data.object}`);
        assert(Array.isArray(data.data), "expected data array");
        assert(
          data.data.some((m) => m.id === "llama3.2:3b"),
          "llama3.2:3b missing"
        );
        assert(
          data.data.every((m) => m.object === "model"),
          "model entries missing object: model"
        );
      });

      const adminTools = [
        { type: "function", function: { name: "searchMiembros" } },
        { type: "function", function: { name: "getMiembroById" } },
        { type: "function", function: { name: "getFamiliaMembers" } },
        { type: "function", function: { name: "getCabildoStats" } },
        { type: "function", function: { name: "getReporteData" } },
      ];
      const captainTools = adminTools.slice(0, 4);

      async function mockChat(body) {
        const res = await fetch(`${mockBase}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const ct = res.headers.get("content-type") || "";
        const data = ct.includes("application/json") ? await res.json() : await res.text();
        return { status: res.status, data, ct };
      }

      await record("M", "tool decision: stats keywords → getCabildoStats", async () => {
        const { data } = await mockChat({
          model: "llama3.2:3b",
          stream: false,
          tools: adminTools,
          messages: [{ role: "user", content: "cuantos miembros hay en el censo" }],
        });
        const tc = data?.choices?.[0]?.message?.tool_calls?.[0];
        assert(tc?.function?.name === "getCabildoStats", `expected getCabildoStats, got ${tc?.function?.name}`);
      });

      await record("M", "tool decision: report keywords → getReporteData (admin tools)", async () => {
        const { data } = await mockChat({
          model: "llama3.2:3b",
          stream: false,
          tools: adminTools,
          messages: [{ role: "user", content: "genera el reporte de datos" }],
        });
        const tc = data?.choices?.[0]?.message?.tool_calls?.[0];
        assert(tc?.function?.name === "getReporteData", `expected getReporteData, got ${tc?.function?.name}`);
      });

      await record("M", "ROLE GATING: report request with captain tools → gated fallback to getCabildoStats", async () => {
        const { data } = await mockChat({
          model: "llama3.2:3b",
          stream: false,
          tools: captainTools,
          messages: [{ role: "user", content: "genera el reporte de datos" }],
        });
        const tc = data?.choices?.[0]?.message?.tool_calls?.[0];
        assert(tc?.function?.name === "getCabildoStats", `expected gated fallback getCabildoStats, got ${tc?.function?.name}`);
      });

      await record("M", "searchMiembros carries a query term ('busca a FANNY') as JSON-string arguments", async () => {
        const { data } = await mockChat({
          model: "llama3.2:3b",
          stream: false,
          tools: adminTools,
          messages: [{ role: "user", content: "busca a FANNY" }],
        });
        const tc = data?.choices?.[0]?.message?.tool_calls?.[0];
        assert(tc?.function?.name === "searchMiembros", `expected searchMiembros, got ${tc?.function?.name}`);
        const args = JSON.parse(tc?.function?.arguments || "{}");
        assert(String(args.query).toUpperCase().includes("FANNY"), `query not extracted: ${JSON.stringify(args)}`);
      });

      await record("M", "tool result present → final Spanish answer embedding result", async () => {
        const { data } = await mockChat({
          model: "llama3.2:3b",
          stream: false,
          tools: adminTools,
          messages: [
            { role: "user", content: "cuantos miembros hay" },
            { role: "assistant", content: "", tool_calls: [{ id: "call_1", type: "function", function: { name: "getCabildoStats", arguments: "{}" } }] },
            { role: "tool", content: "{\"totalMiembros\":970}" },
          ],
        });
        assert(/He consultado la base de datos/.test(data?.choices?.[0]?.message?.content || ""), "answer prefix missing");
        assert(String(data?.choices?.[0]?.message?.content).includes("970"), "tool result not embedded in answer");
        assert(!data?.choices?.[0]?.message?.tool_calls, "unexpected tool call in answer step");
      });

      await record("M", "streaming tool call → text/event-stream, data: lines, delta.tool_calls, [DONE]", async () => {
        const { data, ct } = await mockChat({
          model: "llama3.2:3b",
          tools: adminTools,
          messages: [{ role: "user", content: "cuantos miembros hay" }],
        });
        assert(ct.includes("text/event-stream"), `expected text/event-stream content-type, got ${ct}`);
        const raw = String(data);
        assert(raw.includes("data: [DONE]"), "missing [DONE] terminator");
        const lines = raw
          .split("\n\n")
          .map((l) => l.trim())
          .filter((l) => l.startsWith("data: ") && l !== "data: [DONE]");
        assert(lines.length >= 2, `expected at least 2 SSE data lines, got ${lines.length}`);
        const first = JSON.parse(lines[0].slice(6));
        const tc = first.choices?.[0]?.delta?.tool_calls?.[0];
        assert(tc?.function?.name === "getCabildoStats", `expected delta.tool_calls getCabildoStats, got ${JSON.stringify(first)}`);
        assert(tc?.index === 0, "tool_call delta missing index");
        // Arguments arrive as a JSON string in OpenAI's function.arguments field
        const last = JSON.parse(lines[lines.length - 1].slice(6));
        assert(last.choices?.[0]?.finish_reason === "stop", `expected finish_reason stop on terminal chunk, got ${JSON.stringify(last)}`);
      });

      await record("M", "unknown endpoint → 404 {\"error\":{\"message\":\"not found\"}}", async () => {
        const res = await fetch(`${mockBase}/v1/whatever`);
        assert(res.status === 404, `expected 404 got ${res.status}`);
        const body = await res.json();
        assert(body?.error?.message === "not found", `unexpected body: ${JSON.stringify(body)}`);
      });
    });

    // ══════════════ D. AI chat — ADMINISTRATOR (mocked LLM) ══════════════
    await runSection("D. AI chat — ADMINISTRATOR (mocked LLM)", async () => {
      const chat = (token, messages, opts = {}) =>
        httpJson(base, "POST", "/api/chat", {
          token,
          body: { messages, model: "ollama/llama3.2:3b", ...opts },
          timeoutMs: 45000,
        });

      await record("D", "admin chat stream:false 'cuantos miembros hay en el censo' → 200 + tool-driven text", async () => {
        clearCallLog();
        const { status, data } = await chat(adminToken, [{ role: "user", content: "cuantos miembros hay en el censo" }], { stream: false });
        assert(status === 200, `expected 200 got ${status}: ${JSON.stringify(data).slice(0, 200)}`);
        assert(/He consultado la base de datos/.test(data?.text || ""), `expected Spanish answer, got: ${JSON.stringify(data).slice(0, 300)}`);
        assert(data?.steps >= 2, `expected >= 2 steps (tool call + answer), got ${data?.steps}`);
      });

      await record("D", "admin chat call log shows getCabildoStats requested with 5 tools", async () => {
        const entries = getCallLog().filter((e) => e.type === "tool-call");
        assert(entries.length >= 1, "no tool-call entries in mock log");
        const entry = entries.find((e) => (e.toolCallsRequested || []).includes("getCabildoStats"));
        assert(entry, "getCabildoStats never requested");
        assert(entry.toolsAvailable.length === 5, `expected 5 tools for admin, got ${entry.toolsAvailable.length}`);
        assert(entry.toolsAvailable.includes("getReporteData"), "admin should have getReporteData");
      });

      await record("D", "admin chat 'genera el reporte de datos' → 200 + getReporteData in log", async () => {
        clearCallLog();
        const { status, data } = await chat(adminToken, [{ role: "user", content: "genera el reporte de datos" }], { stream: false });
        assert(status === 200, `expected 200 got ${status}: ${JSON.stringify(data).slice(0, 200)}`);
        const entries = getCallLog().filter((e) => e.type === "tool-call");
        assert(entries.some((e) => (e.toolCallsRequested || []).includes("getReporteData")), "getReporteData not requested");
      });

      await record("D", "admin chat stream:true 'cuantos miembros hay' → 200 + non-empty text stream", async () => {
        clearCallLog();
        const res = await fetch(`${base}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({
            messages: [{ role: "user", content: "cuantos miembros hay" }],
            model: "ollama/llama3.2:3b",
          }),
          signal: AbortSignal.timeout(45000),
        });
        const text = await res.text();
        assert(res.status === 200, `expected 200 got ${res.status}`);
        assert(text.trim().length > 0, "streamed body empty");
        assert(/He consultado/.test(text), `expected answer in stream, got: ${text.slice(0, 300)}`);
      });
    });

    // ══════════════ E. AI chat — CAPTAIN (role gating, R2.7) ══════════════
    // R2.7 (obs 709): captains NEVER pick a model — the backend forces
    // automatic resolution. So captain requests send NO model field.
    await runSection("E. AI chat — CAPTAIN (role gating)", async () => {
      const chat = (token, messages, opts = {}) =>
        httpJson(base, "POST", "/api/chat", {
          token,
          body: { messages, ...opts },
          timeoutMs: 45000,
        });

      await record("E", "captain chat 'cuantos miembros hay' → 200 + text answer", async () => {
        clearCallLog();
        const { status, data } = await chat(capitanaToken, [{ role: "user", content: "cuantos miembros hay" }], { stream: false });
        assert(status === 200, `expected 200 got ${status}: ${JSON.stringify(data).slice(0, 200)}`);
        assert(/He consultado la base de datos/.test(data?.text || ""), "expected Spanish answer");
      });

      await record("E", "captain chat exposes exactly 4 tools, never getReporteData", async () => {
        const entries = getCallLog().filter((e) => e.type === "tool-call");
        assert(entries.length >= 1, "no tool-call entries");
        for (const e of entries) {
          assert(!e.toolsAvailable.includes("getReporteData"), "getReporteData leaked to captain");
          assert(e.toolsAvailable.length === 4, `expected 4 tools for captain, got ${e.toolsAvailable.length}`);
        }
        assert(entries.some((e) => (e.toolCallsRequested || []).includes("getCabildoStats")), "getCabildoStats not requested");
      });

      await record("E", "captain chat 'genera el reporte' → gated, getReporteData never requested", async () => {
        clearCallLog();
        const { status } = await chat(capitanaToken, [{ role: "user", content: "genera el reporte de datos" }], { stream: false });
        assert(status === 200, `expected 200 got ${status}`);
        const entries = getCallLog().filter((e) => e.type === "tool-call");
        assert(entries.length >= 1, "no tool-call entries");
        assert(!entries.some((e) => (e.toolCallsRequested || []).includes("getReporteData")), "getReporteData requested for captain!");
        const gated = entries.find((e) => e.gated === true && e.used === "getCabildoStats");
        assert(gated, "no gated fallback recorded (decided getReporteData → used getCabildoStats)");
      });
    });
  } finally {
    // ── Cleanup ─────────────────────────────────────────────────────────
    try {
      await stopServer(serverCtx);
    } catch (e) {
      console.error("[cleanup] stopServer failed:", e.message);
    }
    try {
      await mock.close();
    } catch (e) {
      console.error("[cleanup] mock close failed:", e.message);
    }
  }

  // ══════════════ Report ══════════════
  const bySection = new Map();
  for (const r of results) {
    if (!bySection.has(r.section)) bySection.set(r.section, []);
    bySection.get(r.section).push(r);
  }

  console.log("\n══════════════════════════ RESULTS ══════════════════════════");
  console.log("┌──────────────┬──────────────────────────────────────────┬───────┐");
  console.log("│ Section       │ Test                                     │ Result │");
  console.log("├──────────────┼──────────────────────────────────────────┼───────┤");
  for (const [section, tests] of bySection) {
    for (const t of tests) {
      const mark = t.pass ? "✅" : t.blocked ? "⛔" : "❌";
      const name = t.name.length > 40 ? `${t.name.slice(0, 39)}…` : t.name;
      console.log(`│ ${section.padEnd(13)} │ ${name.padEnd(40)} │   ${mark}   │`);
    }
    console.log("├──────────────┼──────────────────────────────────────────┼───────┤");
  }
  console.log("└──────────────┴──────────────────────────────────────────┴───────┘");

  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass && !r.blocked).length;
  const blocked = results.filter((r) => r.blocked).length;
  const exitCode = passed === total ? 0 : 1;

  console.log(`\nSummary: ${passed}/${total} passed · ${failed} failed · ${blocked} blocked`);
  if (blocked > 0) {
    console.log("\n⛔ Blocked tests (environment, not suite defects):");
    for (const r of results.filter((x) => x.blocked)) {
      console.log(`   - ${r.name}: ${r.note}`);
    }
  }
  if (failed > 0) {
    console.log("\n❌ Failed tests:");
    for (const r of results.filter((x) => !x.pass && !x.blocked)) {
      console.log(`   - [${r.section}] ${r.name}`);
    }
  }
  console.log(`\nExit code: ${exitCode}`);
  process.exit(exitCode);
}

main().catch((err) => {
  console.error("\nINTENSIVE SUITE ERROR:", err);
  process.exit(1);
});
