#!/usr/bin/env node
/**
 * QA suite — cli/reportes (Fase 4, Issue #60)
 *
 * `tatachio reportes generar` end-to-end contra el server QA real:
 * - Admin genera → exit 0, archivo en ~/.tatachio/reportes/, xlsx válido (PK)
 * - Modo --json → { ok, data: { archivo, path } }
 * - Sin token → error de auth (exit ≠ 0)
 * - Capitana → 403 / exit ≠ 0 (endpoint admin-only, issue #39)
 * - TATACHIO_REPORTES_DIR override → el archivo cae en el dir custom
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { runSuite, createTestHelper } from "../../lib/suite-runner.mjs";
import { runCli, parseJsonOutput } from "../../lib/cli-utils.mjs";
import { loginAdmin, loginCapitana } from "../../lib/test-utils.mjs";

const CURRENT_YEAR = new Date().getFullYear();
const NOMBRE_ESPERADO = `censo-${CURRENT_YEAR}.xlsx`;

function assertXlsxValido(filePath, context) {
  if (!existsSync(filePath)) {
    throw new Error(`${context}: no existe ${filePath}`);
  }
  const head = readFileSync(filePath).subarray(0, 2).toString("utf-8");
  if (head !== "PK") {
    throw new Error(`${context}: ${filePath} no parece un xlsx (magic=${JSON.stringify(head)})`);
  }
}

await runSuite({ name: "cli/reportes", seed: true, start: true }, async ({ base }) => {
  const t = createTestHelper("cli/reportes");
  const adminToken = await loginAdmin(base);
  const capitanaToken = await loginCapitana(base);

  const defaultDir = join(homedir(), ".tatachio", "reportes");
  const generatedPaths = [];
  let tempOverrideDir = null;

  // ── Generación exitosa (ADMIN) ───────────────────────────────────────
  await t.test("reportes generar --json → exit 0 y xlsx en ~/.tatachio/reportes/", async () => {
    // TATACHIO_REPORTES_DIR="" fuerza el default aunque el entorno la tenga seteada
    const res = await runCli(["reportes", "generar", "--json"], {
      base,
      token: adminToken,
      env: { TATACHIO_REPORTES_DIR: "" },
    });
    if (res.code !== 0) throw new Error(`Expected exit 0, got ${res.code}: ${res.stderr}`);

    const parsed = parseJsonOutput(res.stdout);
    if (!parsed.ok) throw new Error(`CLI error: ${parsed.error}`);
    if (!parsed.data || typeof parsed.data !== "object") {
      throw new Error(`Esperado data {archivo, path}, got: ${JSON.stringify(parsed.data)}`);
    }
    if (parsed.data.archivo !== NOMBRE_ESPERADO) {
      throw new Error(`archivo inesperado: ${parsed.data.archivo}`);
    }

    const filePath = parsed.data.path;
    if (filePath !== join(defaultDir, NOMBRE_ESPERADO)) {
      throw new Error(`path inesperado: ${filePath} (esperado ${join(defaultDir, NOMBRE_ESPERADO)})`);
    }
    assertXlsxValido(filePath, "default dir");
    generatedPaths.push(filePath);
  });

  await t.test("reportes generar (pretty) → exit 0, stdout = ruta absoluta", async () => {
    const res = await runCli(["reportes", "generar"], {
      base,
      token: adminToken,
      env: { TATACHIO_REPORTES_DIR: "" },
    });
    if (res.code !== 0) throw new Error(`Expected exit 0, got ${res.code}: ${res.stderr}`);

    const printed = res.stdout.trim();
    const expected = join(defaultDir, NOMBRE_ESPERADO);
    if (printed !== expected) {
      throw new Error(`Esperado path en stdout "${expected}", got: "${printed}"`);
    }
    assertXlsxValido(expected, "pretty output");
    generatedPaths.push(expected);
  });

  await t.test("TATACHIO_REPORTES_DIR override → el archivo cae en el dir custom", async () => {
    tempOverrideDir = mkdtempSync(join(tmpdir(), "qa-reportes-custom-"));
    const res = await runCli(["reportes", "generar", "--json"], {
      base,
      token: adminToken,
      env: { TATACHIO_REPORTES_DIR: tempOverrideDir },
    });
    if (res.code !== 0) throw new Error(`Expected exit 0, got ${res.code}: ${res.stderr}`);

    const parsed = parseJsonOutput(res.stdout);
    const expected = join(tempOverrideDir, NOMBRE_ESPERADO);
    if (parsed.data?.path !== expected) {
      throw new Error(`Esperado path ${expected}, got: ${parsed.data?.path}`);
    }
    assertXlsxValido(expected, "env override dir");
  });

  // ── Auth (issue #39: endpoint admin-only) ────────────────────────────
  await t.test("reportes generar sin token → error de auth, exit ≠ 0", async () => {
    const res = await runCli(["reportes", "generar", "--json"], {
      base,
      env: { TATACHIO_REPORTES_DIR: "" },
    });
    if (res.code === 0) throw new Error("Expected non-zero exit without token");
    const out = `${res.stderr} ${res.stdout}`.toLowerCase();
    if (!out.includes("token") && !out.includes("auth") && !out.includes("login")) {
      throw new Error(`Expected auth error, got: ${res.stderr} ${res.stdout}`);
    }
  });

  await t.test("reportes generar como capitana → 403 / exit ≠ 0", async () => {
    const res = await runCli(["reportes", "generar", "--json"], {
      base,
      token: capitanaToken,
      env: { TATACHIO_REPORTES_DIR: "" },
    });
    if (res.code === 0) throw new Error("Expected non-zero exit for capitana");
    const out = `${res.stderr} ${res.stdout}`.toLowerCase();
    if (!out.includes("error") && !out.includes("403") && !out.includes("denegad")) {
      throw new Error(`Expected 403/error output, got: ${res.stderr} ${res.stdout}`);
    }
  });

  // ── Cleanup: el reporte exitoso persiste por diseño; aquí solo retiramos
  //    los archivos generados por esta suite para no ensuciar el entorno QA.
  try {
    for (const p of generatedPaths) {
      if (existsSync(p)) rmSync(p, { force: true });
    }
    if (tempOverrideDir && existsSync(tempOverrideDir)) {
      rmSync(tempOverrideDir, { recursive: true, force: true });
    }
  } catch (e) {
    console.warn(`  [cli/reportes] cleanup warning: ${e.message}`);
  }

  return t.finish();
});
