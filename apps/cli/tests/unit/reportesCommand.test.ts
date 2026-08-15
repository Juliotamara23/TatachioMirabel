import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest";
import { promises as fs } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";

// Unit: the API layer is mocked — only the command logic is exercised.
vi.mock("../../src/api/reportes.js", () => ({
  descargarCenso: vi.fn(),
}));

import { aislarHome, restaurarHome } from "../helpers/home-isolation.js";

// Total isolation (issue #62): tests NEVER touch the real ~/.tatachio.
beforeAll(() => {
  aislarHome();
});
afterAll(() => {
  restaurarHome();
});

import { descargarCenso } from "../../src/api/reportes.js";
import { setupReportesCommand, generarReporteCmd } from "../../src/commands/reportes.js";

const BASE_URL = "http://localhost:3000";
const mockDescargarCenso = vi.mocked(descargarCenso);

async function writeConfig(token = "test-token") {
  const configPath = join(homedir(), ".tatachio", "config.json");
  await fs.mkdir(join(homedir(), ".tatachio"), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify({ token, baseUrl: BASE_URL }), "utf-8");
}

async function clearConfig() {
  const configPath = join(homedir(), ".tatachio", "config.json");
  try {
    await fs.unlink(configPath);
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") {
      throw error;
    }
  }
}

function buildProgram() {
  const program = new Command();
  program.name("tatachio").allowExcessArguments(false);
  const cmd = program.command("reportes").description("Manage reports");
  setupReportesCommand(cmd);
  return program;
}

describe("CLI reportes generar (unit, API mocked)", () => {
  let reportesDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    reportesDir = mkdtempSync(join(tmpdir(), "cli-reportes-"));
    process.env.TATACHIO_REPORTES_DIR = reportesDir;
    await writeConfig();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    await clearConfig();
    delete process.env.TATACHIO_REPORTES_DIR;
    rmSync(reportesDir, { recursive: true, force: true });
    logSpy.mockRestore();
    errorSpy.mockRestore();
    mockDescargarCenso.mockReset();
    process.exitCode = undefined;
  });

  it("descarga, crea la carpeta compartida y escribe el xlsx (--json)", async () => {
    mockDescargarCenso.mockResolvedValue({
      buffer: Buffer.from("PK-bytes"),
      nombre: "censo-2026.xlsx",
    });

    await buildProgram().parseAsync(["reportes", "generar", "--json"], { from: "user" });

    const expectedPath = join(reportesDir, "censo-2026.xlsx");
    expect(await fs.readFile(expectedPath, "utf-8")).toBe("PK-bytes");
    expect(process.exitCode).toBe(0);

    const printed = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    const parsed = JSON.parse(printed) as { ok: boolean; data: { archivo: string; path: string } };
    expect(parsed.ok).toBe(true);
    expect(parsed.data).toEqual({ archivo: "censo-2026.xlsx", path: expectedPath });
  });

  it("--output <path> escribe en la ruta indicada (override)", async () => {
    mockDescargarCenso.mockResolvedValue({
      buffer: Buffer.from("PK"),
      nombre: "censo-2026.xlsx",
    });

    const custom = join(reportesDir, "custom", "mi-censo.xlsx");
    await buildProgram().parseAsync(
      ["reportes", "generar", "--output", custom, "--json"],
      { from: "user" },
    );

    expect(await fs.readFile(custom, "utf-8")).toBe("PK");
    expect(process.exitCode).toBe(0);

    const printed = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    const parsed = JSON.parse(printed) as { ok: boolean; data: { path: string } };
    expect(parsed.data.path).toBe(custom);
  });

  it("pretty mode imprime la ruta absoluta (el binario nunca va a stdout)", async () => {
    mockDescargarCenso.mockResolvedValue({
      buffer: Buffer.from("PK"),
      nombre: "censo-2026.xlsx",
    });

    await generarReporteCmd({}, "pretty");

    const printed = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(printed.trim()).toBe(join(reportesDir, "censo-2026.xlsx"));
    expect(process.exitCode).toBe(0);
  });

  it("error 5xx → exit 2", async () => {
    const err = new Error("API request failed") as Error & { status: number };
    err.status = 500;
    mockDescargarCenso.mockRejectedValue(err);

    await buildProgram().parseAsync(["reportes", "generar", "--json"], { from: "user" });

    expect(process.exitCode).toBe(2);
  });

  it("error 4xx → exit 1", async () => {
    const err = new Error("API request failed") as Error & { status: number };
    err.status = 403;
    mockDescargarCenso.mockRejectedValue(err);

    await buildProgram().parseAsync(["reportes", "generar", "--json"], { from: "user" });

    expect(process.exitCode).toBe(1);
  });

  it("sin token → exit 1 con error de auth, sin llamar a la API", async () => {
    await clearConfig();

    await buildProgram().parseAsync(["reportes", "generar", "--json"], { from: "user" });

    expect(process.exitCode).toBe(1);
    expect(mockDescargarCenso).not.toHaveBeenCalled();
    const messages = errorSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(messages.toLowerCase()).toContain("token");
  });
});
