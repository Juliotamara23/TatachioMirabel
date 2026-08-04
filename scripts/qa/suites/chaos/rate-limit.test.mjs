#!/usr/bin/env node
/**
 * rate-limit.test.mjs — Chaos suite: rate limiting per-role token bucket (contract-driven).
 *
 * Contract: POST /api/chat rate limits — ADMIN 60/min, CAPTAIN 20/min (from openapi.yaml)
 * 429 responses include Retry-After header.
 * Rate limiting happens BEFORE AI provider call, so 429 is deterministic regardless of AI config.
 */
import { loadSpec, getStatusCodes } from "../../lib/spec-reader.mjs";
import { runSuite, createTestHelper } from "../../lib/suite-runner.mjs";
import { loginAdmin, loginCapitana, request } from "../../lib/test-utils.mjs";

const CHAT_PATH = "/api/chat";
const CHAT_METHOD = "POST";

// Minimal valid chat request body (rate limiting triggers before AI validation)
const CHAT_BODY = {
  messages: [{ role: "user", content: "test" }],
  stream: false,
};

async function fireBurst(base, token, count) {
  const promises = [];
  for (let i = 0; i < count; i++) {
    promises.push(
      request(base, CHAT_METHOD, CHAT_PATH, { token, body: CHAT_BODY }).then((r) => ({
        status: r.status,
        retryAfter: r.data?.retryAfter ?? null,
        headers: r.headers ?? {},
      }))
    );
  }
  return Promise.all(promises);
}

async function runTests({ base }) {
  const spec = loadSpec();
  const chatStatusCodes = getStatusCodes(spec, CHAT_METHOD, CHAT_PATH);

  // Contract verification: 429 must be declared for POST /api/chat
  if (!chatStatusCodes.includes("429")) {
    throw new Error(`Contract violation: 429 not declared for ${CHAT_METHOD} ${CHAT_PATH}`);
  }

  const helper = createTestHelper("chaos/rate-limit");

  // Login both roles
  const adminToken = await loginAdmin(base);
  const capToken = await loginCapitana(base);

  // ── Test 1: Admin burst (65 requests, capacity=60) ─────────────────
  await helper.test("Admin burst — 65 requests (capacity=60) → some 429", async () => {
    const results = await fireBurst(base, adminToken, 65);
    const ok = results.filter((r) => r.status === 200 || r.status === 503).length;
    const rateLimited = results.filter((r) => r.status === 429).length;
    const other = results.filter((r) => r.status !== 200 && r.status !== 429 && r.status !== 503).length;

    // Expect: ~60 OK (200 or 503), ~5 rate-limited (429)
    // 503 is acceptable (no AI models configured) — rate limit triggers FIRST
    if (rateLimited === 0) {
      throw new Error(`Expected some 429 responses, got ${ok} ok, ${rateLimited} 429, ${other} other`);
    }
    if (ok < 55 || ok > 65) {
      throw new Error(`Unexpected OK count: ${ok} (expected ~60)`);
    }
  });

  // ── Test 2: Captain burst (25 requests, capacity=20) ───────────────
  await helper.test("Captain burst — 25 requests (capacity=20) → some 429", async () => {
    const results = await fireBurst(base, capToken, 25);
    const ok = results.filter((r) => r.status === 200 || r.status === 503).length;
    const rateLimited = results.filter((r) => r.status === 429).length;
    const other = results.filter((r) => r.status !== 200 && r.status !== 429 && r.status !== 503).length;

    if (rateLimited === 0) {
      throw new Error(`Expected some 429 responses, got ${ok} ok, ${rateLimited} 429, ${other} other`);
    }
    if (ok < 15 || ok > 25) {
      throw new Error(`Unexpected OK count: ${ok} (expected ~20)`);
    }
  });

  // ── Test 3: Retry-After header on 429 ──────────────────────────────
  await helper.test("Retry-After header present on 429 responses", async () => {
    // Fire small bursts using fetch directly to access headers
    async function burstWithHeaders(base, token, count) {
      const promises = [];
      for (let i = 0; i < count; i++) {
        promises.push(
          fetch(`${base}${CHAT_PATH}`, {
            method: CHAT_METHOD,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(CHAT_BODY),
          }).then((res) => ({
            status: res.status,
            retryAfter: res.headers.get("Retry-After"),
          }))
        );
      }
      return Promise.all(promises);
    }

    const adminResults = await burstWithHeaders(base, adminToken, 10);
    const capResults = await burstWithHeaders(base, capToken, 10);

    const admin429 = adminResults.find((r) => r.status === 429);
    const cap429 = capResults.find((r) => r.status === 429);

    if (!admin429 && !cap429) {
      throw new Error("No 429 responses to check Retry-After header");
    }

    if (admin429) {
      const retryAfter = admin429.retryAfter;
      if (retryAfter === null || retryAfter === undefined) {
        throw new Error("Admin 429 missing Retry-After header");
      }
      const retryVal = parseInt(retryAfter, 10);
      if (isNaN(retryVal) || retryVal < 1) {
        throw new Error(`Admin Retry-After invalid: ${retryAfter}`);
      }
    }

    if (cap429) {
      const retryAfter = cap429.retryAfter;
      if (retryAfter === null || retryAfter === undefined) {
        throw new Error("Captain 429 missing Retry-After header");
      }
      const retryVal = parseInt(retryAfter, 10);
      if (isNaN(retryVal) || retryVal < 1) {
        throw new Error(`Captain Retry-After invalid: ${retryAfter}`);
      }
    }
  });

  // ── Test 4: Rate limit resets after refill window ──────────────────
  await helper.test("Rate limit resets after refill window", async () => {
    // Login fresh captain for clean bucket
    const freshCapToken = await loginCapitana(base);

    // Exhaust bucket (25 requests, capacity=20)
    const exhaustResults = await fireBurst(base, freshCapToken, 25);
    const exhaustedOk = exhaustResults.filter((r) => r.status === 200 || r.status === 503).length;
    const exhausted429 = exhaustResults.filter((r) => r.status === 429).length;

    if (exhausted429 === 0) {
      throw new Error("Failed to exhaust captain bucket — no 429 received");
    }

    // Wait for refill (captain refill ~0.33/sec → wait 4s for at least 1 token)
    await new Promise((r) => setTimeout(r, 4000));

    // Try one request — should succeed (200 or 503, not 429)
    const afterWait = await request(base, CHAT_METHOD, CHAT_PATH, {
      token: freshCapToken,
      body: CHAT_BODY,
    });

    if (afterWait.status === 429) {
      throw new Error(`Rate limit did not reset after refill window: still 429`);
    }
    // 200 or 503 both mean rate limit allowed the request through
    if (afterWait.status !== 200 && afterWait.status !== 503) {
      throw new Error(`Unexpected status after refill: ${afterWait.status}`);
    }
  });

  // ── Test 5: Independent limits across users ────────────────────────
  await helper.test("Independent limits — exhausting admin doesn't block captain", async () => {
    // Fresh tokens for isolation
    const adminToken2 = await loginAdmin(base);
    const capToken2 = await loginCapitana(base);

    // Exhaust admin bucket (65 requests)
    await fireBurst(base, adminToken2, 65);

    // Captain should still have full capacity (25 requests → ~20 ok, ~5 429)
    const capResults = await fireBurst(base, capToken2, 25);
    const capOk = capResults.filter((r) => r.status === 200 || r.status === 503).length;
    const cap429 = capResults.filter((r) => r.status === 429).length;

    if (cap429 === 0) {
      throw new Error("Captain unexpectedly blocked — limits not independent");
    }
    if (capOk < 15 || capOk > 25) {
      throw new Error(`Captain OK count unexpected after admin exhausted: ${capOk} (expected ~20)`);
    }
  });

  return helper.finish();
}

// Run via shared suite runner
await runSuite(
  { name: "chaos/rate-limit", seed: true, start: true },
  runTests
);