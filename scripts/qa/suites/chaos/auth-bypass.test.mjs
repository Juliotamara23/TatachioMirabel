#!/usr/bin/env node
import { createHmac } from "node:crypto";
import { runSuite, createTestHelper } from "../../lib/suite-runner.mjs";
import { loadSpec, getStatusCodes } from "../../lib/spec-reader.mjs";
import { request, expectStatus, loginAdmin } from "../../lib/test-utils.mjs";

const spec = loadSpec();
const statusCodes = getStatusCodes(spec, "get", "/api/cabildos");
const expectedUnauthorized = statusCodes.includes("401");

const SA_QA_SECRET = "qa-secret";
const SA_WRONG_SECRET = "wrong-secret-key";

function base64url(str) {
  return Buffer.from(str).toString("base64url");
}

function base64urlDecode(str) {
  return Buffer.from(str, "base64url").toString("utf-8");
}

function signHS256(headerB64, payloadB64, secret) {
  const data = `${headerB64}.${payloadB64}`;
  return createHmac("sha256", secret).update(data).digest("base64url");
}

async function main() {
  const results = await runSuite(
    { name: "chaos/auth-bypass", seed: true, start: true },
    async ({ base }) => {
      const helper = createTestHelper("chaos/auth-bypass");

      if (!expectedUnauthorized) {
        helper.addFailure(
          "Contract check",
          new Error("Spec does not define 401 for GET /api/cabildos")
        );
        return helper.finish();
      }

      // Get a valid token for tampering tests
      let validToken;
      try {
        validToken = await loginAdmin(base);
      } catch (error) {
        helper.addFailure(
          "Setup: loginAdmin",
          new Error(`Failed to obtain valid token: ${error.message}`)
        );
        return helper.finish();
      }

      const PROTECTED = "/api/cabildos";

      // ── Chaos auth-bypass attempts ──

      await helper.test("No Authorization header → 401", async () => {
        const { status } = await request(base, "GET", PROTECTED, {});
        expectStatus(status, 401, "No Authorization header");
      });

      await helper.test('"Bearer" with no token → 401', async () => {
        const { status } = await request(base, "GET", PROTECTED, {
          headers: { Authorization: "Bearer" },
        });
        expectStatus(status, 401, 'Bearer with no token');
      });

      await helper.test('"Bearer invalidtoken" → 401', async () => {
        const { status } = await request(base, "GET", PROTECTED, {
          headers: { Authorization: "Bearer invalidtoken" },
        });
        expectStatus(status, 401, 'Bearer invalidtoken');
      });

      await helper.test("Tampered JWT (changed payload, kept signature) → 401", async () => {
        const parts = validToken.split(".");
        const headerB64 = parts[0];
        const payloadB64 = parts[1];
        const signature = parts[2];

        const payload = JSON.parse(base64urlDecode(payloadB64));
        payload.rol = "ADMINISTRATOR";
        payload.id = "00000000-0000-0000-0000-000000000001";
        const tamperedPayloadB64 = base64url(JSON.stringify(payload));

        const tamperedToken = `${headerB64}.${tamperedPayloadB64}.${signature}`;

        const { status } = await request(base, "GET", PROTECTED, {
          headers: { Authorization: `Bearer ${tamperedToken}` },
        });
        expectStatus(status, 401, "Tampered JWT");
      });

      await helper.test("Expired token → 401", async () => {
        const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
        const payload = base64url(JSON.stringify({
          id: "00000000-0000-0000-0000-000000000001",
          rol: "ADMINISTRATOR",
          cabildoId: null,
          exp: Math.floor(Date.now() / 1000) - 7200,
          iat: Math.floor(Date.now() / 1000) - 10800,
        }));
        const sig = signHS256(header, payload, SA_QA_SECRET);
        const expiredToken = `${header}.${payload}.${sig}`;

        const { status } = await request(base, "GET", PROTECTED, {
          headers: { Authorization: `Bearer ${expiredToken}` },
        });
        expectStatus(status, 401, "Expired token");
      });

      await helper.test('Token signed with alg "none" → 401', async () => {
        const header = base64url(JSON.stringify({ alg: "none", typ: "JWT" }));
        const payload = base64url(JSON.stringify({
          id: "00000000-0000-0000-0000-000000000001",
          rol: "ADMINISTRATOR",
          cabildoId: null,
        }));
        const noneToken = `${header}.${payload}.`;

        const { status } = await request(base, "GET", PROTECTED, {
          headers: { Authorization: `Bearer ${noneToken}` },
        });
        expectStatus(status, 401, 'alg "none" token');
      });

      await helper.test('Authorization: "Basic ..." → 401', async () => {
        const { status } = await request(base, "GET", PROTECTED, {
          headers: { Authorization: "Basic YWRtaW46YWRtaW4xMjM=" },
        });
        expectStatus(status, 401, 'Basic auth scheme');
      });

      await helper.test("Token signed with different secret → 401", async () => {
        const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
        const payload = base64url(JSON.stringify({
          id: "00000000-0000-0000-0000-000000000001",
          rol: "ADMINISTRATOR",
          cabildoId: null,
        }));
        const sig = signHS256(header, payload, SA_WRONG_SECRET);
        const wrongSecretToken = `${header}.${payload}.${sig}`;

        const { status } = await request(base, "GET", PROTECTED, {
          headers: { Authorization: `Bearer ${wrongSecretToken}` },
        });
        expectStatus(status, 401, "Wrong secret token");
      });

      await helper.test("Empty Authorization header → 401", async () => {
        const { status } = await request(base, "GET", PROTECTED, {
          headers: { Authorization: "" },
        });
        expectStatus(status, 401, "Empty Authorization header");
      });

      return helper.finish();
    }
  );

  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Chaos auth-bypass suite failed:", error.message);
  console.error(error.stack);
  process.exit(1);
});