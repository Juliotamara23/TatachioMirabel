import { defineConfig } from "@playwright/test";

/**
 * Playwright configuration for the frontend web admin E2E suite.
 * CORS is hardcoded to localhost:5173 (vite preview --port 5173 --strictPort).
 * QA_HOME isolation is inherited from the run-all.mjs orchestrator.
 */
export default defineConfig({
  testDir: ".",
  testMatch: /\.spec\.ts$/,
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter frontend preview --port 5173 --strictPort",
      port: 5173,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
