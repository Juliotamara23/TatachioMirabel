import { runSuite, createTestHelper } from "../../lib/suite-runner.mjs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const projectRoot = resolve("/home/z/dev/Proyects/TatachioMirabel");
const cliFilter = ["apps/cli/src/index.ts"];

/**
 * Run the CLI command and return parsed result.
 * @param {string[]} args - CLI args after `pnpm --filter @tatachio/cli dev --`
 * @param {Record<string, string>} [env] - Additional env vars
 * @returns {{ status: number; stdout: string; stderr: string; json?: unknown }}
 */
function runCli(args, env = {}) {
  const result = spawnSync(
    "apps/cli/node_modules/.bin/tsx",
    [...cliFilter, ...args],
    {
      cwd: projectRoot,
      env: { ...process.env, ...env },
      encoding: "utf-8",
      timeout: 30000,
    }
  );
  let json;
  try {
    const text = (result.stdout || "").trim();
    const start = text.indexOf("{");
    if (start !== -1) {
      let depth = 0, inString = false, escaped = false, end = -1;
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
      json = end !== -1 ? JSON.parse(text.slice(start, end + 1)) : undefined;
    }
  } catch {
    json = undefined;
  }
  return {
    status: result.status ?? 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    json,
  };
}

/**
 * Login via API directly to get a token for CLI tests.
 * This bypasses the CLI's interactive login limitation.
 */
async function loginViaApi(base, email, password) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data.token;
}

runSuite({ name: "cli/auth", seed: true, start: true }, async ({ base }) => {
  const helper = createTestHelper("cli/auth");

  // ── Pre-auth: get admin token via API for tests that need auth ──────────────
  let adminToken;
  {
    const res = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@tatachio.com", password: "admin123" }),
    });
    const data = await res.json();
    if (!res.ok || !data.token) throw new Error("Failed to get admin token for CLI tests");
    adminToken = data.token;
  }

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  // NOTE: Current CLI login command requires interactive TTY (inquirer prompts).
  // It does NOT accept --email/--password flags. In pipe mode (--json or non-TTY),
  // it requires TATACHIO_TOKEN env var. We test what's actually supported.

  helper.test("login command shows help/usage without crashing", async () => {
    const result = runCli(["login", "--help"]);
    if (result.status !== 0) throw new Error(`Expected exit 0, got ${result.status}`);
    if (!result.stdout.includes("login") && !result.stderr.includes("login")) {
      throw new Error("Help output missing 'login'");
    }
  });

  helper.test("login command with --json requires TATACHIO_TOKEN (pipe mode)", async () => {
    const result = runCli(["login", "--json"], { TATACHIO_BASE_URL: base });
    // In pipe mode without token, should fail with specific error
    if (result.status === 0) throw new Error("Expected non-zero exit in pipe mode without token");
    const output = result.json ?? result.stderr ?? result.stdout;
    if (!String(output).includes("TATACHIO_TOKEN")) {
      throw new Error(`Expected TATACHIO_TOKEN error, got: ${output}`);
    }
  });

  // ── LOGOUT ─────────────────────────────────────────────────────────────────
  helper.test("logout command shows help/usage without crashing", async () => {
    const result = runCli(["logout", "--help"]);
    if (result.status !== 0) throw new Error(`Expected exit 0, got ${result.status}`);
    if (!result.stdout.includes("logout") && !result.stderr.includes("logout")) {
      throw new Error("Help output missing 'logout'");
    }
  });

  helper.test("logout with valid token (via env) succeeds", async () => {
    const result = runCli(["logout", "--json"], {
      TATACHIO_BASE_URL: base,
      TATACHIO_TOKEN: adminToken,
    });
    if (result.status !== 0) throw new Error(`Expected exit 0, got ${result.status}: ${result.stderr}`);
    if (!result.json?.ok) throw new Error(`Expected ok=true in JSON output: ${result.stdout}`);
    if (!result.json?.data?.message?.includes("Logged out")) {
      throw new Error(`Expected logout message: ${result.stdout}`);
    }
  });

  helper.test("logout without token shows error", async () => {
    // Use a unique config dir to avoid picking up any stored token
    const result = runCli(["logout", "--json"], {
      TATACHIO_BASE_URL: base,
      HOME: "/tmp/nonexistent-home-for-test",
    });
    // Should succeed (logout is idempotent) or show a non-fatal message
    if (result.status !== 0 && result.status !== 1) {
      throw new Error(`Unexpected exit code ${result.status}: ${result.stderr}`);
    }
  });

  // ── PROTECTED COMMANDS AFTER LOGOUT ────────────────────────────────────────
  helper.test("protected command (miembros list) without token fails with auth error", async () => {
    const result = runCli(["miembros", "list", "--json"], {
      TATACHIO_BASE_URL: base,
      HOME: "/tmp/nonexistent-home-for-test",
    });
    if (result.status === 0) throw new Error("Expected non-zero exit without token");
    const output = result.json ?? result.stderr ?? result.stdout;
    const msg = String(output).toLowerCase();
    if (!msg.includes("token") && !msg.includes("auth") && !msg.includes("unauthorized") && !msg.includes("login")) {
      throw new Error(`Expected auth error, got: ${output}`);
    }
  });

  helper.test("protected command with valid token (via env) succeeds", async () => {
    // Use --search to keep output small (1000-member list is huge pretty-printed)
    const result = runCli(["miembros", "list", "--search", "FANNY", "--json"], {
      TATACHIO_BASE_URL: base,
      TATACHIO_TOKEN: adminToken,
    });
    if (result.status !== 0) throw new Error(`Expected exit 0, got ${result.status}: ${result.stderr}`);
    if (!result.json?.ok) throw new Error(`Expected ok=true: ${result.stdout.slice(0, 300)}`);
    if (!Array.isArray(result.json.data)) {
      throw new Error(`Expected members array in response: ${result.stdout.slice(0, 200)}`);
    }
  });

  helper.test("protected command with invalid token fails", async () => {
    const result = runCli(["miembros", "list", "--json"], {
      TATACHIO_BASE_URL: base,
      TATACHIO_TOKEN: "invalid.token.here",
    });
    if (result.status === 0) throw new Error("Expected non-zero exit with invalid token");
    const output = result.json ?? result.stderr ?? result.stdout;
    const msg = String(output).toLowerCase();
    if (!msg.includes("token") && !msg.includes("auth") && !msg.includes("unauthorized") && !msg.includes("invalid") && !msg.includes("failed") && !msg.includes("error")) {
      throw new Error(`Expected auth error for invalid token, got: ${output}`);
    }
  });

  // ── LOGIN AGAIN (via API token simulation) ─────────────────────────────────
  helper.test("login flow: get token via API, use with CLI, logout, then get new token", async () => {
    // 1. Get fresh token via API
    const token1 = await loginViaApi(base, "admin@tatachio.com", "admin123");
    if (!token1) throw new Error("Failed to get first token");

    // 2. Use token with CLI
    const list1 = runCli(["miembros", "list", "--json"], {
      TATACHIO_BASE_URL: base,
      TATACHIO_TOKEN: token1,
    });
    if (list1.status !== 0) throw new Error(`First token failed: ${list1.stderr}`);

    // 3. Logout via CLI
    const logoutResult = runCli(["logout", "--json"], {
      TATACHIO_BASE_URL: base,
      TATACHIO_TOKEN: token1,
    });
    if (logoutResult.status !== 0) throw new Error(`Logout failed: ${logoutResult.stderr}`);

    // 4. Get new token via API (simulating login again)
    const token2 = await loginViaApi(base, "admin@tatachio.com", "admin123");
    if (!token2) throw new Error("Failed to get second token");
    if (token2 === token1) throw new Error("Expected new token after logout/login cycle");

    // 5. Use new token with CLI
    const list2 = runCli(["miembros", "list", "--json"], {
      TATACHIO_BASE_URL: base,
      TATACHIO_TOKEN: token2,
    });
    if (list2.status !== 0) throw new Error(`Second token failed: ${list2.stderr}`);
  });

  // ── INVALID CREDENTIALS (via API, since CLI login is interactive) ──────────
  helper.test("API login with wrong password returns 401", async () => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@tatachio.com", password: "wrongpassword" }),
    });
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
    const data = await res.json();
    if (!data.error) throw new Error("Expected error in response");
  });

  helper.test("API login with non-existent email returns 401", async () => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "noexiste@tatachio.com", password: "admin123" }),
    });
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  helper.test("API login with missing fields returns 400", async () => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@tatachio.com" }),
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  return helper.finish();
});