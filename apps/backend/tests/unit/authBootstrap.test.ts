import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Prisma before importing the controller
vi.mock("../../src/database.js", () => ({
  default: {
    usuario: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn().mockResolvedValue("hashed-password") },
}));

import prisma from "../../src/database.js";
import { ensureInitialAdmin } from "../../src/controllers/authController.js";

describe("authController.ensureInitialAdmin (issue #38)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("crea el primer admin desde env si no existe ninguno", async () => {
    const originalEnv = { ...process.env };
    process.env.ADMIN_EMAIL = "admin@test.com";
    process.env.ADMIN_PASSWORD = "secret123";
    process.env.ADMIN_NOMBRE = "Admin Test";

    (prisma.usuario.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await ensureInitialAdmin();

    expect(prisma.usuario.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "admin@test.com",
          rol: "ADMINISTRATOR",
          nombre: "Admin Test",
        }),
      }),
    );

    process.env = originalEnv;
  });

  it("NO crea si ya existe un administrador", async () => {
    process.env.ADMIN_EMAIL = "admin@test.com";
    process.env.ADMIN_PASSWORD = "secret123";

    (prisma.usuario.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "admin-1",
      rol: "ADMINISTRATOR",
    });

    await ensureInitialAdmin();

    expect(prisma.usuario.create).not.toHaveBeenCalled();
  });

  it("NO hace nada si no hay ADMIN_EMAIL/ADMIN_PASSWORD en env", async () => {
    const originalEnv = { ...process.env };
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;

    await ensureInitialAdmin();

    expect(prisma.usuario.findFirst).not.toHaveBeenCalled();
    expect(prisma.usuario.create).not.toHaveBeenCalled();

    process.env = originalEnv;
  });
});
