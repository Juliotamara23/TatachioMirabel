import { test, expect } from "./fixtures/admin";
import type { Page } from "@playwright/test";

/**
 * ui-polish.spec.ts — E2E coverage for the Fase 2 UI polish features (SDD
 * change `frontend-ui-polish`, task T9): column picker (COLS-1..4), inline
 * row editing with Zod validation (EDIT-1..4, EDIT-6), success toasts
 * (TOAST-1), per-cabildo xlsx export (XLSX-1..2) and KPI icon smoke (VIS-1).
 *
 * All tests run against the autonomous QA stack (backend on 3456, frontend
 * preview on 5173) using the adminPage fixture, which is already logged in
 * with the FIRST cabildo selected (see fixtures/admin.ts).
 *
 * NOTE: the inline-edit and delete tests intentionally mutate seed rows
 * (rename then delete the first member of the selected cabildo) — the QA
 * backend runs on disposable qa.db, so the mutations are harmless and other
 * specs only assert structural presence, never exact counts.
 */

const API_URL = process.env.VITE_API_BASE_URL ?? "http://localhost:3456";

/** Reads the admin token that the adminPage fixture stored in localStorage. */
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

/**
 * Mirrors the backend slugify (apps/backend/src/controllers/reporteController.ts):
 * lowercase, accents stripped, whitespace runs → "-", non-alphanumeric removed.
 * Used to derive the expected scoped xlsx filename from the live cabildo name.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
}

/**
 * Reloads the current page and waits for the members table to render, retrying
 * the reload a few times. Under parallel full-suite load the app boot can
 * transiently fail the /api/cabildos fetch; CabildoContext then stays in a
 * sticky empty ("Sin cabildos") state until the next full page load, so a
 * retry (fresh boot) recovers. The assertions after this still prove the
 * column selection persisted — a real persistence regression still fails.
 */
async function reloadUntilTableVisible(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.reload();
    const table = page.getByTestId("virtual-table");
    const visible = await table
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (visible) return;
  }
  throw new Error("members table did not render after reload (app boot failed)");
}

test.describe("Column picker", () => {
  test("toggle Profesión → header appears, persists on reload, reset restores defaults", async ({
    adminPage: page,
  }) => {
    await page.goto("/miembros");
    await expect(page.getByTestId("virtual-table")).toBeVisible();

    // COLS-1: the default column set does NOT include Profesión.
    await expect(page.getByTestId("table-header")).not.toContainText("Profesión");

    // COLS-2: open the picker and toggle the hidden Profesión column.
    await page.getByTestId("column-picker").click();
    const menu = page.getByTestId("column-picker-menu");
    await expect(menu).toBeVisible();
    await menu.getByLabel("Profesión").check();

    // The column header now renders in the shared grid header.
    await expect(page.getByTestId("table-header")).toContainText("Profesión");

    // COLS-3: the selection persists across a full reload.
    await reloadUntilTableVisible(page);
    await expect(page.getByTestId("table-header")).toContainText("Profesión");

    // COLS-4: Restaurar returns to the default 8-column set.
    await page.getByTestId("column-picker").click();
    await expect(page.getByTestId("column-picker-menu")).toBeVisible();
    await page.getByTestId("column-picker-reset").click();
    await expect(page.getByTestId("table-header")).not.toContainText("Profesión");
    await expect(page.getByTestId("column-picker-menu").getByLabel("Profesión")).not.toBeChecked();
  });
});

test.describe("Inline edit", () => {
  test("edit nombres → Guardar shows success toast and row re-renders", async ({
    adminPage: page,
  }) => {
    await page.goto("/miembros");
    await expect(page.getByTestId("virtual-table")).toBeVisible();

    // EDIT-1: the first rendered row switches into edit mode (inputs + Guardar/Cancelar).
    const row = page.getByTestId("table-row").first();
    await row.getByTestId("edit-btn").click();

    // The first input in the default column order is Nombres.
    const nombresInput = row.locator("input").first();
    await expect(nombresInput).toBeEditable();
    await nombresInput.fill("E2E NOMBRES EDITADO");

    // EDIT-3: Guardar → PATCH applied, success toast (TOAST-1 role="status"), row exits edit mode.
    // 15s timeouts: under full-suite parallel load the backend can take a few
    // seconds to answer the PUT.
    await row.getByTestId("save-btn").click();
    await expect(page.getByRole("status")).toContainText("Miembro actualizado correctamente", {
      timeout: 15_000,
    });
    await expect(page.getByTestId("save-btn")).toHaveCount(0, { timeout: 15_000 });

    // The list refetches and the row renders the new value.
    await expect(page.getByTestId("table-row").first()).toContainText("E2E NOMBRES EDITADO", {
      timeout: 15_000,
    });
  });

  test("invalid fechaNacimiento shows inline error, disables Guardar, Cancelar discards", async ({
    adminPage: page,
  }) => {
    await page.goto("/miembros");
    await expect(page.getByTestId("virtual-table")).toBeVisible();

    const row = page.getByTestId("table-row").first();
    await row.getByTestId("edit-btn").click();

    // The third input in the default column order is Fecha Nacimiento (DD/MM/YYYY).
    const fechaInput = row.locator("input").nth(2);
    await fechaInput.fill("99/99/9999");

    // EDIT-2: per-field Zod error under the cell and Guardar disabled.
    await expect(page.getByText("Fecha de nacimiento inválida")).toBeVisible();
    await expect(row.getByTestId("save-btn")).toBeDisabled();

    // EDIT-4: Cancelar discards the draft, exits edit mode, no toast, no save.
    await row.getByTestId("cancel-btn").click();
    await expect(page.getByTestId("save-btn")).toHaveCount(0);
    await expect(page.getByText("Fecha de nacimiento inválida")).toHaveCount(0);
  });
});

test.describe("Delete member", () => {
  test("ConfirmDialog confirm → member deleted and success toast shown", async ({
    adminPage: page,
  }) => {
    await page.goto("/miembros");
    await expect(page.getByTestId("virtual-table")).toBeVisible();

    // EDIT-6: delete is gated by the ConfirmDialog (no native confirm()).
    await page.getByTestId("delete-btn").first().click();
    const dialog = page.getByTestId("confirm-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByTestId("confirm-btn").click();

    await expect(page.getByRole("status")).toContainText("Miembro eliminado correctamente", {
      timeout: 15_000,
    });
    await expect(page.getByTestId("confirm-dialog")).toHaveCount(0, { timeout: 15_000 });
  });
});

test.describe("Per-cabildo xlsx export", () => {
  test.setTimeout(90_000); // the backend spawns formateador.py per request

  test("scoped download returns 200 with the cabildo slug in the filename", async ({
    adminPage: page,
  }) => {
    const token = await getToken(page);

    // The fixture selects the FIRST cabildo; resolve its name for the slug.
    const cabildosRes = await page.request.get(`${API_URL}/api/cabildos`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(cabildosRes.ok()).toBeTruthy();
    const cabildos = (await cabildosRes.json()) as Array<{ id: string; nombre: string }>;
    expect(cabildos.length).toBeGreaterThan(0);
    const cabildo = cabildos[0];

    // XLSX-2: scoped filename is censo-<slug>-<year>.xlsx.
    const expectedFilename = `censo-${slugify(cabildo.nombre)}-${new Date().getFullYear()}.xlsx`;

    const res = await page.request.get(`${API_URL}/api/reportes/censo.xlsx?cabildoId=${cabildo.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 60_000,
    });
    expect(res.status()).toBe(200);

    const disposition = res.headers()["content-disposition"] ?? "";
    expect(disposition).toContain(expectedFilename);

    // The body is a real xlsx (zip "PK" magic), not an error page.
    const bytes = await res.body();
    expect(bytes[0]).toBe(0x50); // "P"
    expect(bytes[1]).toBe(0x4b); // "K"
  });

  test("unknown cabildoId returns 404", async ({ adminPage: page }) => {
    const token = await getToken(page);
    const res = await page.request.get(
      `${API_URL}/api/reportes/censo.xlsx?cabildoId=00000000-0000-0000-0000-000000000000`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(res.status()).toBe(404);
  });

  test("export button is present in the Miembros toolbar (XLSX-4)", async ({ adminPage: page }) => {
    await page.goto("/miembros");
    await expect(page.getByTestId("export-btn")).toBeVisible();
  });
});

test.describe("Dashboard visual smoke", () => {
  test("KPI cards render with icon chips (VIS-1)", async ({ adminPage: page }) => {
    await page.goto("/dashboard");
    const kpiCard = page.getByTestId("kpi-card").first();
    await expect(kpiCard).toBeVisible();
    await expect(kpiCard.getByTestId("kpi-icon")).toBeVisible();
  });
});
