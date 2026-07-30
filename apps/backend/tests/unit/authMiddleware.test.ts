import { describe, it, expect, vi } from "vitest";
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { authMiddleware, isAdmin, isCaptain } from "../../src/middleware/authMiddleware.js";

// Helper to create mock req/res/next
function mockReq(token?: string, rol?: string): Request {
  const req = {
    headers: {} as Record<string, string>,
    usuario: undefined as { id: string; rol: string } | undefined,
  } as unknown as Request;

  if (token) {
    req.headers.authorization = `Bearer ${token}`;
  }

  // If rol is provided, we can inject usuario directly for role-middleware tests
  if (rol) {
    req.usuario = { id: "user-uuid", rol };
  }

  return req;
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

describe("authMiddleware", () => {
  it("should return 401 when no token provided", () => {
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("Token") })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("should call next() for valid token", () => {
    const token = jwt.sign(
      { id: "user-1", rol: "ADMINISTRATOR" },
      process.env.JWT_SECRET || "test-secret"
    );
    const req = mockReq(token);
    const res = mockRes();
    const next = mockNext();

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.usuario).toBeDefined();
    expect(req.usuario?.rol).toBe("ADMINISTRATOR");
  });
});

describe("isAdmin", () => {
  it("should return 403 for non-admin role", () => {
    const req = mockReq(undefined, "CAPTAIN");
    const res = mockRes();
    const next = mockNext();

    isAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("Acceso denegado") })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("should call next() for ADMINISTRATOR role", () => {
    const req = mockReq(undefined, "ADMINISTRATOR");
    const res = mockRes();
    const next = mockNext();

    isAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe("isCaptain", () => {
  it("should call next() for CAPTAIN role", () => {
    const req = mockReq(undefined, "CAPTAIN");
    const res = mockRes();
    const next = mockNext();

    isCaptain(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("should call next() for ADMINISTRATOR role (superset)", () => {
    const req = mockReq(undefined, "ADMINISTRATOR");
    const res = mockRes();
    const next = mockNext();

    isCaptain(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("should return 403 for unauthorized role", () => {
    const req = mockReq(undefined, "INVITADO");
    const res = mockRes();
    const next = mockNext();

    isCaptain(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("Acceso denegado") })
    );
    expect(next).not.toHaveBeenCalled();
  });
});
