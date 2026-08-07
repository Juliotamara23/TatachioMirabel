import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response } from "express";
import { createMember, getMembers, getMemberById, updateMember, deleteMember } from "../../src/controllers/memberController.js";
import { memberSchema } from "@tatachio/shared";

// Mock Prisma
vi.mock("../../src/database.js", () => ({
  default: {
    miembro: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import prisma from "../../src/database.js";

describe("member routes (refactored)", () => {
  it("should export an Express Router", async () => {
    const module = await import("../../src/routes/member.js");
    const router = module.default;

    expect(router).toBeDefined();
    expect(typeof router.use).toBe("function");
  });

  it("should NOT have isAdmin as global middleware (per-route instead)", async () => {
    // After refactor, isAdmin should be applied per-route, not globally via router.use
    const module = await import("../../src/routes/member.js");
    const router = module.default;

    // Check that authMiddleware is still applied globally
    const useLayers = router.stack.filter((layer: { route?: unknown }) => !layer.route);
    expect(useLayers.length).toBe(1); // Only authMiddleware as global
  });

  it("should have GET, POST, PUT, DELETE routes defined", async () => {
    const module = await import("../../src/routes/member.js");
    const router = module.default;

    const routeLayers = router.stack.filter((layer: { route?: unknown }) => layer.route);
    const methods = routeLayers.flatMap((r: { route?: { methods?: Record<string, unknown> } }) => Object.keys(r.route?.methods ?? {}));

    expect(methods).toContain("get");
    expect(methods).toContain("post");
    expect(methods).toContain("put");
    expect(methods).toContain("delete");
  });
});

describe("memberController.createMember", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockJson: ReturnType<typeof vi.fn>;
  let mockStatus: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockJson = vi.fn().mockReturnThis();
    mockStatus = vi.fn().mockReturnValue({ json: mockJson });
    mockReq = {
      body: {},
      usuario: undefined,
    };
    mockRes = {
      status: mockStatus,
      json: mockJson,
    };
  });

  const validMemberBody = {
    tipoIdentificacion: "CC",
    numeroDocumento: "12345678",
    nombres: "Juan",
    apellidos: "Perez",
    fechaNacimiento: "01/01/1990",
    parentesco: "PA",
    sexo: "M",
    integrantes: 3,
    familiaId: "123e4567-e89b-12d3-a456-426614174000",
  };

  // Valid UUIDs (version 4, variant 1)
  const jwtCabildoId = "11111111-1111-4111-8111-111111111111";
  const otherCabildoId = "22222222-2222-4222-8222-222222222222";

  it("AC1: CAPTAIN without cabildoId in body → 201 with cabildoId from JWT", async () => {
    mockReq.body = validMemberBody;
    mockReq.usuario = { id: "user-1", rol: "CAPTAIN", cabildoId: jwtCabildoId };
    (prisma.miembro.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "member-1",
      ...validMemberBody,
      cabildoId: jwtCabildoId,
    });

    await createMember(mockReq as Request, mockRes as Response);

    expect(mockStatus).toHaveBeenCalledWith(201);
    expect(prisma.miembro.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cabildoId: jwtCabildoId,
        }),
      })
    );
  });

  it("AC2: CAPTAIN with conflicting cabildoId → 403", async () => {
    mockReq.body = { ...validMemberBody, cabildoId: otherCabildoId };
    mockReq.usuario = { id: "user-1", rol: "CAPTAIN", cabildoId: jwtCabildoId };

    await createMember(mockReq as Request, mockRes as Response);

    expect(mockStatus).toHaveBeenCalledWith(403);
    expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.stringContaining("cabildoId"),
    }));
    expect(prisma.miembro.create).not.toHaveBeenCalled();
  });

  it("AC3: CAPTAIN with matching cabildoId → 201", async () => {
    mockReq.body = { ...validMemberBody, cabildoId: jwtCabildoId };
    mockReq.usuario = { id: "user-1", rol: "CAPTAIN", cabildoId: jwtCabildoId };
    (prisma.miembro.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "member-1",
      ...validMemberBody,
      cabildoId: jwtCabildoId,
    });

    await createMember(mockReq as Request, mockRes as Response);

    expect(mockStatus).toHaveBeenCalledWith(201);
    expect(prisma.miembro.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cabildoId: jwtCabildoId,
        }),
      })
    );
  });

  it("ADMIN without cabildoId → 400 (required for ADMIN)", async () => {
    mockReq.body = validMemberBody;
    mockReq.usuario = { id: "user-1", rol: "ADMINISTRATOR", cabildoId: null };

    await createMember(mockReq as Request, mockRes as Response);

    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(prisma.miembro.create).not.toHaveBeenCalled();
  });
});

describe("memberController.getMembers", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockJson: ReturnType<typeof vi.fn>;
  let mockStatus: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockJson = vi.fn().mockReturnThis();
    mockStatus = vi.fn().mockReturnValue({ json: mockJson });
    mockReq = {
      query: {},
      usuario: undefined,
    };
    mockRes = {
      status: mockStatus,
      json: mockJson,
    };
  });

  // Valid UUIDs (version 4, variant 1)
  const jwtCabildoId = "11111111-1111-4111-8111-111111111111";
  const otherCabildoId = "22222222-2222-4222-8222-222222222222";

  it("AC5: ADMIN with cabildoId query → filtered by query", async () => {
    mockReq.query = { cabildoId: jwtCabildoId };
    mockReq.usuario = { id: "user-1", rol: "ADMINISTRATOR", cabildoId: null };
    (prisma.miembro.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "m1", cabildoId: jwtCabildoId },
    ]);

    await getMembers(mockReq as Request, mockRes as Response);

    expect(prisma.miembro.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          cabildoId: jwtCabildoId,
        }),
      })
    );
  });

  it("AC5: CAPTAIN with cabildoId query for different cabildo → empty array (JWT scope wins)", async () => {
    mockReq.query = { cabildoId: otherCabildoId };
    mockReq.usuario = { id: "user-1", rol: "CAPTAIN", cabildoId: jwtCabildoId };
    (prisma.miembro.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await getMembers(mockReq as Request, mockRes as Response);

    expect(prisma.miembro.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          cabildoId: jwtCabildoId, // CAPTAIN scope wins
        }),
      })
    );
  });

  it("AC5: CAPTAIN without cabildoId query → scoped to JWT cabildoId", async () => {
    mockReq.usuario = { id: "user-1", rol: "CAPTAIN", cabildoId: jwtCabildoId };
    (prisma.miembro.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "m1", cabildoId: jwtCabildoId },
    ]);

    await getMembers(mockReq as Request, mockRes as Response);

    expect(prisma.miembro.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          cabildoId: jwtCabildoId,
        }),
      })
    );
  });
});

describe("memberController.updateMember", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockJson: ReturnType<typeof vi.fn>;
  let mockStatus: ReturnType<typeof vi.fn>;
  let mockNext: ReturnType<typeof vi.fn>;

  const jwtCabildoId = "11111111-1111-4111-8111-111111111111";
  const memberId = "33333333-3333-4333-8333-333333333333";

  beforeEach(() => {
    vi.clearAllMocks();
    mockJson = vi.fn().mockReturnThis();
    mockStatus = vi.fn().mockReturnValue({ json: mockJson });
    mockNext = vi.fn();
    mockReq = {
      params: { id: memberId },
      body: { nombres: "Actualizado" },
      usuario: { id: "user-1", rol: "ADMINISTRATOR", cabildoId: null },
    };
    mockRes = {
      status: mockStatus,
      json: mockJson,
    };
    (prisma.miembro.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: memberId,
      cabildoId: jwtCabildoId,
    });
  });

  it("returns 404 when member does not exist", async () => {
    (prisma.miembro.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await updateMember(mockReq as Request, mockRes as Response, mockNext);

    expect(mockStatus).toHaveBeenCalledWith(404);
    expect(prisma.miembro.update).not.toHaveBeenCalled();
  });

  it("returns 404 for CAPTAIN accessing member of another cabildo", async () => {
    mockReq.usuario = { id: "user-1", rol: "CAPTAIN", cabildoId: "99999999-9999-4999-8999-999999999999" };

    await updateMember(mockReq as Request, mockRes as Response, mockNext);

    expect(mockStatus).toHaveBeenCalledWith(404);
    expect(prisma.miembro.update).not.toHaveBeenCalled();
  });

  it("forwards P2002 (unique constraint) to next so global handler returns 409", async () => {
    const p2002 = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    (prisma.miembro.update as ReturnType<typeof vi.fn>).mockRejectedValue(p2002);

    await updateMember(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalledWith(p2002);
    expect(mockStatus).not.toHaveBeenCalledWith(500);
  });

  it("forwards P2025 (record not found) to next so global handler returns 404", async () => {
    const p2025 = Object.assign(new Error("Record not found"), { code: "P2025" });
    (prisma.miembro.update as ReturnType<typeof vi.fn>).mockRejectedValue(p2025);

    await updateMember(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalledWith(p2025);
    expect(mockStatus).not.toHaveBeenCalledWith(500);
  });

  it("returns 400 for ZodError and does NOT forward to next", async () => {
    mockReq.body = { nombres: 123 }; // invalid type → memberSchema.partial().parse throws ZodError

    await updateMember(mockReq as Request, mockRes as Response, mockNext);

    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockNext).not.toHaveBeenCalled();
  });
});

describe("memberController.deleteMember", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockJson: ReturnType<typeof vi.fn>;
  let mockStatus: ReturnType<typeof vi.fn>;
  let mockNext: ReturnType<typeof vi.fn>;
  let mockSend: ReturnType<typeof vi.fn>;

  const jwtCabildoId = "11111111-1111-4111-8111-111111111111";
  const memberId = "33333333-3333-4333-8333-333333333333";

  beforeEach(() => {
    vi.clearAllMocks();
    mockJson = vi.fn().mockReturnThis();
    mockSend = vi.fn().mockReturnThis();
    mockStatus = vi.fn().mockReturnValue({ json: mockJson, send: mockSend });
    mockNext = vi.fn();
    mockReq = {
      params: { id: memberId },
      usuario: { id: "user-1", rol: "ADMINISTRATOR", cabildoId: null },
    };
    mockRes = {
      status: mockStatus,
      json: mockJson,
      send: mockSend,
    };
    (prisma.miembro.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: memberId,
      cabildoId: jwtCabildoId,
    });
  });

  it("returns 404 when member does not exist", async () => {
    (prisma.miembro.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await deleteMember(mockReq as Request, mockRes as Response, mockNext);

    expect(mockStatus).toHaveBeenCalledWith(404);
    expect(prisma.miembro.delete).not.toHaveBeenCalled();
  });

  it("returns 204 and deletes existing member", async () => {
    (prisma.miembro.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ id: memberId });

    await deleteMember(mockReq as Request, mockRes as Response, mockNext);

    expect(mockStatus).toHaveBeenCalledWith(204);
    expect(prisma.miembro.delete).toHaveBeenCalledWith({ where: { id: memberId } });
  });

  it("forwards P2025 (race: record deleted between find and delete) to next", async () => {
    const p2025 = Object.assign(new Error("Record not found"), { code: "P2025" });
    (prisma.miembro.delete as ReturnType<typeof vi.fn>).mockRejectedValue(p2025);

    await deleteMember(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalledWith(p2025);
    expect(mockStatus).not.toHaveBeenCalledWith(500);
  });

  it("forwards other unexpected errors to next (no catch-all 500)", async () => {
    const genericError = new Error("db down");
    (prisma.miembro.delete as ReturnType<typeof vi.fn>).mockRejectedValue(genericError);

    await deleteMember(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalledWith(genericError);
    expect(mockStatus).not.toHaveBeenCalledWith(500);
  });
});

describe("memberController.getMemberById", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockJson: ReturnType<typeof vi.fn>;
  let mockStatus: ReturnType<typeof vi.fn>;
  let mockNext: ReturnType<typeof vi.fn>;

  const jwtCabildoId = "11111111-1111-4111-8111-111111111111";
  const otherCabildoId = "22222222-2222-4222-8222-222222222222";
  const memberId = "33333333-3333-4333-8333-333333333333";

  beforeEach(() => {
    vi.clearAllMocks();
    mockJson = vi.fn().mockReturnThis();
    mockStatus = vi.fn().mockReturnValue({ json: mockJson });
    mockNext = vi.fn();
    mockReq = {
      params: { id: memberId },
      usuario: { id: "user-1", rol: "ADMINISTRATOR", cabildoId: null },
    };
    mockRes = {
      status: mockStatus,
      json: mockJson,
    };
  });

  it("returns 404 when member does not exist", async () => {
    (prisma.miembro.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await getMemberById(mockReq as Request, mockRes as Response, mockNext);

    expect(mockStatus).toHaveBeenCalledWith(404);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("returns 404 for CAPTAIN accessing member of another cabildo", async () => {
    (prisma.miembro.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: memberId,
      cabildoId: otherCabildoId,
    });
    mockReq.usuario = { id: "user-1", rol: "CAPTAIN", cabildoId: jwtCabildoId };

    await getMemberById(mockReq as Request, mockRes as Response, mockNext);

    expect(mockStatus).toHaveBeenCalledWith(404);
  });

  it("returns 200 for ADMIN", async () => {
    (prisma.miembro.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: memberId,
      cabildoId: jwtCabildoId,
    });

    await getMemberById(mockReq as Request, mockRes as Response, mockNext);

    expect(mockStatus).not.toHaveBeenCalledWith(404);
    expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({ id: memberId }));
  });

  it("forwards unexpected errors to next (no catch-all 500)", async () => {
    const dbError = new Error("db down");
    (prisma.miembro.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(dbError);

    await getMemberById(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalledWith(dbError);
    expect(mockStatus).not.toHaveBeenCalledWith(500);
  });
});
