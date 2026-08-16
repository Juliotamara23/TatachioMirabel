import { defineConfig } from "@playwright/test";

/**
 * Playwright configuration for the frontend web admin E2E suite.
 *
 * ISOLATION GUARANTEE: This config runs a FULLY AUTONOMOUS E2E suite that
 * NEVER talks to the developer's dev servers (3000/5173).
 *
 * Architecture:
 *   1. BACKEND (webServer[0]): node scripts/qa/lib/start-web-backend.mjs
 *      - Starts on FIXED port 3456
 *      - Uses disposable qa.db + isolated QA_HOME (fake HOME + TATACHIO_REPORTES_DIR)
 *      - Seeds database on startup via seed-db.mjs
 *      - Prints "WEB_QA_BACKEND_READY http://localhost:3456" when healthy
 *      - reuseExistingServer: false (always spawns fresh)
 *   2. FRONTEND (webServer[1]): VITE_API_BASE_URL=http://localhost:3456 pnpm --filter frontend build && pnpm --filter frontend preview --port 5173 --strictPort
 *      - Builds with VITE_API_BASE_URL pointing to the QA backend (3456)
 *      - Vite injects env at BUILD time, so preview serves the correct API URL
 *      - Runs on port 5173 with --strictPort (FAILS if port busy — INTENTIONAL)
 *      - reuseExistingServer: false (always spawns fresh)
 *
 * IMPORTANT: If you have `vite dev` running on 5173, the --strictPort flag
 * will cause the frontend webServer to fail. This is INTENTIONAL — the E2E
 * suite must be completely isolated from your development environment.
 * Stop your dev server before running E2E tests, or run E2E in CI where
 * no dev server exists.
 *
 * Base URL for tests: http://localhost:5173 (the frontend preview server)
 * API calls from frontend go to: http://localhost:3456 (the QA backend)
 */
export default defineConfig({
  testDir: ".",
  testMatch: /\.spec\.ts$/,
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: "http://localhost:5173",
    headless: !!process.env.CI, // local runs show the browser; CI stays headless
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: [
    {
      command: "node ../../lib/start-web-backend.mjs",
      url: "http://localhost:3456/test",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "VITE_API_BASE_URL=http://localhost:3456 pnpm --filter frontend build && pnpm --filter frontend preview --port 5173 --strictPort",
      port: 5173,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});