import { test, expect } from "./fixtures/admin";
import type { Page } from "@playwright/test";

/**
 * demo-crud.spec.ts — FULL admin CRUD workflow recorded to ONE video, running
 * against the QA stack with a MOCKED LLM (start-web-backend-mock.mjs wires
 * the backend to the OpenAI-compatible mock on 3457 — zero token cost, no
 * real API keys).
 *
 * Flow shown in the video:
 *   1. Register a captain (CAPTAINS-1 form) → success toast + list refresh
 *   2. Create a member via the MiembroForm modal → form closes, row visible
 *   3. Inline-edit the created member (EDIT-1..3) → success toast + re-render
 *   4. Export the per-cabildo Excel (XLSX-1/4) → success toast + verified file
 *   5. Chat with the mocked AI → deterministic tool-call answer streams in
 *
 * Run (from repo root):
 *   pnpm --filter frontend exec playwright test \
 *     --config=../../scripts/qa/suites/web/playwright.crud-video.config.ts \
 *     demo-crud.spec.ts --reporter=line
 *
 * The crud-video config forces workers: 1 + video: "on", so this single test
 * produces one .webm in /mnt/e/MediaProyects/web-e2e-demo/.
 *
 * NOTES ON ADAPTATION (verified against the real source, no app changes):
 * - The seed actually holds 1000 members (562 in TATACHIO MIRABEL), so the
 *   members table is virtualized and the NEW member (last row, insertion
 *   order) is NOT in the DOM until the table is scrolled to the bottom — the
 *   spec scrolls before asserting, and ALSO asserts via the API (?search=).
 * - MiembroForm does NOT fire a "Miembro creado correctamente" toast (only
 *   update/export/register do) — creation is proven by the form closing and
 *   the row appearing (DOM + API), not by a toast.
 * - familiaId is REQUIRED (z.string().uuid()) in @tatachio/shared, so the spec
 *   fills the first familia of the selected cabildo from GET /api/familias.
 */

const API_URL = process.env.VITE_API_BASE_URL ?? "http://localhost:3456";

// Demo pacing (milliseconds) — human-viewing time between steps.
const PAUSE_SHORT = 1800;
const PAUSE_AFTER_ACTION = 2500; // after create/update/export per task spec

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
 * Resolves the cabildo the adminPage fixture selected (first cabildo =
 * TATACHIO MIRABEL) into { id, nombre } by reading the stored cabildoId and
 * matching it against GET /api/cabildos.
 */
async function getSelectedCabildo(page: Page): Promise<{ id: string; nombre: string }> {
  const token = await getToken(page);
  const storedId = await page.evaluate(() => localStorage.getItem("tatachio:cabildoId"));
  expect(storedId, "adminPage fixture must store a cabildoId").toBeTruthy();

  const res = await page.request.get(`${API_URL}/api/cabildos`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok()).toBeTruthy();
  const cabildos = (await res.json()) as Array<{ id: string; nombre: string }>;
  const cabildo = cabildos.find((c) => c.id === storedId);
  expect(cabildo, "stored cabildoId must exist in GET /api/cabildos").toBeTruthy();
  return cabildo!;
}

/**
 * Mirrors the backend slugify (apps/backend/src/controllers/reporteController.ts):
 * lowercase, accents stripped, whitespace runs → "-", non-alphanumeric removed.
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
 * Fetches the member whose numeroDocumento matches exactly, scoped to the
 * selected cabildo. Used as a REAL assertion wherever the virtualized table
 * would hide the (last-row) new member from the DOM.
 */
async function getMemberByDoc(
  page: Page,
  token: string,
  cabildoId: string,
  doc: string,
): Promise<{ id: string; nombres: string; apellidos: string; numeroDocumento: string } | undefined> {
  const res = await page.request.get(
    `${API_URL}/api/miembros?search=${encodeURIComponent(doc)}&cabildoId=${encodeURIComponent(cabildoId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  expect(res.ok()).toBeTruthy();
  const members = (await res.json()) as Array<{
    id: string;
    nombres: string;
    apellidos: string;
    numeroDocumento: string;
  }>;
  return members.find((m) => m.numeroDocumento === doc);
}

test.describe("Demo CRUD — full admin workflow with mocked LLM", () => {
  // The base config caps a test at 30s; this demo runs ~2 minutes of visible
  // flow (plus webserver startup/teardown and the formateador.py xlsx run).
  test.setTimeout(300_000);

  test("register captain, create+edit member, export census, chat with mocked AI", async ({
    adminPage: page,
  }) => {
    const token = await getToken(page);

    // ---------------------------------------------------------------------
    // Step 1 — Register a captain (CAPTAINS-1: rol locked CAPTAIN, cabildo
    // from the selector). The fixture already logged in and selected the
    // first cabildo, so the video starts at the Capitanas module.
    // ---------------------------------------------------------------------
    await page.goto("/capitanas");
    await keepVideoFramesAlive(page); // keep the whole recording at realtime pace
    // Pre-roll: give the video recorder (ffmpeg launch, first frame) time to
    // become ready before the first visible action.
    await page.waitForTimeout(6000);

    await expect(page.getByRole("heading", { name: "Capitanas", exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await page.waitForTimeout(PAUSE_SHORT);

    const { id: cabildoId, nombre: cabildoNombre } = await getSelectedCabildo(page);

    await page.getByLabel(/Email/).pressSequentially("capitana.demo@test.com", { delay: 60 });
    await page.getByLabel(/Nombre/).pressSequentially("CAPITANA DEMO", { delay: 60 });
    await page.getByLabel(/Contraseña/).pressSequentially("capitana123", { delay: 60 });

    // Cabildo selector: wait until the CabildoContext hydrates the list, then
    // pick the SAME cabildo the fixture selected (so the new captain appears
    // in the scoped Capitanas list). Scoped by the form's select id: a bare
    // getByLabel(/Cabildo/) also matches the topbar cabildo-selector.
    const cabildoSelect = page.locator("#cabildoId");
    await expect
      .poll(
        () =>
          cabildoSelect
            .locator("option")
            .evaluateAll((opts) => opts.some((o) => o.value !== "")),
        { timeout: 15_000 },
      )
      .toBe(true);
    await cabildoSelect.selectOption({ label: cabildoNombre });
    await page.waitForTimeout(PAUSE_SHORT);

    await page.getByRole("button", { name: "Registrar Capitana" }).click();

    // REAL assertion: the registration success toast (TOAST-2 role="status").
    await expect(page.getByRole("status")).toContainText("Capitana registrada correctamente", {
      timeout: 15_000,
    });
    await page.waitForTimeout(PAUSE_AFTER_ACTION); // let the viewer read the toast

    // The refreshed Capitanas list (scoped to the selected cabildo) shows her.
    await expect(page.getByText("CAPITANA DEMO")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(PAUSE_SHORT);

    // ---------------------------------------------------------------------
    // Step 2 — Create a member (MiembroForm). familiaId is required UUID →
    // fill the first familia of the selected cabildo fetched from the API.
    // No "creado correctamente" toast exists for creation; the REAL proof is
    // the form closing + the row rendering (API-verified + table scroll).
    // ---------------------------------------------------------------------
    await page.getByRole("link", { name: "Miembros" }).click();
    await expect(page.getByTestId("virtual-table")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(PAUSE_SHORT);

    const famRes = await page.request.get(
      `${API_URL}/api/familias?cabildoId=${encodeURIComponent(cabildoId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(famRes.ok()).toBeTruthy();
    const familias = (await famRes.json()) as Array<{ id: string }>;
    expect(familias.length).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Nuevo Miembro" }).click();
    await page.getByLabel(/^Nombres/).pressSequentially("MIEMBRO DEMO", { delay: 60 });
    await page.getByLabel(/^Apellidos/).pressSequentially("PRUEBA", { delay: 60 });
    // tipoIdentificacion defaults to CC and sexo to M and parentesco to HI —
    // no interaction needed (the viewer sees the prefilled values).
    await page.getByLabel(/^Número Documento/).pressSequentially("1234567890", { delay: 60 });
    await page.getByLabel(/^Fecha Nacimiento/).pressSequentially("15/03/1995", { delay: 60 });
    await page.getByLabel(/^Integrantes/).fill("1");
    // Select the first family from the cabildo-scoped select instead of filling a text input.
    await page.getByTestId("familia-select").selectOption({ index: 0 });
    await page.waitForTimeout(PAUSE_SHORT);

    await page.getByRole("button", { name: "Guardar", exact: true }).click();

    // The create section closes (submit button unmounts) — creation accepted.
    await expect(page.getByRole("button", { name: "Guardar", exact: true })).toHaveCount(0, {
      timeout: 15_000,
    });
    await page.waitForTimeout(PAUSE_AFTER_ACTION);

    // REAL assertion via API: the member exists with the submitted values.
    const created = await getMemberByDoc(page, token, cabildoId, "1234567890");
    expect(created?.nombres, "created member must have the submitted nombres").toBe("MIEMBRO DEMO");
    expect(created?.apellidos).toBe("PRUEBA");

    // Show the new row on video: it is the LAST row (insertion order) and the
    // table is virtualized, so scroll the table to the bottom first.
    await page.getByTestId("virtual-table").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(page.getByTestId("table-row").last()).toContainText("1234567890", {
      timeout: 15_000,
    });
    await expect(page.getByTestId("table-row").last()).toContainText("MIEMBRO DEMO");
    await page.waitForTimeout(PAUSE_AFTER_ACTION);

    // ---------------------------------------------------------------------
    // Step 3 — Inline edit the created member (EDIT-1..3): edit-btn in the
    // row's acciones cell → the first editor input is Nombres → save-btn →
    // success toast → row re-renders with the new value.
    // ---------------------------------------------------------------------
    const lastRow = page.getByTestId("table-row").last();
    await lastRow.getByTestId("edit-btn").click();

    const nombresInput = lastRow.locator("input").first();
    await expect(nombresInput).toBeEditable();
    // Real typing on video: select-all then retype the new value.
    await nombresInput.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("MIEMBRO EDITADO", { delay: 60 });
    await page.waitForTimeout(PAUSE_SHORT);

    await lastRow.getByTestId("save-btn").click();

    // REAL assertion: the inline-edit success toast.
    await expect(page.getByRole("status")).toContainText("Miembro actualizado correctamente", {
      timeout: 15_000,
    });
    await page.waitForTimeout(PAUSE_AFTER_ACTION);
    await expect(page.getByTestId("save-btn")).toHaveCount(0, { timeout: 15_000 });

    // REAL assertion via API: the PUT persisted the new nombres.
    const edited = await getMemberByDoc(page, token, cabildoId, "1234567890");
    expect(edited?.nombres, "inline edit must persist the new nombres").toBe("MIEMBRO EDITADO");

    // The refetched list keeps the scroll at the bottom; re-scroll defensively
    // and assert the visible row shows the edited value.
    await page.getByTestId("virtual-table").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(page.getByTestId("table-row").last()).toContainText("MIEMBRO EDITADO", {
      timeout: 15_000,
    });
    await page.waitForTimeout(PAUSE_AFTER_ACTION);

    // ---------------------------------------------------------------------
    // Step 4 — Export the per-cabildo Excel (XLSX-1/4): click export-btn →
    // success toast; the download uses a blob+anchor (no Playwright download
    // event), so the file itself is verified with a second authenticated
    // request: 200 + censo-<slug>-<year>.xlsx in content-disposition + PK zip
    // magic bytes.
    // ---------------------------------------------------------------------
    await page.getByTestId("export-btn").click();
    await expect(page.getByRole("status")).toContainText("Censo exportado correctamente", {
      timeout: 90_000, // the backend spawns formateador.py per request
    });
    await page.waitForTimeout(3000); // let the viewer see the success toast

    const expectedFilename = `censo-${slugify(cabildoNombre)}-${new Date().getFullYear()}.xlsx`;
    const res = await page.request.get(
      `${API_URL}/api/reportes/censo.xlsx?cabildoId=${encodeURIComponent(cabildoId)}`,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 60_000 },
    );
    expect(res.status()).toBe(200);
    const disposition = res.headers()["content-disposition"] ?? "";
    expect(disposition, "scoped xlsx filename must carry the cabildo slug").toContain(
      expectedFilename,
    );
    // The body is a real xlsx (zip "PK" magic), not an error page.
    const bytes = await res.body();
    expect(bytes[0]).toBe(0x50); // "P"
    expect(bytes[1]).toBe(0x4b); // "K"
    await page.waitForTimeout(PAUSE_AFTER_ACTION);

    // ---------------------------------------------------------------------
    // Step 5 — Chat with the MOCKED AI: the mock serves /v1/models (model
    // selector) and answers deterministically by keyword. "reporte" →
    // getReporteData (ADMIN-only tool) → the mock's final answer starts with
    // "He consultado la base de datos. Resultado:" — that exact phrasing is
    // the proof the mock (not a real LLM) served the conversation.
    // ---------------------------------------------------------------------
    await page.getByRole("link", { name: "Chat" }).click();
    await expect(page.getByTestId("chat-input")).toBeVisible({ timeout: 15_000 });

    const modelSelect = page.getByTestId("model-selector");
    await expect(modelSelect).toBeVisible();
    await expect
      .poll(
        () => modelSelect.locator("option").evaluateAll((opts) => opts.some((o) => o.value !== "")),
        { timeout: 20_000 },
      )
      .toBe(true);
    await page.waitForTimeout(PAUSE_SHORT);

    await page.getByTestId("chat-input").pressSequentially("Hola, necesito el reporte de miembros", {
      delay: 60,
    });
    await expect(page.getByTestId("chat-input")).toHaveValue(
      "Hola, necesito el reporte de miembros",
    );
    await page.waitForTimeout(1000);
    await page.getByTestId("chat-send-btn").click();

    // The assistant answer streams in progressively (raw UTF-8 chunks through
    // the OpenAI adapter); wait for the mock's signature phrase.
    const messageList = page.getByTestId("message-list");
    await expect(messageList).toBeVisible({ timeout: 30_000 });
    await expect(messageList).toContainText(/consultado la base de datos/, { timeout: 30_000 });
    await page.waitForTimeout(3000); // final beat: full answer visible on video

    // The demo is over — the viewer saw the complete admin workflow:
    // captain registration → member create → inline edit → per-cabildo export
    // → chat with the mocked AI, all in ONE video with ZERO token cost.
  });
});
