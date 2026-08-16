import { test, expect } from "./fixtures/admin";
import type { Page } from "@playwright/test";

/**
 * HUMAN-PACED DEMO — a single continuous E2E run recorded to ONE video.
 *
 * Goal: let a human WATCH the whole app flow in one take (previously each
 * per-test video was ~1 second long — useless for viewing).
 *
 * Run (from repo root):
 *   pnpm --filter frontend exec playwright test \
 *     --config=../../scripts/qa/suites/web/playwright.video.config.ts demo.spec.ts \
 *     --reporter=line
 *
 * The video config forces workers: 1 + video: "on", so this single test
 * produces one .webm in /mnt/e/MediaProyects/web-e2e-demo/.
 *
 * Pacing: every meaningful action is followed by an explicit pause so the
 * viewer can actually see typing, navigation, data and toggles. The whole
 * flow intentionally runs ~1.5-2 minutes of realtime, watchable video.
 *
 * NOTE ON RECORDING FIDELITY: verified empirically that this environment's
 * Chromium compositor drops video frames while a page is fully static. The
 * tiny invisible opacity animation injected at the start (keepVideoFramesAlive)
 * keeps the compositor emitting frames, so pauses are captured at realtime
 * (probes: static pages ~80-90% capture, with keepalive ~99-100%).
 */

// Demo pacing (milliseconds) — explicit human-viewing time between steps.
const PAUSE_SHORT = 3500;
const PAUSE_MEDIUM = 4500;
const PAUSE_LONG = 5500;

/**
 * The headless/headed compositor in this environment stops producing video
 * frames while the page is fully static, which would collapse the pauses.
 * A tiny, invisible opacity animation keeps the compositor emitting frames
 * so the pauses are actually visible on the recording. The element is 1px,
 * pointer-events: none, and survives SPA route changes (injected on body).
 */
async function keepVideoFramesAlive(page: Page) {
  await page.evaluate(() => {
    const style = document.createElement("style");
    style.id = "demo-video-keepalive-style";
    style.textContent = `
      @keyframes demo-video-keepalive { from { opacity: 0.99; } to { opacity: 1; } }
      #demo-video-keepalive {
        position: fixed; left: 0; top: 0; width: 1px; height: 1px;
        pointer-events: none; opacity: 0.99;
        animation: demo-video-keepalive 0.3s linear infinite;
      }
    `;
    document.head.appendChild(style);
    const el = document.createElement("div");
    el.id = "demo-video-keepalive";
    document.body.appendChild(el);
  });
}

test.describe("Demo — full app walkthrough", () => {
  // The base config caps a test at 30s; this demo intentionally runs
  // ~2 minutes of visible flow (plus webserver startup/teardown).
  test.setTimeout(300_000);

  test("login, cabildo selection, modules, theme, logout, error handling", async ({ page }) => {
    // ---------------------------------------------------------------------
    // Step 1 — REAL form login (the viewer sees actual typing in the video).
    // ---------------------------------------------------------------------
    await page.goto("/login");
    await keepVideoFramesAlive(page); // keep the whole recording at realtime pace
    // Pre-roll: give the video recorder (ffmpeg launch, first frame) time to
    // become ready before the first visible action. Measured recorder start
    // latency varies 0-10s in this environment; the viewer just sees the
    // login card for a moment, which is a natural opening shot.
    await page.waitForTimeout(8000);
    await page.waitForTimeout(800); // let the login card paint first

    await page.getByTestId("login-email").pressSequentially("admin@tatachio.com", { delay: 120 });
    await page.getByTestId("login-password").pressSequentially("admin123", { delay: 120 });
    await page.waitForTimeout(600); // let the viewer register the filled form

    await page.getByTestId("login-submit").click();

    // REAL assertion: login succeeds and redirects to the dashboard.
    await expect(page).toHaveURL("/dashboard", { timeout: 15_000 });
    await page.waitForTimeout(PAUSE_MEDIUM);

    // ---------------------------------------------------------------------
    // Step 2 — Cabildo selection (reveals the KPIs).
    // After a FORM login no cabildo is preselected, so the dashboard shows
    // the placeholder until the user picks one from the topbar dropdown.
    // ---------------------------------------------------------------------
    const selector = page.getByTestId("cabildo-selector");
    await expect(selector).toBeVisible({ timeout: 15_000 });

    // Wait until CabildoContext hydrates the list from GET /api/cabildos.
    await expect
      .poll(
        () => selector.locator("option").evaluateAll((opts) => opts.some((o) => o.value !== "")),
        { timeout: 15_000 },
      )
      .toBe(true);

    // Prefer TATACHIO MIRABEL (first cabildo in the seed); fall back to any
    // non-empty option so the demo never hard-fails on seed changes.
    const options = await selector.locator("option").evaluateAll((opts) =>
      opts.map((o) => ({ value: o.value, label: (o.textContent ?? "").trim() })),
    );
    const pick =
      options.find((o) => o.label === "TATACHIO MIRABEL") ?? options.find((o) => o.value !== "");

    await selector.selectOption({ value: pick!.value });
    await page.waitForTimeout(PAUSE_SHORT); // dashboard fetches + renders

    // REAL assertion: cabildo selection effect — KPI cards appear.
    await expect(page.getByTestId("kpi-card").first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(PAUSE_MEDIUM);

    // ---------------------------------------------------------------------
    // Step 3 — Dashboard pause (KPIs + alert cards stay on screen).
    // ---------------------------------------------------------------------
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    await page.waitForTimeout(PAUSE_SHORT);
    await expect(page.getByTestId("kpi-card").first()).toBeVisible();
    await page.waitForTimeout(PAUSE_LONG);

    // ---------------------------------------------------------------------
    // Step 4 — Miembros (virtual table or empty state).
    // ---------------------------------------------------------------------
    await page.waitForTimeout(600); // show the sidebar before navigating
    await page.getByRole("link", { name: "Miembros" }).click();
    const miembrosTable = page.getByTestId("virtual-table").or(page.getByText(/sin datos|no hay/i));
    await expect(miembrosTable).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(PAUSE_LONG);

    // ---------------------------------------------------------------------
    // Step 5 — Familias (virtual table or empty state).
    // ---------------------------------------------------------------------
    await page.waitForTimeout(600); // show the sidebar before navigating
    await page.getByRole("link", { name: "Familias" }).click();
    const familiasTable = page.getByTestId("virtual-table").or(page.getByText(/sin datos|no hay/i));
    await expect(familiasTable).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(PAUSE_MEDIUM);

    // ---------------------------------------------------------------------
    // Step 6 — Cabildos (admin module listing).
    // ---------------------------------------------------------------------
    await page.waitForTimeout(600); // show the sidebar before navigating
    await page.getByRole("link", { name: "Cabildos" }).click();
    await expect(page.getByRole("heading", { name: "Cabildos", exact: true })).toBeVisible();
    await page.waitForTimeout(PAUSE_MEDIUM);

    // ---------------------------------------------------------------------
    // Step 7 — Capitanas (AdminRoute). Hover an unassign button if present,
    // but never click destructive actions.
    // ---------------------------------------------------------------------
    await page.waitForTimeout(600); // show the sidebar before navigating
    await page.getByRole("link", { name: "Capitanas" }).click();
    await expect(page.getByRole("heading", { name: "Capitanas", exact: true })).toBeVisible();
    await page.waitForTimeout(PAUSE_MEDIUM);

    const unassignButtons = page.getByTestId(/^unassign-btn-/);
    if ((await unassignButtons.count()) > 0) {
      await unassignButtons.first().hover();
      await page.waitForTimeout(1500); // show the hover state on video
    }

    // ---------------------------------------------------------------------
    // Step 8 — Chat: type a visible message, do NOT send (no AI provider
    // needed — the demo just shows typing).
    // ---------------------------------------------------------------------
    await page.waitForTimeout(600); // show the sidebar before navigating
    await page.getByRole("link", { name: "Chat" }).click();
    await expect(page.getByTestId("chat-input")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("chat-input").pressSequentially("Hola, ¿cómo estás?", { delay: 120 });
    await expect(page.getByTestId("chat-input")).toHaveValue("Hola, ¿cómo estás?");
    await page.waitForTimeout(PAUSE_SHORT);
    await page.waitForTimeout(PAUSE_MEDIUM);

    // ---------------------------------------------------------------------
    // Step 9 — Reportes (admin-only). Hover the download button only, to
    // avoid file-save dialogs interrupting the video.
    // ---------------------------------------------------------------------
    await page.waitForTimeout(600); // show the sidebar before navigating
    await page.getByRole("link", { name: "Reportes" }).click();
    const censoBtn = page.getByTestId("censo-download-btn");
    await expect(censoBtn).toBeVisible({ timeout: 15_000 });
    await censoBtn.hover();
    await page.waitForTimeout(PAUSE_MEDIUM);

    // ---------------------------------------------------------------------
    // Step 10 — Dark mode toggle (topbar): dark, then back to light.
    // ---------------------------------------------------------------------
    await page.getByTestId("theme-toggle").click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.waitForTimeout(PAUSE_MEDIUM);
    await page.getByTestId("theme-toggle").click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await page.waitForTimeout(PAUSE_SHORT);

    // ---------------------------------------------------------------------
    // Step 11 — Logout (REAL assertion: redirect back to /login).
    // ---------------------------------------------------------------------
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL("/login", { timeout: 15_000 });
    await page.waitForTimeout(PAUSE_MEDIUM);

    // ---------------------------------------------------------------------
    // Step 12 — Bonus chaos: wrong credentials show the 401 error in real
    // time (role="alert" with the invalid-credentials message).
    // ---------------------------------------------------------------------
    await page.getByTestId("login-email").pressSequentially("bad@test.com", { delay: 90 });
    await page.getByTestId("login-password").pressSequentially("wrong", { delay: 90 });
    await page.getByTestId("login-submit").click();

    await expect(page.getByRole("alert")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("alert")).toContainText(/credenciales|inválidas|error/i);
    await page.waitForTimeout(PAUSE_LONG);

    // The demo is over — the viewer saw the full loop: login → cabildo →
    // modules → theme → logout → error handling, all in ONE video.
  });
});
