import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

// Mock Prisma before importing the controller
vi.mock("../../src/database.js", () => ({
  default: {
    cabildo: {
      findUnique: vi.fn(),
    },
    familia: {
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
  createFamilia,
  getFamilias,
  getFamiliaById,
  updateFamilia,
  deleteFamilia,
} from "../../src/controllers/familiaController.js";

function mockRes() {
  const res: Partial<Response> = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return res as Response;
}

function mockNext() {
  return vi.fn() as NextFunction;
}

function makeP2025Error(): PrismaClientKnownRequestError {
  return new PrismaClientKnownRequestError(
    "Record not found",
    { code: "P2025", clientVersion: "5.0.0" },
    undefined
  );
}

describe("familiaController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createFamilia", () => {
    it("should return 201 when cabildo exists", async () => {
      const req = {
        body: {
          numero: 1,
          direccion: "Calle 10 #5-20",
          cabildoId: "550e8400-e29b-41d4-a716-446655440000",
        },
      } as Request;

      vi.mocked(prisma.cabildo.findUnique).mockResolvedValue({ id: "cab-1" } as never);
      const mockFamilia = { id: "fam-1", ...req.body };
      vi.mocked(prisma.familia.create).mockResolvedValue(mockFamilia as never);

      const res = mockRes();
      await createFamilia(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockFamilia);
    });

    it("should return 404 when cabildo does not exist", async () => {
      const req = {
        body: {
          numero: 1,
          cabildoId: "550e8400-e29b-41d4-a716-446655440000",
        },
      } as Request;

      vi.mocked(prisma.cabildo.findUnique).mockResolvedValue(null);

      const res = mockRes();
      await createFamilia(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Cabildo no encontrado" })
      );
    });

    it("should return 400 on Zod validation error", async () => {
      const req = {
        body: { numero: -1, cabildoId: "not-a-uuid" },
      } as Request;

      const res = mockRes();
      await createFamilia(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Array) })
      );
      const callArg = vi.mocked(res.json).mock.calls[0]?.[0] as Record<string, unknown>;
      expect(Array.isArray(callArg?.error)).toBe(true);
      expect((callArg?.error as unknown[] | undefined)?.length).toBeGreaterThan(0);
    });
  });

  describe("getFamilias", () => {
    it("should return 200 and list of familias", async () => {
      const req = { query: {} } as unknown as Request;
      const mockList = [{ id: "fam-1", numero: 1 }];
      vi.mocked(prisma.familia.findMany).mockResolvedValue(mockList as never);

      const res = mockRes();
      await getFamilias(req, res);

      expect(res.json).toHaveBeenCalledWith(mockList);
    });

    it("should add OR search filter when ?search is provided", async () => {
      const req = { query: { search: "Calle" } } as unknown as Request;
      vi.mocked(prisma.familia.findMany).mockResolvedValue([] as never);

      const res = mockRes();
      await getFamilias(req, res);

      const callArg = vi.mocked(prisma.familia.findMany).mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(callArg.where).toHaveProperty("OR");
      const orConditions = callArg.where.OR as Record<string, unknown>[];
      expect(Array.isArray(orConditions)).toBe(true);
      // direccion and telefono must both be searched
      expect(orConditions).toEqual(
        expect.arrayContaining([
          { direccion: { contains: "Calle" } },
          { telefono: { contains: "Calle" } },
        ])
      );
      // String search must NOT add a numero condition
      expect(orConditions).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ numero: expect.anything() })])
      );
    });

    it("should include numero exact match when search parses as integer", async () => {
      const req = { query: { search: "42" } } as unknown as Request;
      vi.mocked(prisma.familia.findMany).mockResolvedValue([] as never);

      const res = mockRes();
      await getFamilias(req, res);

      const callArg = vi.mocked(prisma.familia.findMany).mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      const orConditions = callArg.where.OR as Record<string, unknown>[];
      expect(orConditions).toEqual(
        expect.arrayContaining([{ numero: { equals: 42 } }])
      );
      // String conditions must still be present
      expect(orConditions).toEqual(
        expect.arrayContaining([
          { direccion: { contains: "42" } },
          { telefono: { contains: "42" } },
        ])
      );
    });

    it("should NOT add search filter when ?search is empty", async () => {
      const req = { query: { search: "" } } as unknown as Request;
      vi.mocked(prisma.familia.findMany).mockResolvedValue([] as never);

      const res = mockRes();
      await getFamilias(req, res);

      const callArg = vi.mocked(prisma.familia.findMany).mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(callArg.where).not.toHaveProperty("OR");
    });

    it("should keep captain scope when search is combined with JWT", async () => {
      const req = {
        query: { search: "Calle" },
        usuario: { rol: "CAPTAIN", cabildoId: "cab-jwt" },
      } as unknown as Request;
      vi.mocked(prisma.familia.findMany).mockResolvedValue([] as never);

      const res = mockRes();
      await getFamilias(req, res);

      const callArg = vi.mocked(prisma.familia.findMany).mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      // JWT cabildoId wins (CAPTAIN scope)
      expect(callArg.where).toHaveProperty("cabildoId", "cab-jwt");
      expect(callArg.where).toHaveProperty("OR");
    });
  });

  describe("getFamiliaById", () => {
    it("should return 200 when familia found", async () => {
      const req = { params: { id: "fam-1" } } as unknown as Request;
      const mockFamilia = { id: "fam-1", numero: 1 };
      vi.mocked(prisma.familia.findUnique).mockResolvedValue(mockFamilia as never);

      const res = mockRes();
      await getFamiliaById(req, res);

      expect(res.json).toHaveBeenCalledWith(mockFamilia);
    });

    it("should return 404 when familia not found", async () => {
      const req = { params: { id: "nonexistent" } } as unknown as Request;
      vi.mocked(prisma.familia.findUnique).mockResolvedValue(null);

      const res = mockRes();
      await getFamiliaById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Familia no encontrada" })
      );
    });
  });

  describe("deleteFamilia", () => {
    it("should return 204 on successful delete", async () => {
      const req = { params: { id: "fam-1" } } as unknown as Request;
      vi.mocked(prisma.familia.delete).mockResolvedValue({} as never);

      const res = mockRes();
      await deleteFamilia(req, res);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it("should call next with P2025 error when familia not found", async () => {
      const req = { params: { id: "non-existent-uuid" } } as unknown as Request;
      const p2025 = makeP2025Error();
      vi.mocked(prisma.familia.delete).mockRejectedValue(p2025);

      const res = mockRes();
      const next = mockNext();
      await deleteFamilia(req, res, next);

      expect(next).toHaveBeenCalledWith(p2025);
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe("updateFamilia", () => {
    it("should return 200 on successful update", async () => {
      const req = {
        params: { id: "fam-1" },
        body: { numero: 2 },
      } as unknown as Request;
      const updatedFamilia = { id: "fam-1", numero: 2, direccion: "Calle 10", cabildoId: "cab-1" };
      vi.mocked(prisma.familia.update).mockResolvedValue(updatedFamilia as never);

      const res = mockRes();
      await updateFamilia(req, res);

      expect(res.json).toHaveBeenCalledWith(updatedFamilia);
    });

    it("should call next with P2025 error when familia not found", async () => {
      const req = {
        params: { id: "non-existent-uuid" },
        body: { numero: 2 },
      } as unknown as Request;
      const p2025 = makeP2025Error();
      vi.mocked(prisma.familia.update).mockRejectedValue(p2025);

      const res = mockRes();
      const next = mockNext();
      await updateFamilia(req, res, next);

      expect(next).toHaveBeenCalledWith(p2025);
      expect(res.status).not.toHaveBeenCalled();
    });

    it("should return 400 on Zod validation error", async () => {
      const req = {
        params: { id: "fam-1" },
        body: { numero: -1 },
      } as unknown as Request;

      const res = mockRes();
      await updateFamilia(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Array) })
      );
    });
  });
});
