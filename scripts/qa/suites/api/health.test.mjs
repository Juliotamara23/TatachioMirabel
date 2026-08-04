#!/usr/bin/env node
/**
 * health.test.mjs — Smoke test contract-driven.
 * Verifica que el pipeline QA funciona end-to-end: seed → server → login → endpoint.
 */
import { runSuite, createTestHelper } from "../../lib/suite-runner.mjs";
import { login, request, expectStatus } from "../../lib/test-utils.mjs";

runSuite({ name: "api/health" }, async ({ base }) => {
  const helper = createTestHelper("api/health");

  helper.test("login as admin returns token", async () => {
    const token = await login(base, "admin@tatachio.com", "admin123");
    if (!token || typeof token !== "string") throw new Error("No token returned");
  });

  helper.test("GET /api/cabildos with token returns array", async () => {
    const token = await login(base, "admin@tatachio.com", "admin123");
    const { status, data } = await request(base, "GET", "/api/cabildos", { token });
    expectStatus(status, 200);
    if (!Array.isArray(data)) throw new Error("Response is not an array");
  });

  return helper.finish();
});
