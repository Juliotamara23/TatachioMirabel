import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

/**
 * Temporary demo config: records videos of the E2E run for WSL viewing.
 * Run: pnpm --filter frontend test:e2e -- --config=scripts/qa/suites/web/playwright.video.config.ts <spec>
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
});
