import { describe, it, expect, vi } from "vitest";
import { Request, Response } from "express";

// Mock auth middleware to isolate route protection logic
vi.mock("../../src/middleware/authMiddleware.js", () => ({
  authMiddleware: vi.fn((_req: Request, _res: Response, next: () => void) => next()),
  isAdmin: vi.fn((req: Request, res: Response, next: () => void) => {
    if (req.usuario?.rol !== "ADMINISTRATOR") {
      res.status(403).json({ error: "Acceso denegado: se requieren permisos de administrator" });
      return;
    }
    next();
  }),
}));

// Mock the controller
vi.mock("../../src/controllers/authController.js", () => ({
  register: vi.fn(),
  login: vi.fn(),
  ensureInitialAdmin: vi.fn(),
}));

import { authMiddleware, isAdmin } from "../../src/middleware/authMiddleware.js";
import { register, login } from "../../src/controllers/authController.js";

describe("auth routes — register protection (issue #38)", () => {
  it("route /register uses authMiddleware THEN isAdmin (admin-only)", async () => {
    const module = await import("../../src/routes/auth.js");
    const router = module.default;
    const layers = router.stack.filter((l: { route?: unknown }) => l.route);
    expect(layers).toHaveLength(2);

    // register layer
    const registerLayer = layers.find((l: { route?: { path?: string } }) => l.route.path === "/register");
    const registerHandlers = registerLayer.route.stack.map(
      (s: { method: string; handle: unknown }) => s.handle,
    );
    expect(registerHandlers).toContain(authMiddleware);
    expect(registerHandlers).toContain(isAdmin);
    expect(registerHandlers).toContain(register);
    // isAdmin must come after authMiddleware
    expect(registerHandlers.indexOf(authMiddleware)).toBeLessThan(
      registerHandlers.indexOf(isAdmin),
    );

    // login layer stays public
    const loginLayer = layers.find((l: { route?: { path?: string } }) => l.route.path === "/login");
    const loginHandlers = loginLayer.route.stack.map(
      (s: { method: string; handle: unknown }) => s.handle,
    );
    expect(loginHandlers).toContain(login);
    expect(loginHandlers).not.toContain(isAdmin);
  });
});
