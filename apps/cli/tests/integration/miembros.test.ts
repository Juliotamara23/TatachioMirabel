import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { Command } from "commander";

import { listMiembros, getMiembro, createMiembro, updateMiembro } from "../../src/api/miembros.js";
import { setupMiembrosCommand, validateDate } from "../../src/commands/miembros.js";

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

describe("validateDate (interactive fechaNacimiento)", () => {
  it("accepts old dates (1919) — real census data", () => {
    expect(validateDate("28/11/1919", "fechaNacimiento")).toBe("28/11/1919");
  });

  it("accepts recent dates", () => {
    expect(validateDate("17/08/2025", "fechaNacimiento")).toBe("17/08/2025");
  });

  it("rejects invalid format", () => {
    expect(() => validateDate("1990/01/01", "fechaNacimiento")).toThrow();
    expect(() => validateDate("01-01-1990", "fechaNacimiento")).toThrow();
    expect(() => validateDate("01/01/90", "fechaNacimiento")).toThrow();
  });

  it("rejects non-date strings", () => {
    expect(() => validateDate("DD/MM/YYYY", "fechaNacimiento")).toThrow();
    expect(() => validateDate("abc", "fechaNacimiento")).toThrow();
  });
});

describe("Miembros CRUD API", () => {  const mockServer = setupServer(
    http.get(`${BASE_URL}/api/miembros`, async ({ request }) => {
      const auth = request.headers.get("authorization");
      if (auth !== "Bearer test-token") {
        return HttpResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const url = new URL(request.url);
      const search = url.searchParams.get("search");
      const cabildoId = url.searchParams.get("cabildoId");

      const allMiembros = [
        { id: "m1", nombres: "Juan Pérez", apellidos: "Pérez", email: "juan@test.com", cabildoId: "c1" },
        { id: "m2", nombres: "María García", apellidos: "García", email: "maria@test.com", cabildoId: "c1" },
        { id: "m3", nombres: "Carlos López", apellidos: "López", email: "carlos@test.com", cabildoId: "c2" },
      ];

      const filtered = allMiembros.filter(function(item) {
        const m = item as Record<string, unknown>;
        if (search && !(m.nombres as string).toLowerCase().includes(search.toLowerCase())) return false;
        if (cabildoId && m.cabildoId !== cabildoId) return false;
        return true;
      });

      return HttpResponse.json(filtered);
    }),

    http.get(`${BASE_URL}/api/miembros/:id`, async ({ params }) => {
      const id = params.id as string;
      const miembros = [
        { id: "m1", nombres: "Juan Pérez", apellidos: "Pérez", email: "juan@test.com", cabildoId: "c1", rol: "USER" },
        { id: "m2", nombres: "María García", apellidos: "García", email: "maria@test.com", cabildoId: "c1", rol: "ADMIN" },
        { id: "m3", nombres: "Carlos López", apellidos: "López", email: "carlos@test.com", cabildoId: "c2", rol: "USER" },
      ];
      const miembro = miembros.find(function(m) {
        return m.id === id;
      });
      if (miembro) {
        return HttpResponse.json(miembro);
      } else {
        return HttpResponse.json({ error: "Miembro no encontrado" }, { status: 404 });
      }
    }),

    http.post(`${BASE_URL}/api/miembros`, async ({ request }) => {
      const body = await request.json();
      const newMiembro = {
        id: `m${Math.random().toString(36).substring(2, 5)}`,
        ...body,
      };
      return HttpResponse.json(newMiembro);
    }),

    http.put(`${BASE_URL}/api/miembros/:id`, async ({ params, request }) => {
      const id = params.id as string;
      const updates = await request.json();

      const miembros = [
        { id: "m1", nombres: "Juan Pérez", apellidos: "Pérez", email: "juan@test.com", cabildoId: "c1", rol: "USER" },
        { id: "m2", nombres: "María García", apellidos: "García", email: "maria@test.com", cabildoId: "c1", rol: "ADMIN" },
        { id: "m3", nombres: "Carlos López", apellidos: "López", email: "carlos@test.com", cabildoId: "c2", rol: "USER" },
      ];

      const index = miembros.findIndex(function(m) {
        return m.id === id;
      });
      if (index === -1) {
        return HttpResponse.json({ error: "Miembro no encontrado" }, { status: 404 });
      }

      const updated = { ...miembros[index], ...updates };
      miembros[index] = updated;
      return HttpResponse.json(updated);
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

  it("listMiembros returns members without filters", async () => {
    const result = await listMiembros(BASE_URL, "test-token");
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(3);
    expect((result as any[]).map((m) => m.id)).toContain("m1");
  });

  it("listMiembros filters by search", async () => {
    const result = await listMiembros(BASE_URL, "test-token", { search: "Juan" });
    expect(Array.isArray(result)).toBe(true);
    expect((result as any[]).length).toBe(1);
    expect((result as any[])[0].id).toBe("m1");
  });

  it("listMiembros filters by cabildoId", async () => {
    const result = await listMiembros(BASE_URL, "test-token", { cabildoId: "c1" });
    expect(Array.isArray(result)).toBe(true);
    expect((result as any[]).length).toBe(2);
    expect((result as any[]).map((m) => m.cabildoId).every((c) => c === "c1")).toBe(true);
  });

  it("getMiembro finds existing member", async () => {
    const result = await getMiembro(BASE_URL, "test-token", "m1");
    expect((result as Record<string, unknown>).id).toBe("m1");
    expect((result as Record<string, unknown>).nombres).toBe("Juan Pérez");
  });

  it("getMiembro returns 404 for non-existent member", async () => {
    await expect(getMiembro(BASE_URL, "test-token", "nonexistent"))
      .rejects
      .toMatchObject({ status: 404 });
  });

  it("createMiembro creates new member", async () => {
    const data = { nombres: "Nuevo Miembro", apellidos: "Nuevo", email: "nuevo@test.com", cabildoId: "c1", rol: "USER" };
    const result = await createMiembro(BASE_URL, "test-token", data);
    expect((result as Record<string, unknown>).nombres).toBe("Nuevo Miembro");
    expect((result as Record<string, unknown>).email).toBe("nuevo@test.com");
  });

  it("updateMiembro updates partial fields", async () => {
    const updates = { nombres: "Juan Pérez Actualizado", rol: "SUPERUSER" };
    const result = await updateMiembro(BASE_URL, "test-token", "m1", updates);
    expect((result as Record<string, unknown>).nombres).toBe("Juan Pérez Actualizado");
    expect((result as Record<string, unknown>).rol).toBe("SUPERUSER");
    expect((result as Record<string, unknown>).email).toBe("juan@test.com");
  });

  describe("CLI miembros create --json", () => {
    let program: Command;
    let mockServer: ReturnType<typeof setupServer>;
    let capturedBody: Record<string, unknown> | null;

    beforeEach(async () => {
      await writeConfig();
      capturedBody = null;
      mockServer = setupServer(
        http.post(`${BASE_URL}/api/miembros`, async ({ request }) => {
          const auth = request.headers.get("authorization");
          if (auth !== "Bearer test-token") {
            return HttpResponse.json({ error: "Unauthorized" }, { status: 401 });
          }
          const body = await request.json();
          capturedBody = body;
          const newMiembro = {
            id: `m${Math.random().toString(36).substring(2, 5)}`,
            ...body,
          };
          return HttpResponse.json(newMiembro);
        }),
      );
      mockServer.listen();

      program = new Command();
      program.name("tatachio").allowExcessArguments(false);
      const miembrosCmd = program.command("miembros").description("Manage members");
      setupMiembrosCommand(miembrosCmd);
    });

    afterEach(async () => {
      await clearConfig();
      mockServer.resetHandlers();
      mockServer.close();
    });

    it("creates member via CLI with valid JSON", async () => {
      const validJson = JSON.stringify({
        tipoIdentificacion: "CC",
        numeroDocumento: "123456789",
        nombres: "Test",
        apellidos: "User",
        fechaNacimiento: "01/01/1990",
        parentesco: "PA",
        sexo: "M",
        integrantes: 1,
        familiaId: "f1",
      });

      await program.parseAsync(["miembros", "create", "--json", validJson], { from: "user" });

      expect(capturedBody).not.toBeNull();
      expect(capturedBody!.tipoIdentificacion).toBe("CC");
      expect(capturedBody!.numeroDocumento).toBe("123456789");
      expect(capturedBody!.nombres).toBe("Test");
      expect(capturedBody!.apellidos).toBe("User");
      expect(capturedBody!.fechaNacimiento).toBe("01/01/1990");
      expect(capturedBody!.parentesco).toBe("PA");
      expect(capturedBody!.sexo).toBe("M");
      expect(capturedBody!.integrantes).toBe(1);
      expect(capturedBody!.familiaId).toBe("f1");
    });

it("rejects malformed JSON without making HTTP request", async () => {
      const malformedJson = "{ invalid json }";
      let requestMade = false;

      const testServer = setupServer(
        http.post(`${BASE_URL}/api/miembros`, async () => {
          requestMade = true;
          return HttpResponse.json({ id: "m1" });
        }),
      );
      testServer.listen();

      const testProgram = new Command();
      testProgram.name("tatachio").allowExcessArguments(false);
      const testMiembrosCmd = testProgram.command("miembros").description("Manage members");
      setupMiembrosCommand(testMiembrosCmd);

      try {
        await testProgram.parseAsync(["miembros", "create", "--json", malformedJson], { from: "user" });
      } catch (err) {
        // Expected to throw due to invalid JSON
      }

      expect(requestMade).toBe(false);
      testServer.close();
    });
  });

  describe("CLI miembros list --cabildo-id", () => {
    let program: Command;
    let mockServer: ReturnType<typeof setupServer>;
    let capturedUrl: string | null;

    beforeEach(async () => {
      await writeConfig();
      capturedUrl = null;
      mockServer = setupServer(
        http.get(`${BASE_URL}/api/miembros`, async ({ request }) => {
          const auth = request.headers.get("authorization");
          if (auth !== "Bearer test-token") {
            return HttpResponse.json({ error: "Unauthorized" }, { status: 401 });
          }

          capturedUrl = request.url;

          const url = new URL(request.url);
          const cabildoId = url.searchParams.get("cabildoId");

          const allMiembros = [
            { id: "m1", nombres: "Juan Pérez", apellidos: "Pérez", email: "juan@test.com", cabildoId: "c1" },
            { id: "m2", nombres: "María García", apellidos: "García", email: "maria@test.com", cabildoId: "c1" },
            { id: "m3", nombres: "Carlos López", apellidos: "López", email: "carlos@test.com", cabildoId: "c2" },
          ];

          const filtered = allMiembros.filter(function(item) {
            if (cabildoId && item.cabildoId !== cabildoId) return false;
            return true;
          });

          return HttpResponse.json(filtered);
        }),
      );
      mockServer.listen();

      program = new Command();
      program.name("tatachio").exitOverride();
      const miembrosCmd = program.command("miembros").description("Manage members");
      setupMiembrosCommand(miembrosCmd);
    });

    afterEach(async () => {
      await clearConfig();
      mockServer.resetHandlers();
      mockServer.close();
    });

    it("filters members by cabildoId via CLI", async () => {
      await program.parseAsync(["miembros", "list", "--cabildo-id", "c1"], { from: "user" });

      expect(capturedUrl).not.toBeNull();
      const url = new URL(capturedUrl!);
      expect(url.searchParams.get("cabildoId")).toBe("c1");
    });
  });
});