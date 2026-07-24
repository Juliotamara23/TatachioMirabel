import { describe, it, expect, vi } from "vitest";
import { Request, Response, NextFunction } from "express";
import { errorHandler } from "../../src/middleware/errorHandler.js";

function mockReq(): Request {
  return {} as Request;
}

function mockRes() {
  const res: Partial<Response> = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as Response;
}

function mockNext(): NextFunction {
  return vi.fn();
}

describe("errorHandler", () => {
  it("should return 500 for generic Error", () => {
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();
    const err = new Error("Something broke");

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Error interno del servidor" })
    );
  });

  it("should return 409 for Prisma P2002 (unique constraint)", () => {
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();
    const err: any = new Error("Unique constraint failed");
    err.code = "P2002";

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Ya existe un registro con esos datos",
      })
    );
  });

  it("should return 404 for Prisma P2025 (record not found)", () => {
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();
    const err: any = new Error("Record to delete does not exist");
    err.code = "P2025";

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Registro no encontrado",
      })
    );
  });

  it("should return 400 for Prisma P2003 (foreign key constraint)", () => {
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();
    const err: any = new Error("Foreign key constraint failed");
    err.code = "P2003";

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Referencia inválida: el registro relacionado no existe",
      })
    );
  });

  it("should return 500 for unknown Prisma error codes", () => {
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();
    const err: any = new Error("Some other Prisma error");
    err.code = "P9999";

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Error interno del servidor" })
    );
  });
});
