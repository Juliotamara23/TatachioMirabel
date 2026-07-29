import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { apiFetch } from "../../src/api/client.js";

describe("api client — apiFetch", () => {
  const BASE_URL = "http://localhost:9999";
  let mockServer: ReturnType<typeof setupServer>;

  beforeEach(() => {
    mockServer = setupServer(
      // Auth-free endpoint (login)
      http.post(`${BASE_URL}/api/auth/login`, async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        if (body.email === "admin@test.com" && body.password === "secret") {
          return HttpResponse.json({ token: "jwt-token", user: { id: "u1", email: "admin@test.com", nombre: "Admin", rol: "ADMIN" } });
        }
        return HttpResponse.json({ error: "Invalid credentials" }, { status: 401 });
      }),
      // Authenticated endpoint — miembros list
      http.get(`${BASE_URL}/api/miembros`, ({ request }) => {
        const auth = request.headers.get("Authorization");
        if (auth !== "Bearer valid-jwt") {
          return HttpResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        return HttpResponse.json([{ id: "m1", nombres: "Juan" }]);
      }),
      // Server error
      http.get(`${BASE_URL}/api/crash", () => {
        return HttpResponse.json({ error: "Internal" }, { status: 500 });
      })
    );
    mockServer.listen();
  });

  afterEach(() => {
    mockServer.resetHandlers();
    mockServer.close();
  });

  it("prefixes base URL", async () => {
    const result = await apiFetch("/miembros", { baseUrl: BASE_URL, token: "valid-jwt" });
    expect(Array.isArray(result)).toBe(true);
  });

  it("attaches Authorization header", async () => {
    const result = await apiFetch("/miembros", { baseUrl: BASE_URL, token: "valid-jwt" });
    expect(Array.isArray(result)).toBe(true);
  });

  it("throws ApiError on 401 with status=1", async () => {
    await expect(
      apiFetch("/miembros", { baseUrl: BASE_URL, token: "bad-token" }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("throws ApiError on 5xx with status=500", async () => {
    await expect(
      apiFetch("/crash", { baseUrl: BASE_URL, token: "valid-jwt" }),
    ).rejects.toMatchObject({ status: 500 });
  });

  it("adds Content-Type: application/json by default for POST", async () => {
    let capturedHeaders: HeadersInit | undefined;
    const echoServer = setupServer(
      http.post(`${BASE_URL}/api/echo", async ({ request }) => {
        capturedHeaders = Object.fromEntries(request.headers.entries());
        return HttpResponse.json({ ok: true });
      })
    );
    echoServer.listen();
    await apiFetch("/echo", { method: "POST", baseUrl: BASE_URL, token: "valid-jwt", body: { x: 1 } });
    echoServer.close();
    expect(capturedHeaders?.["content-type"]).toContain("application/json");
  });
});
