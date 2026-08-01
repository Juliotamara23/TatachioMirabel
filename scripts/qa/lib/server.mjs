#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, createWriteStream } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..", "..", "..");

/**
 * Find a free port in the 3456-3499 range.
 * Returns a promise that resolves with the free port.
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
 * @param timeoutMs - Maximum time to wait (default 15000ms)
 * @param intervalMs - Polling interval (default 500ms)
 * @returns true when healthy
 * @throws Error if timeout reached
 */
async function waitForHealth(
  port,
  timeoutMs = 15000,
  intervalMs = 500
) {
  const startTime = Date.now();
  const endpoint = `http://localhost:${port}/`;

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
  const port = options.port || await findFreePort();
  const dbPath = options.dbPath || join(projectRoot, "scripts", "qa", "qa.db");

  // Prepare environment variables for the backend
  const env = {
    ...process.env,
    PORT: String(port),
    DATABASE_URL: `file:${resolve(dbPath)}`,
    JWT_SECRET: "qa-secret",
    NODE_ENV: "test",
  };

  const backendDir = join(projectRoot, "apps", "backend");
  // Use tsx for dev mode — no build step needed.
  // Falls back to "start" if tsx not available (pre-built).
  const useDev = true; // tsx handles TypeScript directly
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

    // Wait for server to become healthy
    await waitForHealth(port, 30000, 500);
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
 * Stop a running server.
 * @param ctx - Server context with process property
 */
export async function stopServer(ctx) {
  if (!ctx || !ctx.process) {
    throw new Error("Invalid server context");
  }

  const { process: backendProcess } = ctx;

  console.log("Stopping server...");

  // Send SIGTERM for graceful shutdown
  backendProcess.kill("SIGTERM");

  // Wait up to 5s for graceful shutdown
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log("Server did not stop gracefully, sending SIGKILL");
      backendProcess.kill("SIGKILL");
      resolve();
    }, 5000);

    backendProcess.once("exit", (code, signal) => {
      clearTimeout(timeout);
      console.log(`Server stopped with code ${code} and signal ${signal}`);
      resolve();
    });
  });
}
