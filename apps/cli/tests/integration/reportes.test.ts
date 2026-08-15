import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { promises as fs } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { Command } from "commander";

// Integration: real descargarCenso against an MSW-mocked binary endpoint.
import { setupReportesCommand } from "../../src/commands/reportes.js";
import { aislarHome, restaurarHome } from "../helpers/home-isolation.js";

// Total isolation (issue #62): tests NEVER touch the real ~/.tatachio.
beforeAll(() => {
  aislarHome();
});
afterAll(() => {
  restaurarHome();
});

const BASE_URL = "http://localhost:3000";
const XLSX_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x0a, 0x00, 0x00, 0x00, 0x01, 0x02]);

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

describe("CLI reportes generar (integration, MSW binary endpoint)", () => {
  let reportesDir: string;
  let mockServer: ReturnType<typeof setupServer>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    reportesDir = mkdtempSync(join(tmpdir(), "cli-reportes-int-"));
    process.env.TATACHIO_REPORTES_DIR = reportesDir;
    await writeConfig();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockServer = setupServer();
    mockServer.listen();
  });

  afterEach(async () => {
    await clearConfig();
    delete process.env.TATACHIO_REPORTES_DIR;
    rmSync(reportesDir, { recursive: true, force: true });
    mockServer.resetHandlers();
    mockServer.close();
    logSpy.mockRestore();
    errorSpy.mockRestore();
    process.exitCode = undefined;
  });

  it("descarga el binario y lo escribe con el nombre del Content-Disposition (exit 0)", async () => {
    mockServer.use(
      http.get(`${BASE_URL}/api/reportes/censo.xlsx`, ({ request }) => {
        const auth = request.headers.get("authorization");
        if (auth !== "Bearer test-token") {
          return HttpResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        return new HttpResponse(XLSX_BYTES, {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": 'attachment; filename="censo-2026.xlsx"',
          },
        });
      }),
    );

    await buildProgram().parseAsync(["reportes", "generar", "--json"], { from: "user" });

    expect(process.exitCode).toBe(0);
    const expectedPath = join(reportesDir, "censo-2026.xlsx");
    const content = await fs.readFile(expectedPath);
    expect(content.equals(Buffer.from(XLSX_BYTES))).toBe(true);

    const printed = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    const parsed = JSON.parse(printed) as { ok: boolean; data: { archivo: string; path: string } };
    expect(parsed.ok).toBe(true);
    expect(parsed.data).toEqual({ archivo: "censo-2026.xlsx", path: expectedPath });
  });

  it("usa el default censo-{año}.xlsx cuando falta Content-Disposition", async () => {
    mockServer.use(
      http.get(`${BASE_URL}/api/reportes/censo.xlsx`, () =>
        new HttpResponse(XLSX_BYTES, { status: 200 }),
      ),
    );

    await buildProgram().parseAsync(["reportes", "generar", "--json"], { from: "user" });

    expect(process.exitCode).toBe(0);
    const expectedPath = join(reportesDir, `censo-${new Date().getFullYear()}.xlsx`);
    expect(await fs.readFile(expectedPath)).toBeTruthy();
  });

  it("401 → exit 1 (4xx guard)", async () => {
    mockServer.use(
      http.get(`${BASE_URL}/api/reportes/censo.xlsx`, () =>
        HttpResponse.json({ error: "Token inválido o expirado" }, { status: 401 }),
      ),
    );

    await buildProgram().parseAsync(["reportes", "generar", "--json"], { from: "user" });

    expect(process.exitCode).toBe(1);
    expect(errorSpy.mock.calls.map((call) => String(call[0])).join("\n")).toContain("API request failed");
  });

  it("500 → exit 2 (5xx guard)", async () => {
    mockServer.use(
      http.get(`${BASE_URL}/api/reportes/censo.xlsx`, () =>
        HttpResponse.json({ error: "Internal Server Error" }, { status: 500 }),
      ),
    );

    await buildProgram().parseAsync(["reportes", "generar", "--json"], { from: "user" });

    expect(process.exitCode).toBe(2);
  });
});
