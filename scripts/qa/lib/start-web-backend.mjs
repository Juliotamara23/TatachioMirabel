#!/usr/bin/env node
/**
 * start-web-backend.mjs — Long-running QA backend for Playwright web E2E suite.
 *
 * This script is spawned by Playwright's webServer (backend entry) and runs for
 * the entire test suite duration. It:
 * 1. Seeds the QA database (qa.db) via seed-db.mjs
 * 2. Starts the backend on the SHARED QA port (QA_BACKEND_PORT = 3456, the
 *    same port the full run uses) with isolated QA_HOME
 * 3. Prints a ready line and keeps the process alive
 * 4. Handles SIGTERM/SIGINT for graceful shutdown by Playwright
 *
 * Usage (by Playwright webServer):
 *   node scripts/qa/lib/start-web-backend.mjs
 *
 * The script exits with non-zero code on startup failure.
 */

import { startServer, stopServer, QA_BACKEND_PORT } from "./server.mjs";
import { obtenerQaEnv } from "./isolation.mjs";
import { execSync } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const qaDir = resolve(__dirname, "..");

let serverContext = null;

/**
 * Runs the database seed script from the QA directory.
 */
async function runSeed() {
  const seedScript = join(qaDir, "lib", "seed-db.mjs");
  console.log("[WEB_QA_BACKEND] Seeding database...");
  execSync(`node ${seedScript}`, {
    cwd: qaDir,
    stdio: "inherit",
    env: { ...process.env, QA_SKIP_SEED: "1" }, // Avoid double-seed if seedOnce runs
  });
  console.log("[WEB_QA_BACKEND] Seed completed");
}

/**
 * Main entry point.
 */
async function main() {
  console.log(`[WEB_QA_BACKEND] Starting QA backend on shared QA port ${QA_BACKEND_PORT}...`);

  try {
    // 1. Seed the database first
    await runSeed();

    // 2. Get isolated QA environment (fake HOME + TATACHIO_REPORTES_DIR)
    const qaEnv = await obtenerQaEnv();

    // 3. Start backend on the shared QA port (same as the full run's suites)
    // Use /test endpoint for health check (backend has GET /test returning "working")
    serverContext = await startServer({
      port: QA_BACKEND_PORT,
      env: qaEnv,
    });

    // 4. Signal readiness to Playwright webServer
    const readyUrl = `http://localhost:${serverContext.port}`;
    console.log(`WEB_QA_BACKEND_READY ${readyUrl}`);

    // 5. Keep process alive until SIGTERM/SIGINT
    // Use a never-resolving promise to wait indefinitely
    await new Promise(() => {
      // Intentionally never resolves; process exits via signal handler
    });

  } catch (error) {
    console.error("[WEB_QA_BACKEND] Failed to start:", error.message);
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler.
 */
async function shutdown(signal) {
  console.log(`[WEB_QA_BACKEND] Received ${signal}, shutting down...`);

  if (serverContext) {
    try {
      await stopServer(serverContext);
      console.log("[WEB_QA_BACKEND] Backend stopped gracefully");
    } catch (error) {
      console.error("[WEB_QA_BACKEND] Error during shutdown:", error.message);
    }
  }

  process.exit(0);
}

// Register signal handlers
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Handle uncaught errors to ensure cleanup
process.on("uncaughtException", async (error) => {
  console.error("[WEB_QA_BACKEND] Uncaught exception:", error);
  if (serverContext) {
    try { await stopServer(serverContext); } catch (_) { /* ignore */ }
  }
  process.exit(1);
});

process.on("unhandledRejection", async (reason) => {
  console.error("[WEB_QA_BACKEND] Unhandled rejection:", reason);
  if (serverContext) {
    try { await stopServer(serverContext); } catch (_) { /* ignore */ }
  }
  process.exit(1);
});

// Start the backend
main();