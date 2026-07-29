import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import { listMiembros, getMiembro, createMiembro, updateMiembro } from "../../src/api/miembros.js";

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

describe("Miembros CRUD API", () => {
  const mockServer = setupServer(
    http.get(`${BASE_URL}/api/miembros`, async ({ request }) => {
      const auth = request.headers.get("authorization");
      if (auth !== "Bearer test-token") {
        return HttpResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const url = new URL(request.url);
      const search = url.searchParams.get("search");
      const cabildoId = url.searchParams.get("cabildoId");
      const rol = url.searchParams.get("rol");

      const allMiembros = [
        { id: "m1", nombres: "Juan Pérez", apellidos: "Pérez", email: "juan@test.com", cabildoId: "c1", rol: "USER" },
        { id: "m2", nombres: "María García", apellidos: "García", email: "maria@test.com", cabildoId: "c1", rol: "ADMIN" },
        { id: "m3", nombres: "Carlos López", apellidos: "López", email: "carlos@test.com", cabildoId: "c2", rol: "USER" },
      ];

      const filtered = allMiembros.filter(function(item) {
        const m = item as Record<string, unknown>;
        if (search && !(m.nombres as string).toLowerCase().includes(search.toLowerCase())) return false;
        if (cabildoId && m.cabildoId !== cabildoId) return false;
        if (rol && m.rol !== rol) return false;
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

  it("listMiembros filters by rol", async () => {
    const result = await listMiembros(BASE_URL, "test-token", { rol: "ADMIN" });
    expect(Array.isArray(result)).toBe(true);
    expect((result as any[]).length).toBe(1);
    expect((result as any[])[0].rol).toBe("ADMIN");
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
});
