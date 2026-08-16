import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

/**
 * Demo-CRUD video config: records demo-crud.spec.ts (full admin CRUD workflow)
 * against the QA stack with a MOCKED LLM.
 *
 * webServer[0] boots start-web-backend-mock.mjs instead of the plain backend
 * launcher: it starts the OpenAI-compatible LLM mock on port 3457 and wires
 * the backend to it via OLLAMA_BASE_URL/AI_PROVIDER with every real provider
 * key neutralized — the demo runs hermetically with ZERO token cost.
 *
 * Run (from repo root):
 *   pnpm --filter frontend exec playwright test \
 *     --config=scripts/qa/suites/web/playwright.crud-video.config.ts \
 *     demo-crud.spec.ts --reporter=line
 *
 * Videos land in /mnt/e/MediaProyects/web-e2e-demo/ (worker-scoped).
 */
export default defineConfig({
  ...baseConfig,
  workers: 1,
  use: {
    ...baseConfig.use,
    video: "on",
  },
  outputDir: "/mnt/e/MediaProyects/web-e2e-demo",
  webServer: [
    {
      // Mocked-LLM backend: seeds qa.db, mock on 3457, backend on 3456.
      command: "node ../../lib/start-web-backend-mock.mjs",
      url: "http://localhost:3456/test",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // Frontend preview — same as the base config: build with the QA API
      // URL baked in, then serve on 5173 (--strictPort fails if busy).
      command:
        "VITE_API_BASE_URL=http://localhost:3456 pnpm --filter frontend build && pnpm --filter frontend preview --port 5173 --strictPort",
      port: 5173,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
