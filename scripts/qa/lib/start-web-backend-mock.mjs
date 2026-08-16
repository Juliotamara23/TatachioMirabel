#!/usr/bin/env node
/**
 * start-web-backend-mock.mjs — Long-running QA backend WITH a mocked LLM.
 *
 * Same role as start-web-backend.mjs (spawned by Playwright's webServer,
 * seeds qa.db, starts the backend on the shared QA port 3456, prints a ready
 * line and keeps the process alive), PLUS it:
 *   1. Boots the OpenAI-compatible LLM mock (openai-compat-mock.mjs) on a
 *      FIXED port 3457 — must not clash with the backend's 3456.
 *   2. Wires the backend to the mock via OLLAMA_BASE_URL + AI_PROVIDER=ollama
 *      and neutralizes every real provider key to "" (empty values win over
 *      .env because dotenv never overrides already-set vars — same hermetic
 *      pattern as intensive-http-cli-ia.test.mjs). The demo therefore runs
 *      with ZERO token cost and NO real API keys.
 *   3. On shutdown it logs how many requests the mock served (getCallLog) so
 *      the run output proves the chat went through the mock, not a real LLM.
 *
 * Usage (by Playwright webServer):
 *   node scripts/qa/lib/start-web-backend-mock.mjs
 *
 * The script exits with non-zero code on startup failure.
 */

import { startServer, stopServer, QA_BACKEND_PORT } from "./server.mjs";
import { obtenerQaEnv } from "./isolation.mjs";
import { startOpenAICompatMock, getCallLog } from "./openai-compat-mock.mjs";
import { execSync } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const qaDir = resolve(__dirname, "..");

/** Fixed mock port — the backend reaches it via OLLAMA_BASE_URL. */
const MOCK_PORT = 3457;

let serverContext = null;
let mock = null;

/**
 * Runs the database seed script from the QA directory.
 */
async function runSeed() {
  const seedScript = join(qaDir, "lib", "seed-db.mjs");
  console.log("[WEB_QA_BACKEND_MOCK] Seeding database...");
  execSync(`node ${seedScript}`, {
    cwd: qaDir,
    stdio: "inherit",
    env: { ...process.env, QA_SKIP_SEED: "1" }, // Avoid double-seed if seedOnce runs
  });
  console.log("[WEB_QA_BACKEND_MOCK] Seed completed");
}

/**
 * Main entry point.
 */
async function main() {
  console.log(
    `[WEB_QA_BACKEND_MOCK] Starting QA backend on shared QA port ${QA_BACKEND_PORT} ` +
      `with mocked LLM on port ${MOCK_PORT}...`
  );

  try {
    // 1. LLM mock FIRST (fixed port) so the backend's provider registry can
    //    reach /v1/models and /v1/chat/completions as soon as it needs them.
    mock = await startOpenAICompatMock({ port: MOCK_PORT });
    console.log(`[WEB_QA_BACKEND_MOCK] OpenAI-compatible mock listening on http://localhost:${MOCK_PORT}/v1`);

    // 2. Seed the database
    await runSeed();

    // 3. Get isolated QA environment (fake HOME + TATACHIO_REPORTES_DIR)
    const qaEnv = await obtenerQaEnv();

    // 4. Start backend on the shared QA port, pointing the AI stack at the
    //    local mock and neutralizing every real provider key (empty string
    //    wins over .env via dotenv's never-override semantics).
    serverContext = await startServer({
      port: QA_BACKEND_PORT,
      env: {
        ...qaEnv,
        OLLAMA_BASE_URL: `http://localhost:${MOCK_PORT}/v1`,
        AI_PROVIDER: "ollama",
        GOOGLE_GENERATIVE_AI_API_KEY: "",
        ANTHROPIC_API_KEY: "",
        OPENAI_API_KEY: "",
        OPENROUTER_API_KEY: "",
      },
    });

    // 5. Signal readiness to Playwright webServer
    const readyUrl = `http://localhost:${serverContext.port}`;
    console.log(`WEB_QA_BACKEND_READY ${readyUrl}`);

    // 6. Keep process alive until SIGTERM/SIGINT
    await new Promise(() => {
      // Intentionally never resolves; process exits via signal handler
    });
  } catch (error) {
    console.error("[WEB_QA_BACKEND_MOCK] Failed to start:", error.message);
    if (mock) {
      try { await mock.close(); } catch (_) { /* ignore */ }
    }
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler.
 */
async function shutdown(signal) {
  console.log(`[WEB_QA_BACKEND_MOCK] Received ${signal}, shutting down...`);

  // Prove the mock was actually used (not a real LLM): log its call count.
  if (mock) {
    const calls = getCallLog().length;
    console.log(`[WEB_QA_BACKEND_MOCK] LLM mock served ${calls} request(s)`);
  }

  if (serverContext) {
    try {
      await stopServer(serverContext);
      console.log("[WEB_QA_BACKEND_MOCK] Backend stopped gracefully");
    } catch (error) {
      console.error("[WEB_QA_BACKEND_MOCK] Error during shutdown:", error.message);
    }
  }

  if (mock) {
    try {
      await mock.close();
      console.log("[WEB_QA_BACKEND_MOCK] LLM mock stopped");
    } catch (error) {
      console.error("[WEB_QA_BACKEND_MOCK] Error stopping mock:", error.message);
    }
  }

  process.exit(0);
}

// Register signal handlers
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Handle uncaught errors to ensure cleanup
process.on("uncaughtException", async (error) => {
  console.error("[WEB_QA_BACKEND_MOCK] Uncaught exception:", error);
  if (serverContext) {
    try { await stopServer(serverContext); } catch (_) { /* ignore */ }
  }
  if (mock) {
    try { await mock.close(); } catch (_) { /* ignore */ }
  }
  process.exit(1);
});

process.on("unhandledRejection", async (reason) => {
  console.error("[WEB_QA_BACKEND_MOCK] Unhandled rejection:", reason);
  if (serverContext) {
    try { await stopServer(serverContext); } catch (_) { /* ignore */ }
  }
  if (mock) {
    try { await mock.close(); } catch (_) { /* ignore */ }
  }
  process.exit(1);
});

// Start the backend
main();
