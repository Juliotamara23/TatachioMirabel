import { describe, it, expect } from "vitest";
import {
  DEFAULT_FAILOVER_CHAIN,
  buildGatewayProviderOptions,
} from "../../src/services/failoverChain.js";

describe("failover chain (PR-3, R3.3/R3.4)", () => {
  it("defines a chain with google, deepseek and meta (curated gateway ids, review finding 1)", () => {
    expect(DEFAULT_FAILOVER_CHAIN.order).toEqual(["google", "deepseek", "meta"]);
  });

  it("defines fallback models that are exact curated GatewayModelId catalog members", () => {
    expect(DEFAULT_FAILOVER_CHAIN.models).toHaveLength(3);
    expect(DEFAULT_FAILOVER_CHAIN.models).toEqual([
      "google/gemini-3.1-flash-lite-preview",
      "deepseek/deepseek-r1",
      "meta/llama-3.3-70b",
    ]);
  });

  it("takes no arguments and returns the same chain on every call (R3.4, review finding 3)", () => {
    expect(buildGatewayProviderOptions.length).toBe(0);
    const first = buildGatewayProviderOptions();
    const second = buildGatewayProviderOptions();
    expect(first.gateway).toEqual(second.gateway);
    expect(first).toEqual(second);
  });

  it("exposes the chain under the providerOptions.gateway key", () => {
    const opts = buildGatewayProviderOptions();
    expect(opts.gateway.order).toEqual(["google", "deepseek", "meta"]);
    expect(opts.gateway.models).toEqual(DEFAULT_FAILOVER_CHAIN.models);
  });

  it("returns fresh copies so callers cannot mutate the shared default", () => {
    const a = buildGatewayProviderOptions();
    a.gateway.order.push("ollama");
    a.gateway.models.push("ollama/qwen3.5:9b");
    const b = buildGatewayProviderOptions();
    expect(b.gateway.order).toEqual(["google", "deepseek", "meta"]);
    expect(b.gateway.models).toEqual(DEFAULT_FAILOVER_CHAIN.models);
  });
});
