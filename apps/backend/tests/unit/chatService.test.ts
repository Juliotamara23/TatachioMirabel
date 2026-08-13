import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Snapshot the gateway env var so tests never leak it (a leaked
// AI_GATEWAY_API_KEY would flip the providerOptions threading for later tests).
const ENV_SNAPSHOT: Record<string, string | undefined> = {};
beforeEach(() => {
  ENV_SNAPSHOT.AI_GATEWAY_API_KEY = process.env.AI_GATEWAY_API_KEY;
});
afterEach(() => {
  if (ENV_SNAPSHOT.AI_GATEWAY_API_KEY === undefined) delete process.env.AI_GATEWAY_API_KEY;
  else process.env.AI_GATEWAY_API_KEY = ENV_SNAPSHOT.AI_GATEWAY_API_KEY;
});

vi.mock("ai", () => ({
  streamText: vi.fn(() => ({ textStream: {}, fullStream: {} })),
  stepCountIs: vi.fn(() => vi.fn()),
}));

vi.mock("../../src/services/modelRegistry.js", () => ({
  resolveModel: vi.fn(() => ({
    model: { provider: "mock" },
    info: { id: "google/gemini-2.0-flash" },
  })),
}));

vi.mock("../../src/services/tools/index.js", () => ({
  getToolsForRole: vi.fn(() => ({ mockTool: { description: "mock" } })),
}));

vi.mock("../../src/services/failoverChain.js", () => ({
  // No-arg builder (review finding 3): the chain is role-independent (R3.4).
  buildGatewayProviderOptions: vi.fn(() => ({
    gateway: {
      order: ["google", "deepseek", "meta"],
      models: [
        "google/gemini-3.1-flash-lite-preview",
        "deepseek/deepseek-r1",
        "meta/llama-3.3-70b",
      ],
    },
  })),
}));

import { streamText } from "ai";
import { runChat } from "../../src/services/chatService.js";
import { buildGatewayProviderOptions } from "../../src/services/failoverChain.js";

describe("runChat gateway providerOptions (PR-3, R3.7/R3.5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.AI_GATEWAY_API_KEY;
  });

  it("passes providerOptions.gateway into streamText when AI_GATEWAY_API_KEY is set (R3.7)", () => {
    process.env.AI_GATEWAY_API_KEY = "gw-key";
    runChat([{ role: "user", content: "hola" }], "CAPTAIN");
    const args = streamText.mock.calls[0][0];
    expect(args.providerOptions).toEqual(buildGatewayProviderOptions());
    // the chain builder is called without arguments (no per-role chain, R3.4);
    // mock.calls[0] discriminates zero-arg calls (toHaveBeenCalledWith() does not)
    expect(buildGatewayProviderOptions.mock.calls[0]).toEqual([]);
  });

  it("omits providerOptions entirely when AI_GATEWAY_API_KEY is absent (R3.5)", () => {
    delete process.env.AI_GATEWAY_API_KEY;
    runChat([{ role: "user", content: "hola" }], "ADMINISTRATOR");
    const args = streamText.mock.calls[0][0];
    expect("providerOptions" in args).toBe(false);
    expect(buildGatewayProviderOptions).not.toHaveBeenCalled();
  });

  it("keeps the existing runChat contract (result + modelInfo)", () => {
    process.env.AI_GATEWAY_API_KEY = "gw-key";
    const { result, modelInfo } = runChat([{ role: "user", content: "hola" }], "CAPTAIN");
    expect(result).toEqual({ textStream: {}, fullStream: {} });
    expect(modelInfo).toEqual({ id: "google/gemini-2.0-flash" });
  });
});
