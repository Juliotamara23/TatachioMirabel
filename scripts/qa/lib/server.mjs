#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, createWriteStream, existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..", "..", "..");

/**
 * Single fixed backend port shared by BOTH QA flows:
 * - Full run: run-all.mjs → suite-runner.mjs (every API/CLI/chaos suite)
 * - Web E2E: start-web-backend.mjs → Playwright webServer
 * Kept in one place so the two flows can never drift apart.
 */
export const QA_BACKEND_PORT = 3456;

/**
 * Error thrown when the backend cannot bind because the port is still in use.
 * startServer retries these a few times (socket teardown races between
 * sequential suites) before giving up.
 */
class PortInUseError extends Error {
  constructor(port) {
    super(`Port ${port} is already in use (EADDRINUSE)`);
    this.name = "PortInUseError";
    this.code = "EADDRINUSE";
  }
}

/**
 * Find a free port in the 3456-3499 range.
 * Returns a promise that resolves with the free port.
 * NOTE: no longer the default port source (startServer uses QA_BACKEND_PORT);
 * kept available for callers that explicitly need a dynamic port.
 */
async function findFreePort(start = 3456, end = 3499) {
  for (let port = start; port <= end; port++) {
    try {
      const server = createServer();
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, () => {
          const actualPort = server.address().port;
          server.close(() => resolve(actualPort));
        });
      });
      return port;
    } catch (error) {
      // Port is in use, try next
    }
  }
  throw new Error(`No free port found in range ${start}-${end}`);
}

/**
 * Poll a server endpoint until it's healthy.
 * @param port - The port to check
 * @param healthPath - Health check path (default "/test" for backend)
 * @param timeoutMs - Maximum time to wait (default 120000ms for first-run deps)
 * @param intervalMs - Polling interval (default 500ms)
 * @returns true when healthy
 * @throws Error if timeout reached
 */
async function waitForHealth(
  port,
  healthPath = "/test",
  timeoutMs = 120000,
  intervalMs = 500
) {
  const startTime = Date.now();
  const endpoint = `http://localhost:${port}${healthPath}`;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(endpoint, { method: "HEAD", signal: AbortSignal.timeout(1000) });
      // Any response (even 404) means server is alive
      return true;
    } catch (error) {
      // Server not ready yet
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }

  throw new Error(`Server health check timeout after ${timeoutMs}ms`);
}

/**
 * Start the backend server for QA testing.
 * @param options - Configuration options
 * @returns Promise<{port: number, process: import('node:child_process').ChildProcess, dbPath: string}>
 */
export async function startServer(options = {}) {
  const port = options.port ?? QA_BACKEND_PORT;
  const dbPath = options.dbPath || join(projectRoot, "scripts", "qa", "qa.db");
  const extraEnv = options.env || {};

  // Sequential suites share ONE fixed port, so the previous suite's server can
  // briefly linger (TIME_WAIT / slow process-group teardown) and make the next
  // bind fail with EADDRINUSE. Node sets SO_REUSEADDR by default, which covers
  // most TIME_WAIT cases; retrying a few times is belt-and-suspenders on top.
  const maxAttempts = 5;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await startServerAttempt({ port, dbPath, extraEnv });
    } catch (error) {
      lastError = error;
      if (error.code !== "EADDRINUSE" || attempt === maxAttempts) {
        throw error;
      }
      console.log(`Port ${port} busy (EADDRINUSE) — retry ${attempt}/${maxAttempts} in 1s`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw lastError;
}

/**
 * One spawn + health-check attempt for the backend.
 * @param port - Port to bind
 * @param dbPath - SQLite database file path
 * @param extraEnv - Extra environment variables for the backend process
 */
async function startServerAttempt({ port, dbPath, extraEnv }) {
  // Prepare environment variables for the backend
  const env = {
    ...process.env,
    ...extraEnv,
    PORT: String(port),
    DATABASE_URL: `file:${resolve(dbPath)}`,
    JWT_SECRET: "qa-secret",
    NODE_ENV: "test",
  };

  const backendDir = join(projectRoot, "apps", "backend");
  // Prefer tsx dev mode (no build step needed); fall back to the pre-built
  // "start" script when tsx is not installed.
  const useDev = existsSync(join(backendDir, "node_modules", ".bin", "tsx"));
  const command = "pnpm";
  const args = useDev
    ? ["--filter", "@tatachio/backend", "dev"]
    : ["--filter", "@tatachio/backend", "start"];

  console.log(`Starting backend on port ${port} with DB: ${dbPath}`);

  let backendProcess;
  try {
    backendProcess = spawn(command, args, {
      cwd: backendDir,
      env,
      stdio: "pipe",
      shell: false,
      // detached creates a new process group so stopServer can kill the whole
      // tree (pnpm → tsx → node child) — otherwise tsx/node children survive.
      detached: true,
    });

    // Capture stdout/stderr to log files for debugging
    const stdoutLogPath = join(projectRoot, "scripts", "qa", "backend-startup.log");
    const stderrLogPath = join(projectRoot, "scripts", "qa", "backend-error.log");

    // Write logs to files instead of console
    writeFileSync(stdoutLogPath, "", { flag: "w" });
    writeFileSync(stderrLogPath, "", { flag: "w" });

    if (backendProcess.stdout) {
      backendProcess.stdout.pipe(createWriteStream(stdoutLogPath, { flags: "a" }));
    }
    if (backendProcess.stderr) {
      backendProcess.stderr.pipe(createWriteStream(stderrLogPath, { flags: "a" }));
    }

    // Wait for server to become healthy (use /test endpoint, 120s timeout for
    // first-run deps). Fail fast on EADDRINUSE / early exit so the retry loop
    // in startServer kicks in instead of waiting out the full health timeout.
    await waitForBackendReady(port, backendProcess);
    console.log(`Server is healthy on port ${port}`);

    console.log(`Backend started successfully on port ${port}`);

    return {
      port,
      process: backendProcess,
      dbPath,
    };

  } catch (error) {
    console.error("Failed to start backend:", error);
    // Kill the process if it was spawned but failed to start
    if (backendProcess && !backendProcess.killed) {
      console.log("Cleaning up partially started backend process");
      backendProcess.kill("SIGKILL");
    }
    throw error;
  }
}

/**
 * Wait until the backend answers /test, rejecting early when it cannot bind
 * (EADDRINUSE) or exits before becoming healthy.
 * @param port - Port to check
 * @param backendProcess - Spawned backend process to watch
 * @returns Promise that resolves when healthy
 */
function waitForBackendReady(port, backendProcess) {
  return new Promise((resolve, reject) => {
    let stderrBuf = "";
    let settled = false;

    const cleanup = () => {
      backendProcess.stderr?.off("data", onStderr);
      backendProcess.off("exit", onExit);
    };

    const onStderr = (chunk) => {
      stderrBuf += chunk.toString();
      if (!settled && stderrBuf.includes("EADDRINUSE")) {
        settled = true;
        cleanup();
        reject(new PortInUseError(port));
      }
    };

    const onExit = (code) => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(
          new Error(`Backend exited early with code ${code} (stderr: ${stderrBuf.slice(-500) || "none"})`)
        );
      }
    };

    const onHealthy = () => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve();
      }
    };

    backendProcess.stderr?.on("data", onStderr);
    backendProcess.once("exit", onExit);
    waitForHealth(port, "/test", 120000, 500).then(onHealthy, (error) => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(error);
      }
    });
  });
}

/**
 * Stop a running server.
 * @param ctx - Server context with process property
 */
export async function stopServer(ctx) {
  if (!ctx || !ctx.process) {
    throw new Error("Invalid server context");
  }

  const { process: backendProcess } = ctx;

  console.log("Stopping server...");

  // If the process already exited, there is nothing to kill — resolve
  // immediately instead of throwing ESRCH from kill().
  if (backendProcess.exitCode !== null || backendProcess.killed) {
    console.log("Server process already exited, skipping termination");
    return;
  }

  // Kill the whole process group (pnpm → tsx → node child). The spawn used
  // detached:true so the child has its own process group (-pid targets it).
  try {
    process.kill(-backendProcess.pid, "SIGTERM");
  } catch (e) {
    // Process group may already be gone
    try { backendProcess.kill("SIGTERM"); } catch (_) { /* ignore */ }
  }

  // Wait up to 5s for graceful shutdown
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log("Server did not stop gracefully, sending SIGKILL");
      try { process.kill(-backendProcess.pid, "SIGKILL"); } catch (_) { /* ignore */ }
      try { backendProcess.kill("SIGKILL"); } catch (_) { /* ignore */ }
      resolve();
    }, 5000);

    backendProcess.once("exit", (code, signal) => {
      clearTimeout(timeout);
      console.log(`Server stopped with code ${code} and signal ${signal}`);
      resolve();
    });
  });
}
