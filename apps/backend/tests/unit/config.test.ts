import { afterEach, describe, expect, it, vi } from "vitest";

import { validateConfig } from "../../src/config.js";

const FAIL_FAST_MESSAGE =
  "[auth] JWT_SECRET is not set. Refusing to start. Configure it in .env (see .env.example).";

describe("config.validateConfig (issue #47)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws when JWT_SECRET is unset", () => {
    // vitest.config injects JWT_SECRET, so it must be overridden for the
    // negative case.
    vi.stubEnv("JWT_SECRET", "");

    expect(() => validateConfig()).toThrow(FAIL_FAST_MESSAGE);
  });

  it("does not throw when JWT_SECRET is set", () => {
    vi.stubEnv("JWT_SECRET", "test-secret");

    expect(() => validateConfig()).not.toThrow();
  });
});
