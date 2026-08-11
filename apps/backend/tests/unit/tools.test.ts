import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mock Prisma BEFORE any module that imports it ──────────────────
vi.mock("../../src/database.js", () => ({
  default: {
    miembro: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      groupBy: vi.fn(),
      count: vi.fn(),
    },
    familia: {
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    cabildo: {
      findFirst: vi.fn(),
    },
    reporte: {
      findUnique: vi.fn(),
    },
  },
}));

// ── Imports under test ─────────────────────────────────────────────
import prisma from "../../src/database.js";
import { ALL_TOOLS, getToolsForRole } from "../../src/services/tools/index.js";
import { searchMiembrosTool } from "../../src/services/tools/searchMiembros.js";
import { getMiembroByIdTool } from "../../src/services/tools/getMiembroById.js";
import { getFamiliaMembersTool } from "../../src/services/tools/getFamiliaMembers.js";
import { getCabildoStatsTool } from "../../src/services/tools/getCabildoStats.js";
import { getReporteDataTool } from "../../src/services/tools/getReporteData.js";

describe("AI Tool Definitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset default resolved values
    vi.mocked(prisma.miembro.findMany).mockResolvedValue([]);
    vi.mocked(prisma.miembro.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.miembro.groupBy).mockResolvedValue([]);
    vi.mocked(prisma.miembro.count).mockResolvedValue(0);
    vi.mocked(prisma.familia.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.familia.count).mockResolvedValue(0);
    vi.mocked(prisma.cabildo.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.reporte.findUnique).mockResolvedValue(null);
  });

  // ── Tool existence and shape ───────────────────────────────

  describe("Tool definitions exist", () => {
    const tools = [
      { name: "searchMiembros", tool: searchMiembrosTool },
      { name: "getMiembroById", tool: getMiembroByIdTool },
      { name: "getFamiliaMembers", tool: getFamiliaMembersTool },
      { name: "getCabildoStats", tool: getCabildoStatsTool },
      { name: "getReporteData", tool: getReporteDataTool },
    ];

    for (const { name, tool } of tools) {
      it(`${name} is defined with description and inputSchema`, () => {
        expect(tool).toBeDefined();
        expect(tool.description).toBeTypeOf("string");
        expect(tool.description!.length).toBeGreaterThan(0);
        expect(tool.inputSchema).toBeDefined();
      });

      it(`${name} inputSchema is a Zod schema`, () => {
        // Zod v4 schemas have a safeParse method
        expect(typeof tool.inputSchema.safeParse).toBe("function");
      });
    }
  });

  // ── Parameter validation ──────────────────────────────────────

  describe("searchMiembrosTool inputSchema", () => {
    it("accepts valid input with required query", () => {
      const result = searchMiembrosTool.inputSchema.safeParse({
        query: "Garcia",
      });
      expect(result.success).toBe(true);
    });

    it("accepts optional limit", () => {
      const result = searchMiembrosTool.inputSchema.safeParse({
        query: "Garcia",
        limit: 5,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(5);
      }
    });

    it("rejects missing query", () => {
      const result = searchMiembrosTool.inputSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("rejects empty query string", () => {
      const result = searchMiembrosTool.inputSchema.safeParse({
        query: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("getMiembroByIdTool inputSchema", () => {
    it("accepts valid uuid id", () => {
      const result = getMiembroByIdTool.inputSchema.safeParse({
        id: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing id", () => {
      const result = getMiembroByIdTool.inputSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("getFamiliaMembersTool inputSchema", () => {
    it("accepts valid familiaId", () => {
      const result = getFamiliaMembersTool.inputSchema.safeParse({
        familiaId: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("getCabildoStatsTool inputSchema", () => {
    it("accepts empty params (cabildoId is optional)", () => {
      const result = getCabildoStatsTool.inputSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("accepts optional cabildoId", () => {
      const result = getCabildoStatsTool.inputSchema.safeParse({
        cabildoId: "test-cabildo-id",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("getReporteDataTool inputSchema", () => {
    it("accepts valid reporteId", () => {
      const result = getReporteDataTool.inputSchema.safeParse({
        reporteId: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing reporteId", () => {
      const result = getReporteDataTool.inputSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  // ── Execute functions ─────────────────────────────────────────

  describe("searchMiembrosTool execute", () => {
    it("runs Prisma findMany with OR filter", async () => {
      await searchMiembrosTool.execute!({ query: "GARCIA", limit: 10 });

      expect(prisma.miembro.findMany).toHaveBeenCalledOnce();
      expect(prisma.miembro.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ activo: true }),
          take: 10,
        })
      );
    });

    it("returns formatted members array", async () => {
      vi.mocked(prisma.miembro.findMany).mockResolvedValue([
        {
          id: "m1",
          nombres: "ANA",
          apellidos: "PEREZ",
          numeroDocumento: "123",
          sexo: "F",
          fechaNacimiento: "01/01/1990",
          familia: { numero: 5, direccion: "Calle 1" },
          cabildo: { nombre: "Tatachio" },
        },
      ]);

      const result = await searchMiembrosTool.execute!({
        query: "ANA",
        limit: 10,
      });

      expect(result.encontrados).toBe(1);
      expect(result.miembros[0].nombre).toBe("ANA PEREZ");
    });
  });

  describe("getMiembroByIdTool execute", () => {
    it("runs Prisma findUnique with include", async () => {
      await getMiembroByIdTool.execute!({
        id: "m1",
      });

      expect(prisma.miembro.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "m1" },
        })
      );
    });
  });

  describe("getFamiliaMembersTool execute", () => {
    it("runs Prisma findMany filtered by familiaId", async () => {
      // The tool first looks up the familia via findUnique
      vi.mocked(prisma.familia.findUnique).mockResolvedValue({
        id: "f1",
        numero: 5,
        direccion: "Calle 1",
        cabildo: { id: "c1", nombre: "Tatachio" },
      } as never);

      await getFamiliaMembersTool.execute!({
        familiaId: "f1",
      });

      expect(prisma.miembro.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ familiaId: "f1" }),
        })
      );
    });
  });

  describe("getCabildoStatsTool execute", () => {
    it("queries stats for first cabildo when no cabildoId", async () => {
      // Mock the cabildo lookup so stats queries actually execute
      vi.mocked(prisma.cabildo.findFirst).mockResolvedValue({
        id: "c1",
      } as never);

      await getCabildoStatsTool.execute!({});

      // Should at least attempt to query miembros
      expect(prisma.miembro.count).toHaveBeenCalled();
    });

    it("queries stats for specific cabildo when cabildoId provided", async () => {
      vi.mocked(prisma.cabildo.findFirst).mockResolvedValue({
        id: "c1",
      } as never);

      await getCabildoStatsTool.execute!({ cabildoId: "c1" });

      expect(prisma.miembro.count).toHaveBeenCalled();
    });
  });

  describe("getReporteDataTool execute", () => {
    it("runs Prisma reporte.findUnique with miembros", async () => {
      await getReporteDataTool.execute!({ reporteId: "r1" });

      expect(prisma.reporte.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "r1" },
        })
      );
    });
  });

  // ── Role-based tool gating ────────────────────────────────────

  describe("getToolsForRole", () => {
    it("returns all 5 tools for ADMINISTRATOR", () => {
      const tools = getToolsForRole("ADMINISTRATOR");
      const names = Object.keys(tools);
      expect(names).toHaveLength(5);
      expect(names).toContain("searchMiembros");
      expect(names).toContain("getMiembroById");
      expect(names).toContain("getFamiliaMembers");
      expect(names).toContain("getCabildoStats");
      expect(names).toContain("getReporteData");
    });

    it("returns only 4 tools for CAPTAIN (no getReporteData)", () => {
      const tools = getToolsForRole("CAPTAIN");
      const names = Object.keys(tools);
      expect(names).toHaveLength(4);
      expect(names).toContain("searchMiembros");
      expect(names).toContain("getMiembroById");
      expect(names).toContain("getFamiliaMembers");
      expect(names).toContain("getCabildoStats");
      expect(names).not.toContain("getReporteData");
    });

    it("returns empty object for unknown role", () => {
      const tools = getToolsForRole("INVITADO");
      expect(Object.keys(tools)).toHaveLength(0);
    });
  });

  // ── ALL_TOOLS registry ────────────────────────────────────────

  describe("ALL_TOOLS", () => {
    it("contains all five tool definitions", () => {
      expect(ALL_TOOLS.searchMiembros).toBeDefined();
      expect(ALL_TOOLS.getMiembroById).toBeDefined();
      expect(ALL_TOOLS.getFamiliaMembers).toBeDefined();
      expect(ALL_TOOLS.getCabildoStats).toBeDefined();
      expect(ALL_TOOLS.getReporteData).toBeDefined();
    });
  });
});
