import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import { listFamilias, getFamilia } from "../../src/api/familias.js";

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

describe("Familias API", () => {
  const mockServer = setupServer(
    http.get(`${BASE_URL}/api/familias`, async ({ request }) => {
      const auth = request.headers.get("authorization");
      if (auth !== "Bearer test-token") {
        return HttpResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const url = new URL(request.url);
      const search = url.searchParams.get("search");
      const cabildoId = url.searchParams.get("cabildoId");

      const allFamilias = [
        { id: "f1", numero: 1, direccion: "Calle 1 #1-01", cabildoId: "c1" },
        { id: "f2", numero: 2, direccion: "Calle 1 #1-02", cabildoId: "c1" },
        { id: "f3", numero: 3, direccion: "Calle 3 #3-01", cabildoId: "c2" },
      ];

      const filtered = allFamilias.filter(function(item) {
        const f = item as Record<string, unknown>;
        if (search && !(f.numero as number).toString().includes(search)) return false;
        if (cabildoId && f.cabildoId !== cabildoId) return false;
        return true;
      });

      return HttpResponse.json(filtered);
    }),

    http.get(`${BASE_URL}/api/familias/:id`, async ({ params }) => {
      const id = params.id as string;
      const familias = [
        { id: "f1", numero: 1, direccion: "Calle 1 #1-01", cabildoId: "c1" },
        { id: "f2", numero: 2, direccion: "Calle 1 #1-02", cabildoId: "c1" },
        { id: "f3", numero: 3, direccion: "Calle 3 #3-01", cabildoId: "c2" },
      ];
      const familia = familias.find(function(f) {
        return f.id === id;
      });
      if (familia) {
        return HttpResponse.json(familia);
      } else {
        return HttpResponse.json({ error: "Familia no encontrada" }, { status: 404 });
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

  it("listFamilias returns families without filters", async () => {
    const result = await listFamilias(BASE_URL, "test-token");
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(3);
    expect((result as any[]).map((f) => f.id)).toContain("f1");
  });

  it("listFamilias filters by search", async () => {
    const result = await listFamilias(BASE_URL, "test-token", { search: "3" });
    expect(Array.isArray(result)).toBe(true);
    expect((result as any[]).length).toBe(1);
    expect((result as any[])[0].id).toBe("f3");
  });

  it("listFamilias filters by cabildoId", async () => {
    const result = await listFamilias(BASE_URL, "test-token", { cabildoId: "c1" });
    expect(Array.isArray(result)).toBe(true);
    expect((result as any[]).length).toBe(2);
    expect((result as any[]).map((f) => f.cabildoId).every((c) => c === "c1")).toBe(true);
  });

  it("getFamilia finds existing familia", async () => {
    const result = await getFamilia(BASE_URL, "test-token", "f1");
    expect((result as Record<string, unknown>).id).toBe("f1");
    expect((result as Record<string, unknown>).numero).toBe(1);
  });

  it("getFamilia returns 404 for non-existent familia", async () => {
    await expect(getFamilia(BASE_URL, "test-token", "nonexistent"))
      .rejects
      .toMatchObject({ status: 404 });
  });
});
