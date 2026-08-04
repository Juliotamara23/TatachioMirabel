import { runSuite, createTestHelper } from "../../lib/suite-runner.mjs";
import { loginAdmin } from "../../lib/test-utils.mjs";
import { spawnSync } from "node:child_process";

function runCli(base, token, args) {
  const env = { ...process.env, TATACHIO_BASE_URL: base, TATACHIO_TOKEN: token };
  return spawnSync("apps/cli/node_modules/.bin/tsx", ["apps/cli/src/index.ts", ...args], { env, encoding: "utf-8", cwd: "/home/z/dev/Proyects/TatachioMirabel" });
}

function runCliNoToken(base, args) {
  const env = { ...process.env, TATACHIO_BASE_URL: base };
  return spawnSync("apps/cli/node_modules/.bin/tsx", ["apps/cli/src/index.ts", ...args], { env, encoding: "utf-8", cwd: "/home/z/dev/Proyects/TatachioMirabel" });
}

function parseJsonOutput(stdout) {
  const text = stdout.trim();
  console.log('DEBUG: stdout length:', text.length);
  console.log('DEBUG: First 500 chars:', text.slice(0, 500));
  console.log('DEBUG: Last 500 chars:', text.slice(-500));
  
  // Count braces
  let openBraces = 0;
  let closeBraces = 0;
  for (const ch of text) {
    if (ch === '{') openBraces++;
    if (ch === '}') closeBraces++;
  }
  console.log('DEBUG: Open braces:', openBraces, 'Close braces:', closeBraces);
  
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
  console.log('DEBUG: Found end at:', end, 'depth at end:', depth);
  if (end === -1) throw new Error("Unbalanced JSON");

  const parsed = JSON.parse(text.slice(start, end + 1));
  if (parsed && typeof parsed === "object" && "ok" in parsed) {
    if (!parsed.ok) throw new Error(parsed.error || "CLI error");
    return parsed.data;
  }
  return parsed;
}

await runSuite({ name: "cli/miembros", seed: false, start: true }, async ({ base }) => {
  const helper = createTestHelper("cli/miembros");
  const adminToken = await loginAdmin(base);
  
  const res = runCli(base, adminToken, ["miembros", "list", "--json"]);
  console.log('Exit code:', res.status);
  console.log('Stderr:', res.stderr);
  const data = parseJsonOutput(res.stdout);
  console.log('Parsed length:', data.length);
  return helper.finish();
});