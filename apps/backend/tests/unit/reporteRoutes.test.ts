import { describe, it, expect, vi, beforeEach } from "vitest";
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
vi.mock("../../src/controllers/reporteController.js", () => ({
  generarCenso: vi.fn(),
}));

import { authMiddleware, isAdmin } from "../../src/middleware/authMiddleware.js";
import { generarCenso } from "../../src/controllers/reporteController.js";

describe("reportes routes — authorization (issue #39 CRITICAL)", () => {
  it("route /censo.xlsx uses authMiddleware THEN isAdmin", async () => {
    const module = await import("../../src/routes/reportes.js");
    const router = module.default;
    const layers = router.stack.filter((l: { route?: unknown }) => l.route);
    expect(layers).toHaveLength(1);
    // Stack: [authMiddleware, isAdmin, generarCenso]
    const handlers = layers[0].route.stack.map((s: { method: string; handle: unknown }) => s.handle);
    expect(handlers).toContain(authMiddleware);
    expect(handlers).toContain(isAdmin);
    expect(handlers).toContain(generarCenso);
    // isAdmin must come after authMiddleware (index order)
    const idxAuth = handlers.indexOf(authMiddleware);
    const idxAdmin = handlers.indexOf(isAdmin);
    expect(idxAuth).toBeLessThan(idxAdmin);
  });
});
