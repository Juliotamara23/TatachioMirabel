import { describe, it, expect } from "vitest";
import {
  DEFAULT_FAILOVER_CHAIN,
  buildGatewayProviderOptions,
} from "../../src/services/failoverChain.js";

describe("failover chain (PR-3, R3.3/R3.4)", () => {
  it("defines a chain with google first and openrouter second (R3.3)", () => {
    expect(DEFAULT_FAILOVER_CHAIN.order).toEqual(["google", "openrouter"]);
  });

  it("defines fallback models matching the registry's google + openrouter ids", () => {
    expect(DEFAULT_FAILOVER_CHAIN.models).toHaveLength(2);
    expect(DEFAULT_FAILOVER_CHAIN.models[0]).toBe("google/gemini-2.0-flash");
    expect(DEFAULT_FAILOVER_CHAIN.models[1]).toBe(
      "openrouter/anthropic/claude-sonnet-4.5"
    );
  });

  it("builds identical provider options for CAPTAIN and ADMINISTRATOR (R3.4)", () => {
    const captain = buildGatewayProviderOptions("CAPTAIN");
    const admin = buildGatewayProviderOptions("ADMINISTRATOR");
    expect(captain.gateway).toEqual(admin.gateway);
    expect(captain).toEqual(admin);
  });

  it("exposes the chain under the providerOptions.gateway key", () => {
    const opts = buildGatewayProviderOptions("CAPTAIN");
    expect(opts.gateway.order).toEqual(["google", "openrouter"]);
    expect(opts.gateway.models).toEqual(DEFAULT_FAILOVER_CHAIN.models);
  });

  it("returns fresh copies so callers cannot mutate the shared default", () => {
    const a = buildGatewayProviderOptions("CAPTAIN");
    a.gateway.order.push("ollama");
    a.gateway.models.push("ollama/qwen3.5:9b");
    const b = buildGatewayProviderOptions("ADMINISTRATOR");
    expect(b.gateway.order).toEqual(["google", "openrouter"]);
    expect(b.gateway.models).toEqual(DEFAULT_FAILOVER_CHAIN.models);
  });
});
