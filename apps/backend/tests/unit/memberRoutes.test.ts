import { describe, it, expect } from "vitest";

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
    const useLayers = router.stack.filter((layer: any) => !layer.route);
    expect(useLayers.length).toBe(1); // Only authMiddleware as global
  });

  it("should have GET, POST, PUT, DELETE routes defined", async () => {
    const module = await import("../../src/routes/member.js");
    const router = module.default;

    const routeLayers = router.stack.filter((layer: any) => layer.route);
    const methods = routeLayers.flatMap((r: any) => Object.keys(r.route.methods));

    expect(methods).toContain("get");
    expect(methods).toContain("post");
    expect(methods).toContain("put");
    expect(methods).toContain("delete");
  });
});
