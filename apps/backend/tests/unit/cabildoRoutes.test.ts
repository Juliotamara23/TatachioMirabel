import { describe, it, expect } from "vitest";

describe("cabildo routes", () => {
  it("should export an Express Router", async () => {
    const module = await import("../../src/routes/cabildo.js");
    const router = module.default;

    expect(router).toBeDefined();
    // Express Router has use, get, post, put, delete methods
    expect(typeof router.get).toBe("function");
    expect(typeof router.post).toBe("function");
    expect(typeof router.put).toBe("function");
    expect(typeof router.delete).toBe("function");
    expect(typeof router.use).toBe("function");
  });

  it("should register GET route for /", async () => {
    const module = await import("../../src/routes/cabildo.js");
    const router = module.default;

    // Verify routes are registered by checking stack
    const routes = router.stack.filter((layer: { route?: unknown }) => layer.route);
    const methods = routes.flatMap((r: { route?: { methods?: Record<string, unknown> } }) => Object.keys(r.route?.methods ?? {}));

    expect(methods).toContain("get");
    expect(methods).toContain("post");
    expect(methods).toContain("put");
    expect(methods).toContain("delete");
  });
});
