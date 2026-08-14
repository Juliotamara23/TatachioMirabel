import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { Command } from "commander";

import { listCabildos, getCabildo } from "../../src/api/cabildos.js";
import { setupCabildosCommand } from "../../src/commands/cabildos.js";

const BASE_URL = "http://localhost:3000";

async function writeConfig() {
  const configPath = join(homedir(), ".tatachio", "config.json");
  await fs.mkdir(join(homedir(), ".tatachio"), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify({ token: "test-token", baseUrl: BASE_URL }), "utf-8");
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

describe("Cabildos API", () => {
  const mockServer = setupServer(
    http.get(`${BASE_URL}/api/cabildos`, async ({ request }) => {
      const auth = request.headers.get("authorization");
      if (auth !== "Bearer test-token") {
        return HttpResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const allCabildos = [
        { id: "c1", nombre: "Tatachio Mirabel", resguardo: "Resguardo Tatachio", comunidad: "Comunidad Tatachio", vigencia: 2026 },
        { id: "c2", nombre: "San Juan", resguardo: "Resguardo San Juan", comunidad: "Comunidad San Juan", vigencia: 2026 },
        { id: "c3", nombre: "La Esperanza", resguardo: "Resguardo La Esperanza", comunidad: "Comunidad Esperanza", vigencia: 2026 },
      ];

      return HttpResponse.json(allCabildos);
    }),

    http.get(`${BASE_URL}/api/cabildos/:id`, async ({ params }) => {
      const id = params.id as string;
      const cabildos = [
        { id: "c1", nombre: "Tatachio Mirabel", resguardo: "Resguardo Tatachio", comunidad: "Comunidad Tatachio", vigencia: 2026 },
        { id: "c2", nombre: "San Juan", resguardo: "Resguardo San Juan", comunidad: "Comunidad San Juan", vigencia: 2026 },
        { id: "c3", nombre: "La Esperanza", resguardo: "Resguardo La Esperanza", comunidad: "Comunidad Esperanza", vigencia: 2026 },
      ];
      const cabildo = cabildos.find(function(c) {
        return c.id === id;
      });
      if (cabildo) {
        return HttpResponse.json(cabildo);
      } else {
        return HttpResponse.json({ error: "Cabildo no encontrado" }, { status: 404 });
      }
    }),
  );

  beforeEach(async () => {
    await writeConfig();
    mockServer.listen();
  });

  afterEach(async () => {
    await clearConfig();
    mockServer.resetHandlers();
    mockServer.close();
  });

  it("listCabildos returns cabildos", async () => {
    const result = await listCabildos(BASE_URL, "test-token");
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(3);
    expect((result as any[]).map((c) => c.id)).toContain("c1");
  });

  it("getCabildo finds existing cabildo", async () => {
    const result = await getCabildo(BASE_URL, "test-token", "c1");
    expect((result as Record<string, unknown>).id).toBe("c1");
    expect((result as Record<string, unknown>).nombre).toBe("Tatachio Mirabel");
  });

  it("getCabildo returns 404 for non-existent cabildo", async () => {
    await expect(getCabildo(BASE_URL, "test-token", "nonexistent"))
      .rejects
      .toMatchObject({ status: 404 });
  });
});

describe("CLI cabildos exit codes on server errors", () => {
    let program: Command;
    let mockServer: ReturnType<typeof setupServer>;
    let errorSpy: ReturnType<typeof vi.spyOn>;
    let listStatus = 500;
    let getStatus = 500;

    beforeEach(async () => {
      await writeConfig();
      listStatus = 500;
      getStatus = 500;
      errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      mockServer = setupServer(
        http.get(`${BASE_URL}/api/cabildos`, () =>
          HttpResponse.json({ error: "Internal Server Error" }, { status: listStatus }),
        ),
        http.get(`${BASE_URL}/api/cabildos/:id`, () =>
          HttpResponse.json({ error: "Internal Server Error" }, { status: getStatus }),
        ),
      );
      mockServer.listen();

      program = new Command();
      program.name("tatachio").allowExcessArguments(false);
      const cabildosCmd = program.command("cabildos").description("Manage cabildos");
      setupCabildosCommand(cabildosCmd);
    });

    afterEach(async () => {
      await clearConfig();
      mockServer.resetHandlers();
      mockServer.close();
      errorSpy.mockRestore();
      process.exitCode = undefined;
    });

    function expectErrorOnStderr(): void {
      const messages = errorSpy.mock.calls.map((call) => String(call[0])).join("\n");
      expect(messages).toContain("API request failed");
    }

    it("list exits 2 and prints error to stderr when server returns 500", async () => {
      await program.parseAsync(["cabildos", "list"], { from: "user" });

      expect(process.exitCode).toBe(2);
      expectErrorOnStderr();
    });

    it("list exits 1 on 401 (4xx guard)", async () => {
      listStatus = 401;

      await program.parseAsync(["cabildos", "list"], { from: "user" });

      expect(process.exitCode).toBe(1);
    });

    it("get exits 2 and prints error to stderr when server returns 500", async () => {
      await program.parseAsync(["cabildos", "get", "c1"], { from: "user" });

      expect(process.exitCode).toBe(2);
      expectErrorOnStderr();
    });

    it("get exits 1 on 404 (4xx guard)", async () => {
      getStatus = 404;

      await program.parseAsync(["cabildos", "get", "nonexistent"], { from: "user" });

      expect(process.exitCode).toBe(1);
    });
  });
