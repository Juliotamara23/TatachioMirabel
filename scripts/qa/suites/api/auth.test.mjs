import { loadSpec, getStatusCodes } from "../../lib/spec-reader.mjs";
import { runSuite, createTestHelper } from "../../lib/suite-runner.mjs";
import { login, loginAdmin, request, expectStatus } from "../../lib/test-utils.mjs";

const spec = loadSpec();

runSuite({ name: "api/auth" }, async ({ base }) => {
  const helper = createTestHelper("api/auth");

  // ── POST /api/auth/login ──────────────────────────────────────────────────
  const loginCodes = getStatusCodes(spec, "post", "/api/auth/login");
  const loginSuccess = loginCodes.includes("200") ? 200 : loginCodes[0];
  const loginBadRequest = loginCodes.includes("400") ? 400 : null;
  const loginUnauthorized = loginCodes.includes("401") ? 401 : null;
  const loginForbidden = loginCodes.includes("403") ? 403 : null;

  helper.test("login with valid admin credentials", async () => {
    const token = await loginAdmin(base);
    expectStatus(token ? 200 : 500, loginSuccess, "login admin");
  });

  helper.test("login with valid capitana credentials", async () => {
    const token = await login(base, "capitana@tatachio.com", "cap123");
    expectStatus(token ? 200 : 500, loginSuccess, "login capitana");
  });

  if (loginUnauthorized) {
    helper.test("login with invalid password returns 401", async () => {
      const { status } = await request(base, "POST", "/api/auth/login", {
        body: { email: "admin@tatachio.com", password: "wrongpassword" },
      });
      expectStatus(status, loginUnauthorized, "invalid password");
    });

    helper.test("login with non-existent email returns 401", async () => {
      const { status } = await request(base, "POST", "/api/auth/login", {
        body: { email: "noexiste@tatachio.com", password: "admin123" },
      });
      expectStatus(status, loginUnauthorized, "non-existent email");
    });
  }

  if (loginBadRequest) {
    helper.test("login with missing fields returns 400", async () => {
      const { status } = await request(base, "POST", "/api/auth/login", {
        body: { email: "admin@tatachio.com" },
      });
      expectStatus(status, loginBadRequest, "missing fields");
    });
  }

  // ── POST /api/auth/register ───────────────────────────────────────────────
  const registerCodes = getStatusCodes(spec, "post", "/api/auth/register");
  const registerCreated = registerCodes.includes("201") ? 201 : registerCodes[0];
  const registerBadRequest = registerCodes.includes("400") ? 400 : null;
  const registerServerError = registerCodes.includes("500") ? 500 : null;

  helper.test("register a new admin user returns 201", async () => {
    const { status, data } = await request(base, "POST", "/api/auth/register", {
      body: {
        email: "nuevo-admin@tatachio.com",
        password: "Pass123!",
        nombre: "NUEVO ADMIN",
        rol: "ADMINISTRATOR",
      },
    });
    expectStatus(status, registerCreated, "register admin");
    if (!data.id) throw new Error("Response missing user id");
    if (data.email !== "nuevo-admin@tatachio.com") throw new Error(`Unexpected email: ${data.email}`);
    if (data.rol !== "ADMINISTRATOR") throw new Error(`Unexpected rol: ${data.rol}`);
    if (data.passwordHash) throw new Error("Response leaked passwordHash");
  });

  helper.test("register a new captain user returns 201", async () => {
    const cabildoId = "5dee2149-4442-486a-9ec5-3c20479d8261";
    const { status, data } = await request(base, "POST", "/api/auth/register", {
      body: {
        email: "nueva-capitana@tatachio.com",
        password: "Pass123!",
        nombre: "NUEVA CAPITANA",
        rol: "CAPTAIN",
        cabildoId,
      },
    });
    expectStatus(status, registerCreated, "register captain");
    if (data.rol !== "CAPTAIN") throw new Error(`Unexpected rol: ${data.rol}`);
    if (data.passwordHash) throw new Error("Response leaked passwordHash");
  });

  if (registerBadRequest) {
    helper.test("register captain without cabildoId returns 400", async () => {
      const { status } = await request(base, "POST", "/api/auth/register", {
        body: {
          email: "capitan-sin-cabildo@tatachio.com",
          password: "Pass123!",
          nombre: "CAPITAN SIN CABILDO",
          rol: "CAPTAIN",
        },
      });
      expectStatus(status, registerBadRequest, "captain without cabildoId");
    });

    helper.test("register with duplicate email returns 400", async () => {
      const { status } = await request(base, "POST", "/api/auth/register", {
        body: {
          email: "admin@tatachio.com",
          password: "Admin123!",
          nombre: "DUPLICADO",
          rol: "ADMINISTRATOR",
        },
      });
      expectStatus(status, registerBadRequest, "duplicate email");
    });

    helper.test("register with missing fields returns 400", async () => {
      const { status } = await request(base, "POST", "/api/auth/register", {
        body: { email: "missing-fields@tatachio.com" },
      });
      expectStatus(status, registerBadRequest, "missing fields");
    });
  }

  // ── GET /api/models ───────────────────────────────────────────────────────
  const modelsCodes = getStatusCodes(spec, "get", "/api/models");
  const modelsSuccess = modelsCodes.includes("200") ? 200 : modelsCodes[0];
  const modelsUnauthorized = modelsCodes.includes("401") ? 401 : null;

  let adminToken;
  {
    const res = await request(base, "POST", "/api/auth/login", {
      body: { email: "admin@tatachio.com", password: "admin123" },
    });
    adminToken = res.data.token;
  }

  if (modelsSuccess) {
    helper.test("get models with valid token returns 200", async () => {
      const { status, data } = await request(base, "GET", "/api/models", {
        token: adminToken,
      });
      expectStatus(status, modelsSuccess, "get models with token");
      if (!data.models || !Array.isArray(data.models)) throw new Error("Response missing models array");
      if (!data.defaults || typeof data.defaults !== "object") throw new Error("Response missing defaults object");
    });
  }

  if (modelsUnauthorized) {
    helper.test("get models without token returns 401", async () => {
      const { status } = await request(base, "GET", "/api/models");
      expectStatus(status, modelsUnauthorized, "no token");
    });

    helper.test("get models with invalid token returns 401", async () => {
      const { status } = await request(base, "GET", "/api/models", {
        token: "invalid.token.here",
      });
      expectStatus(status, modelsUnauthorized, "invalid token");
    });

    helper.test("get models with malformed auth header returns 401", async () => {
      const { status } = await request(base, "GET", "/api/models", {
        headers: { Authorization: "Basic xyz" },
      });
      expectStatus(status, modelsUnauthorized, "malformed auth header");
    });
  }

  return helper.finish();
});