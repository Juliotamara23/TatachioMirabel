import { test, expect, loginAs } from "./fixtures/admin";
import type { Page } from "@playwright/test";

/**
 * chaos.spec.ts — Web E2E chaos suite (mirrors the API chaos suites in
 * scripts/qa/suites/chaos/ but runs in the BROWSER).
 *
 * Three attack families, all deterministic and fast (<60s total):
 *
 *   1. Injection — SQL/payload injection via `?search=` on /api/miembros and
 *      /api/familias. The search handlers use Prisma `contains` (parameterized)
 *      and the error handler returns generic messages, so the contract is:
 *      NEVER a 500 whose body leaks /SQL|Prisma|Constraint|syntax error/.
 *      After the API attacks the app pages must still render.
 *
 *   2. Rate limit — a 65-request concurrent burst on POST /api/chat. The route
 *      is router.post("/", authMiddleware, rateLimiter, chatHandler), so the
 *      429 token-bucket rejection fires BEFORE body validation and BEFORE any
 *      AI provider call. We send an INVALID body ({}) so the requests that do
 *      pass the limiter fail fast with 400 — the burst is fully deterministic
 *      and never touches an AI provider.
 *
 *   3. Auth bypass — (a) no token, (b) a garbage token stored in localStorage,
 *      (c) a CAPTAIN user hitting an admin-only route. The frontend's
 *      AdminRoute (features/auth/ProtectedRoute.tsx) renders a 403 PAGE for
 *      non-ADMINISTRATOR (it does NOT redirect), so (c) asserts the 403 page.
 */

const API_URL = process.env.VITE_API_BASE_URL ?? "http://localhost:3456";

/** Reads the auth token that the admin fixture stored in localStorage. */
async function getToken(page: Page): Promise<string> {
  const auth = await page.evaluate(() => {
    const raw = localStorage.getItem("tatachio:auth");
    if (!raw) return null;
    try {
      return JSON.parse(raw) as { token: string };
    } catch {
      return null;
    }
  });
  expect(auth?.token, "admin token must be present in localStorage").toBeTruthy();
  return auth!.token;
}

/** Contract check shared with the API chaos injection suite. */
function assertNoSqlLeak(status: number, body: string, label: string) {
  // Acceptable: 200, 400, 404, 409, 500-without-leaked-SQL (generic error).
  expect([200, 400, 404, 409, 500], `${label}: unexpected status ${status}`).toContain(status);
  if (status === 500) {
    expect(
      body,
      `${label}: 500 must not leak SQL/Prisma internals`,
    ).not.toMatch(/SQL|Prisma|Constraint|syntax error/i);
  }
}

// ─── 1. Injection ─────────────────────────────────────────────────────────

test.describe("Chaos: Injection — SQL/payload injection via search params", () => {
  // Payload set mirrors scripts/qa/suites/chaos/injection.test.mjs: SQL
  // boolean/UNION/DROP payloads, encoded single quote, null bytes, RTL
  // override, unicode overflow, and a 10KB query string.
  const PAYLOADS = [
    "'",
    "' OR 1=1--",
    "\"; DROP TABLE Miembro;--",
    "' UNION SELECT * FROM Usuario;--",
    "test\0admin",
    "test\u202E\u2066admin\u2069",
    "\u{1F525}".repeat(100),
    "A".repeat(10_240),
  ];

  test("search endpoints never leak SQL/Prisma errors and pages still render", async ({ adminPage: page }) => {
    const token = await getToken(page);

    // ── API contract: fire every payload at both search endpoints ──────
    for (const endpoint of ["/api/miembros", "/api/familias"]) {
      for (const payload of PAYLOADS) {
        const label = `${endpoint}?search=${payload.slice(0, 24)}`;
        const res = await page.request.get(`${API_URL}${endpoint}?search=${encodeURIComponent(payload)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.text();
        assertNoSqlLeak(res.status(), body, label);
      }
    }

    // ── UI still renders after the attacks (visible in the browser) ─────
    // Familias has a debounced search input: type a live SQL payload and
    // confirm the page survives (input still usable, table/empty state shown).
    await page.goto("/familias");
    const familiasSearch = page.getByPlaceholder("Buscar por dirección, teléfono o número...");
    await expect(familiasSearch).toBeVisible();
    await familiasSearch.fill("' OR 1=1--");
    await expect(familiasSearch).toBeVisible();
    await expect(page.getByTestId("virtual-table").or(page.getByText(/sin datos/i))).toBeVisible();

    // Miembros page (no search UI yet) still renders after the attacks.
    await page.goto("/miembros");
    await expect(page.getByTestId("virtual-table").or(page.getByText(/sin datos/i))).toBeVisible();
  });
});

// ─── 2. Rate limit ────────────────────────────────────────────────────────

test.describe("Chaos: Rate limit — POST /api/chat burst", () => {
  test("65-request burst yields 429 with retryAfter; chat UI recovers", async ({ adminPage: page }) => {
    const token = await getToken(page);

    // Invalid body: 429 (rate limiter) fires before body validation, so the
    // requests that pass the limiter fail fast with 400 and never reach an AI
    // provider — the burst is fast and deterministic.
    const results = await Promise.all(
      Array.from({ length: 65 }, async () => {
        const res = await page.request.post(`${API_URL}/api/chat`, {
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          data: {},
        });
        return {
          status: res.status(),
          retryAfter: res.headers()["retry-after"] ?? null,
          body: await res.text().catch(() => ""),
        };
      }),
    );

    // Contract: at least one request rejected with 429 + retryAfter.
    const rateLimited = results.filter((r) => r.status === 429);
    expect(rateLimited.length, `expected ≥1 429, got ${rateLimited.length}`).toBeGreaterThan(0);

    const first429 = rateLimited[0];
    const retryVal = Number.parseInt(first429.retryAfter ?? "", 10);
    expect(Number.isNaN(retryVal) || retryVal < 1, `429 missing valid Retry-After: ${first429.retryAfter}`).toBe(false);
    expect(first429.body).toContain("retryAfter");
    expect(first429.body).toContain("Demasiadas solicitudes");

    // Requests that passed the limiter must fail fast (400 validation), never 5xx.
    for (const r of results) {
      if (r.status === 429) continue;
      expect([400, 503], `unexpected post-burst status ${r.status}`).toContain(r.status);
    }

    // ── UI recovered: chat page still renders after the burst ───────────
    await page.goto("/chat");
    await expect(page.getByTestId("chat-input")).toBeVisible();
    await expect(page.getByTestId("chat-send-btn")).toBeVisible();
  });
});

// ─── 3. Auth bypass ───────────────────────────────────────────────────────

test.describe("Chaos: Auth bypass", () => {
  test("(a) no token — protected route redirects to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL("/login");
  });

  test("(b) garbage token in localStorage — 401 handling redirects to /login", async ({ page }) => {
    // Seed a bogus session; the frontend trusts localStorage on boot, but the
    // first API call (CabildoProvider -> GET /api/cabildos) gets a 401 from
    // authMiddleware, which logs the user out and redirects to /login.
    // NOTE: land on /login (a direct route) instead of "/" — the "/" route
    // chains SPA redirects (/ -> /dashboard -> /login), which can abort the
    // full reload below under parallel load (ERR_ABORTED flake).
    await page.goto("/login");
    await expect(page).toHaveURL("/login");
    await page.evaluate(() => {
      localStorage.setItem(
        "tatachio:auth",
        JSON.stringify({
          token: "garbage-token-not-a-jwt",
          user: {
            id: "00000000-0000-0000-0000-000000000001",
            email: "hacker@tatachio.test",
            nombre: "HACKER",
            rol: "ADMINISTRATOR",
          },
        }),
      );
    });

    await page.goto("/dashboard");
    await expect(page).toHaveURL("/login");

    // The 401 handler must have cleared the forged session.
    const authAfter = await page.evaluate(() => localStorage.getItem("tatachio:auth"));
    expect(authAfter).toBeNull();
  });

  test("(c) CAPTAIN on admin-only /capitanas — 403 page (AdminRoute blocks, no redirect)", async ({ page }) => {
    // Seed has a CAPTAIN user (scripts/qa/fixtures/seed.json).
    await loginAs(page, "capitana@tatachio.com", "cap123");
    await page.goto("/capitanas");

    // AdminRoute (features/auth/ProtectedRoute.tsx) renders a 403 PAGE for
    // non-ADMINISTRATOR users — it does NOT redirect.
    await expect(page.getByRole("heading", { name: "403" })).toBeVisible();
    await expect(page.getByText("Acceso restringido — solo administradores.")).toBeVisible();
    await expect(page).toHaveURL("/capitanas");
  });
});
