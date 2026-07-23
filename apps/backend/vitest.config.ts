import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Test files location
    include: ["tests/**/*.test.ts"],
    // Exclude manual scripts
    exclude: ["tests/connectivity.test.ts", "tests/integration.test.ts"],

    // Environment
    env: {
      DATABASE_URL: "file:./test.db",
      JWT_SECRET: "test-secret",
    },

    // Global setup runs once before all tests
    globalSetup: ["tests/setup.ts"],

    // Timeout for integration tests
    testTimeout: 15000,
  },
});
