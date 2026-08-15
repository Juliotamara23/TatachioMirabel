import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response } from "express";

// Mock Prisma before importing the controller. removeCapitana now uses a
// single atomic $executeRaw DELETE (count guard inside the same statement),
// so the mock only needs $executeRaw plus findUnique for the 404 path.
vi.mock("../../src/database.js", () => {
  return {
    default: {
      usuario: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      usuarioCabildo: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      $executeRaw: vi.fn(),
    },
  };
});

import prisma from "../../src/database.js";
import {
  removeCapitana,
  listCaptains,
} from "../../src/controllers/adminController.js";

function mockRes() {
  const res: Partial<Response> = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return res as Response;
}

describe("adminController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── removeCapitana ──────────────────────────────────────────────────────

  describe("removeCapitana", () => {
    it("returns 404 when assignment does not exist", async () => {
      const req = {
        params: { cabildoId: "cab-1", usuarioId: "usr-1" },
      } as unknown as Request;
      const res = mockRes();

      vi.mocked(prisma.usuarioCabildo.findUnique).mockResolvedValue(null);

      await removeCapitana(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it("returns 409 when trying to remove the last captain of a cabildo (issue #72)", async () => {
      const req = {
        params: { cabildoId: "cab-1", usuarioId: "usr-1" },
      } as unknown as Request;
      const res = mockRes();

      vi.mocked(prisma.usuarioCabildo.findUnique).mockResolvedValue({
        usuarioId: "usr-1",
        cabildoId: "cab-1",
        rolEnCabildo: "CAPTAIN",
      });
      // The atomic DELETE affects 0 rows → cabildo would be left without captain
      vi.mocked(prisma.$executeRaw).mockResolvedValue(0);

      await removeCapitana(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "El cabildo debe tener al menos una capitana" })
      );
    });

    it("returns 204 when removing a non-last captain (issue #72)", async () => {
      const req = {
        params: { cabildoId: "cab-1", usuarioId: "usr-1" },
      } as unknown as Request;
      const res = mockRes();

      vi.mocked(prisma.usuarioCabildo.findUnique).mockResolvedValue({
        usuarioId: "usr-1",
        cabildoId: "cab-1",
        rolEnCabildo: "CAPTAIN",
      });
      // Atomic DELETE affected 1 row — removal succeeded
      vi.mocked(prisma.$executeRaw).mockResolvedValue(1);

      await removeCapitana(req, res);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    });
  });

  // ── listCaptains ────────────────────────────────────────────────────────

  describe("listCaptains", () => {
    it("returns 200 with all captains when cabildoId is omitted (issue #72)", async () => {
      const req = { query: {} } as unknown as Request;
      const res = mockRes();

      const fakeCaptains = [
        {
          id: "usr-1",
          email: "c1@test.com",
          nombre: "Captain 1",
          activo: true,
          cabildos: [{ cabildoId: "cab-1" }],
        },
        {
          id: "usr-2",
          email: "c2@test.com",
          nombre: "Captain 2",
          activo: true,
          cabildos: [], // unassigned zombie captain
        },
      ];
      vi.mocked(prisma.usuario.findMany).mockResolvedValue(fakeCaptains);

      await listCaptains(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const payload = vi.mocked(res.json).mock.calls[0][0];
      expect(payload).toEqual([
        { id: "usr-1", email: "c1@test.com", nombre: "Captain 1", activo: true, cabildoId: "cab-1" },
        { id: "usr-2", email: "c2@test.com", nombre: "Captain 2", activo: true, cabildoId: null },
      ]);
      // Ensure cabildos array (internal) is not leaked
      expect(payload[0]).not.toHaveProperty("cabildos");
    });

    it("filters by cabildoId when query param is provided (issue #72)", async () => {
      const req = { query: { cabildoId: "cab-1" } } as unknown as Request;
      const res = mockRes();

      vi.mocked(prisma.usuario.findMany).mockResolvedValue([
        {
          id: "usr-1",
          email: "c1@test.com",
          nombre: "Captain 1",
          activo: true,
          cabildos: [{ cabildoId: "cab-1" }],
        },
      ]);

      await listCaptains(req, res);

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { rol: "CAPTAIN", cabildos: { some: { cabildoId: "cab-1" } } },
        })
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("never includes passwordHash in the response (issue #72)", async () => {
      const req = { query: {} } as unknown as Request;
      const res = mockRes();

      vi.mocked(prisma.usuario.findMany).mockResolvedValue([
        {
          id: "usr-1",
          email: "c1@test.com",
          nombre: "Captain 1",
          activo: true,
          cabildos: [{ cabildoId: "cab-1" }],
        },
      ]);

      await listCaptains(req, res);

      const payload = vi.mocked(res.json).mock.calls[0][0];
      for (const c of payload) {
        expect(c).not.toHaveProperty("passwordHash");
      }
    });
  });
});
