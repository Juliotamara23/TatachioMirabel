import { describe, it, expect } from "vitest";

describe("familia routes", () => {
  it("should export an Express Router", async () => {
    const module = await import("../../src/routes/familia.js");
    const router = module.default;

    expect(router).toBeDefined();
    expect(typeof router.get).toBe("function");
    expect(typeof router.post).toBe("function");
    expect(typeof router.put).toBe("function");
    expect(typeof router.delete).toBe("function");
    expect(typeof router.use).toBe("function");
  });

  it("should register CRUD routes", async () => {
    const module = await import("../../src/routes/familia.js");
    const router = module.default;

    const routes = router.stack.filter((layer: any) => layer.route);
    const methods = routes.flatMap((r: any) => Object.keys(r.route.methods));

    expect(methods).toContain("get");
    expect(methods).toContain("post");
    expect(methods).toContain("put");
    expect(methods).toContain("delete");
  });
});
