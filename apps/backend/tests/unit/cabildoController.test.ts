import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

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

function mockNext() {
  return vi.fn() as NextFunction;
}

function createP2025Error(): PrismaClientKnownRequestError {
  // Create a minimal P2025 error - record not found
  const error = new PrismaClientKnownRequestError(
    "Record not found",
    { code: "P2025", clientVersion: "5.0.0" }
  );
  return error;
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
      const next = mockNext();
      await createCabildo(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockCreated);
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 400 on Zod validation error", async () => {
      const req = {
        body: { nombre: "", resguardo: "R", comunidad: "C", vigencia: 2026 },
      } as Request;

      const res = mockRes();
      const next = mockNext();
      await createCabildo(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Array) })
      );
      // Zod v4 uses .issues — verify it's a non-empty array
      const callArg = vi.mocked(res.json).mock.calls[0]?.[0] as Record<string, unknown>;
      expect(Array.isArray(callArg?.error)).toBe(true);
      expect((callArg?.error as unknown[] | undefined)?.length).toBeGreaterThan(0);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("getCabildos", () => {
    it("should return 200 and list of cabildos", async () => {
      const req = {} as Request;
      const mockList = [{ id: "cab-1", nombre: "Tatachio" }];
      vi.mocked(prisma.cabildo.findMany).mockResolvedValue(mockList as never);

      const res = mockRes();
      const next = mockNext();
      await getCabildos(req, res, next);

      expect(res.json).toHaveBeenCalledWith(mockList);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("getCabildoById", () => {
    it("should return 200 and cabildo when found", async () => {
      const req = { params: { id: "cab-1" } } as unknown as Request;
      const mockCabildo = { id: "cab-1", nombre: "Tatachio" };
      vi.mocked(prisma.cabildo.findUnique).mockResolvedValue(mockCabildo as never);

      const res = mockRes();
      const next = mockNext();
      await getCabildoById(req, res, next);

      expect(res.json).toHaveBeenCalledWith(mockCabildo);
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 404 when cabildo not found", async () => {
      const req = { params: { id: "nonexistent" } } as unknown as Request;
      vi.mocked(prisma.cabildo.findUnique).mockResolvedValue(null);

      const res = mockRes();
      const next = mockNext();
      await getCabildoById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Cabildo no encontrado" })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("updateCabildo", () => {
    it("should return 200 and updated cabildo", async () => {
      const req = {
        params: { id: "cab-1" },
        body: { nombre: "Nuevo Nombre" },
      } as unknown as Request;
      const mockUpdated = { id: "cab-1", nombre: "Nuevo Nombre" };
      vi.mocked(prisma.cabildo.update).mockResolvedValue(mockUpdated as never);

      const res = mockRes();
      const next = mockNext();
      await updateCabildo(req, res, next);

      expect(res.json).toHaveBeenCalledWith(mockUpdated);
      expect(next).not.toHaveBeenCalled();
    });

    it("should call next with PrismaClientKnownRequestError P2025 when cabildo not found", async () => {
      const req = {
        params: { id: "non-existent-id" },
        body: { nombre: "Nuevo Nombre" },
      } as unknown as Request;
      const p2025Error = createP2025Error();
      vi.mocked(prisma.cabildo.update).mockRejectedValue(p2025Error);

      const res = mockRes();
      const next = mockNext();
      await updateCabildo(req, res, next);

      expect(next).toHaveBeenCalledWith(p2025Error);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it("should return 400 on Zod validation error", async () => {
      const req = {
        params: { id: "cab-1" },
        body: { nombre: "" }, // invalid - empty string
      } as unknown as Request;

      const res = mockRes();
      const next = mockNext();
      await updateCabildo(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Array) })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("deleteCabildo", () => {
    it("should return 204 on successful delete", async () => {
      const req = { params: { id: "cab-1" } } as unknown as Request;
      vi.mocked(prisma.cabildo.delete).mockResolvedValue({} as never);

      const res = mockRes();
      const next = mockNext();
      await deleteCabildo(req, res, next);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it("should call next with PrismaClientKnownRequestError P2025 when cabildo not found", async () => {
      const req = { params: { id: "non-existent-id" } } as unknown as Request;
      const p2025Error = createP2025Error();
      vi.mocked(prisma.cabildo.delete).mockRejectedValue(p2025Error);

      const res = mockRes();
      const next = mockNext();
      await deleteCabildo(req, res, next);

      expect(next).toHaveBeenCalledWith(p2025Error);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
      expect(res.send).not.toHaveBeenCalled();
    });
  });
});
