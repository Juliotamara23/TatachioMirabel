import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response } from "express";

// Mock Prisma before importing the controller
vi.mock("../../src/database.js", () => ({
  default: {
    cabildo: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import prisma from "../../src/database.js";
import {
  createCabildo,
  getCabildos,
  getCabildoById,
  updateCabildo,
  deleteCabildo,
} from "../../src/controllers/cabildoController.js";

function mockRes() {
  const res: Partial<Response> = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return res as Response;
}

describe("cabildoController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createCabildo", () => {
    it("should return 201 and created cabildo on valid input", async () => {
      const req = {
        body: {
          nombre: "Cabildo Sol",
          resguardo: "Resguardo Test",
          comunidad: "Comunidad Test",
          vigencia: 2026,
        },
      } as Request;

      const mockCreated = { id: "cab-1", ...req.body, createdAt: new Date() };
      vi.mocked(prisma.cabildo.create).mockResolvedValue(mockCreated);

      const res = mockRes();
      await createCabildo(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockCreated);
    });

    it("should return 400 on Zod validation error", async () => {
      const req = {
        body: { nombre: "", resguardo: "R", comunidad: "C", vigencia: 2026 },
      } as Request;

      const res = mockRes();
      await createCabildo(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Array) })
      );
      // Zod v4 uses .issues — verify it's a non-empty array
      const callArg = vi.mocked(res.json).mock.calls[0]?.[0] as any;
      expect(Array.isArray(callArg?.error)).toBe(true);
      expect(callArg?.error?.length).toBeGreaterThan(0);
    });
  });

  describe("getCabildos", () => {
    it("should return 200 and list of cabildos", async () => {
      const req = {} as Request;
      const mockList = [{ id: "cab-1", nombre: "Tatachio" }];
      vi.mocked(prisma.cabildo.findMany).mockResolvedValue(mockList as any);

      const res = mockRes();
      await getCabildos(req, res);

      expect(res.json).toHaveBeenCalledWith(mockList);
    });
  });

  describe("getCabildoById", () => {
    it("should return 200 and cabildo when found", async () => {
      const req = { params: { id: "cab-1" } } as unknown as Request;
      const mockCabildo = { id: "cab-1", nombre: "Tatachio" };
      vi.mocked(prisma.cabildo.findUnique).mockResolvedValue(mockCabildo as any);

      const res = mockRes();
      await getCabildoById(req, res);

      expect(res.json).toHaveBeenCalledWith(mockCabildo);
    });

    it("should return 404 when cabildo not found", async () => {
      const req = { params: { id: "nonexistent" } } as unknown as Request;
      vi.mocked(prisma.cabildo.findUnique).mockResolvedValue(null);

      const res = mockRes();
      await getCabildoById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Cabildo no encontrado" })
      );
    });
  });

  describe("updateCabildo", () => {
    it("should return 200 and updated cabildo", async () => {
      const req = {
        params: { id: "cab-1" },
        body: { nombre: "Nuevo Nombre" },
      } as unknown as Request;
      const mockUpdated = { id: "cab-1", nombre: "Nuevo Nombre" };
      vi.mocked(prisma.cabildo.update).mockResolvedValue(mockUpdated as any);

      const res = mockRes();
      await updateCabildo(req, res);

      expect(res.json).toHaveBeenCalledWith(mockUpdated);
    });
  });

  describe("deleteCabildo", () => {
    it("should return 204 on successful delete", async () => {
      const req = { params: { id: "cab-1" } } as unknown as Request;
      vi.mocked(prisma.cabildo.delete).mockResolvedValue({} as any);

      const res = mockRes();
      await deleteCabildo(req, res);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });
  });
});
