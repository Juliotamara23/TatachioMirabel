import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
    },
    testTimeout: 10000,
    // All integration test files write/clear the SAME real config file
    // (~/.tatachio/config.json) in beforeEach/afterEach. Running files in
    // parallel makes one file's clearConfig() (unlink) race another file's
    // resolveToken() read, so commands exit 1 instead of reaching the mocked
    // API. Serialize files to keep the shared config stable per file.
    fileParallelism: false,
  },
});