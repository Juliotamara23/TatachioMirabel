import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response } from "express";
import { createMember, getMembers } from "../../src/controllers/memberController.js";
import { memberSchema } from "@tatachio/shared";

// Mock Prisma
vi.mock("../../src/database.js", () => ({
  default: {
    miembro: {
      create: vi.fn(),
      findMany: vi.fn(),
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
