import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response } from "express";

const mockTxUsuario = {
  create: vi.fn(),
};
const mockTxUsuarioCabildo = {
  create: vi.fn(),
};

// Mock Prisma before importing the controller — $transaction is a function
// that receives a callback and returns whatever the callback returns, so we
// can test atomicity by invoking the callback directly.
vi.mock("../../src/database.js", () => ({
  default: {
    cabildo: { findUnique: vi.fn() },
    usuario: { findUnique: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ usuario: mockTxUsuario, usuarioCabildo: mockTxUsuarioCabildo })
    ),
  },
}));

vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn().mockResolvedValue("hashed-password") },
}));

import prisma from "../../src/database.js";
import { register } from "../../src/controllers/authController.js";

function mockRes() {
  const res: Partial<Response> = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return res as Response;
}

describe("authController.register (issue #72)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when CAPTAIN is registered without cabildoId", async () => {
    const req = {
      body: { email: "c@test.com", password: "pw", nombre: "Cap", rol: "CAPTAIN" },
    } as unknown as Request;
    const res = mockRes();

    await register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("cabildoId") })
    );
    // No DB writes should happen
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns 400 when CAPTAIN is registered with a non-existent cabildoId", async () => {
    const req = {
      body: { email: "c@test.com", password: "pw", nombre: "Cap", rol: "CAPTAIN", cabildoId: "fake-id" },
    } as unknown as Request;
    const res = mockRes();

    vi.mocked(prisma.cabildo.findUnique).mockResolvedValue(null);

    await register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("Cabildo not found") })
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns 400 when ADMINISTRATOR is registered with cabildoId (issue #72)", async () => {
    const req = {
      body: { email: "a@test.com", password: "pw", nombre: "Admin", rol: "ADMINISTRATOR", cabildoId: "cab-1" },
    } as unknown as Request;
    const res = mockRes();

    await register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("ADMINISTRATOR cannot have a cabildo") })
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns 400 when rol is not CAPTAIN or ADMINISTRATOR (R1-003, issue #72)", async () => {
    const req = {
      body: { email: "x@test.com", password: "pw", nombre: "X", rol: "SUPERUSER", cabildoId: "cab-1" },
    } as unknown as Request;
    const res = mockRes();

    await register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("Invalid rol") })
    );
    // No DB lookups or writes should happen for an unknown role
    expect(prisma.cabildo.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("creates user + assignment atomically via $transaction for valid CAPTAIN (issue #72)", async () => {
    const req = {
      body: { email: "c@test.com", password: "pw", nombre: "Cap", rol: "CAPTAIN", cabildoId: "cab-1" },
    } as unknown as Request;
    const res = mockRes();

    vi.mocked(prisma.cabildo.findUnique).mockResolvedValue({
      id: "cab-1", nombre: "Test", resguardo: "R", comunidad: "C", vigencia: 2026,
      activo: true, createdAt: new Date(), updatedAt: new Date(),
    });
    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null);

    const createdUser = {
      id: "usr-1", email: "c@test.com", nombre: "Cap", rol: "CAPTAIN",
      activo: true, createdAt: new Date(), updatedAt: new Date(),
    };
    mockTxUsuario.create.mockResolvedValue(createdUser);
    mockTxUsuarioCabildo.create.mockResolvedValue({ usuarioId: "usr-1", cabildoId: "cab-1", rolEnCabildo: "CAPTAIN" });

    await register(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockTxUsuario.create).toHaveBeenCalledTimes(1);
    expect(mockTxUsuarioCabildo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ usuarioId: "usr-1", cabildoId: "cab-1" }),
      })
    );
    // Never leak passwordHash
    const body = vi.mocked(res.json).mock.calls[0][0];
    expect(body).not.toHaveProperty("passwordHash");
  });

  it("does NOT create assignment for ADMINISTRATOR (no cabildoId)", async () => {
    const req = {
      body: { email: "a@test.com", password: "pw", nombre: "Admin", rol: "ADMINISTRATOR" },
    } as unknown as Request;
    const res = mockRes();

    vi.mocked(prisma.usuario.findUnique).mockResolvedValue(null);
    const createdUser = {
      id: "usr-1", email: "a@test.com", nombre: "Admin", rol: "ADMINISTRATOR",
      activo: true, createdAt: new Date(), updatedAt: new Date(),
    };
    mockTxUsuario.create.mockResolvedValue(createdUser);

    await register(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockTxUsuario.create).toHaveBeenCalledTimes(1);
    // Assignment should NOT be created for ADMINISTRATOR
    expect(mockTxUsuarioCabildo.create).not.toHaveBeenCalled();
  });

  it("returns 409 when email already exists", async () => {
    const req = {
      body: { email: "dup@test.com", password: "pw", nombre: "Dup", rol: "ADMINISTRATOR" },
    } as unknown as Request;
    const res = mockRes();

    vi.mocked(prisma.usuario.findUnique).mockResolvedValue({
      id: "existing", email: "dup@test.com", passwordHash: "h", nombre: "Existing",
      rol: "ADMINISTRATOR", activo: true, createdAt: new Date(), updatedAt: new Date(),
    });

    await register(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
