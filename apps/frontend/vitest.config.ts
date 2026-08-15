import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      "@tatachio/shared": resolve(import.meta.dirname, "../../packages/shared/src/index.ts"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: true,
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/main.tsx", "src/App.tsx", "src/test/**", "src/**/*.test.{ts,tsx}", "src/types/**"],
      thresholds: {
        "src/components/**": { lines: 80, branches: 70 },
        "src/hooks/**": { lines: 80, branches: 70 },
      },
    },
  },
});
