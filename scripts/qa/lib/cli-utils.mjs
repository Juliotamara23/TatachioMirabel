import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { obtenerQaEnv } from "./isolation.mjs";

const CLI_ROOT = resolve("/home/z/dev/Proyects/TatachioMirabel/apps/cli");

/**
 * Spawns the CLI and returns { code, stdout, stderr }.
 * Uses `tsx` to run from source (no build step needed for QA).
 * ALWAYS injects the isolated QA_HOME (fake HOME + TATACHIO_REPORTES_DIR,
 * issue #62) — the CLI never sees the real production environment; caller env
 * wins for per-call overrides.
 */
export async function runCli(args, { base, token, env = {} } = {}) {
  const command = "npx";
  const cliArgs = ["tsx", "src/index.ts", ...args];

  const aislamiento = await obtenerQaEnv();

  const fullEnv = {
    ...process.env,
    ...aislamiento,
    TATACHIO_BASE_URL: base ?? process.env.TATACHIO_BASE_URL ?? "http://localhost:3000",
    ...(token ? { TATACHIO_TOKEN: token } : {}),
    ...env,
  };

  const result = spawnSync(command, cliArgs, {
    cwd: CLI_ROOT,
    env: fullEnv,
    encoding: "utf-8",
    maxBuffer: 1024 * 1024,
  });

  return {
    code: result.status ?? 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

/**
 * Parses CLI stdout as JSON.
 * Handles the envelope { ok: true, data } or { ok: false, error }.
 * If stdout has extra text before JSON, extracts the JSON portion.
 */
export function parseJsonOutput(stdout) {
  let jsonText = stdout.trim();

  // Find first { or [ to handle any preamble text
  const firstBrace = jsonText.indexOf("{");
  const firstBracket = jsonText.indexOf("[");
  const startIdx =
    firstBrace === -1
      ? firstBracket
      : firstBracket === -1
      ? firstBrace
      : Math.min(firstBrace, firstBracket);

  if (startIdx > 0) {
    jsonText = jsonText.slice(startIdx);
  }

  try {
    const parsed = JSON.parse(jsonText);
    if (parsed && typeof parsed === "object" && "ok" in parsed) {
      return {
        ok: parsed.ok,
        data: parsed.data,
        error: parsed.error,
      };
    }
    // Not an envelope, return as-is
    return { ok: true, data: parsed, error: null };
  } catch (e) {
    return {
      ok: false,
      data: null,
      error: `Failed to parse JSON output: ${e.message}\nRaw stdout: ${stdout.slice(0, 500)}`,
    };
  }
}

/**
 * Runs `login --email X --password Y` and returns the token.
 * Uses JSON output mode to parse the token reliably.
 * Requires non-interactive mode (TATACHIO_TOKEN not set, or we pass credentials).
 */
export async function cliLogin(base, email, password) {
  const result = await runCli(
    ["login", "--email", email, "--password", password, "--json"],
    { base }
  );

  const parsed = parseJsonOutput(result.stdout);

  if (!parsed.ok || !parsed.data?.token) {
    const errMsg = parsed.error || result.stderr || "Login failed (no token in response)";
    throw new Error(`CLI login failed: ${errMsg}`);
  }

  return parsed.data.token;
}