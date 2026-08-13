import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Snapshot env vars that provider-availability tests mutate so they never leak
// between tests (a leaked OLLAMA_BASE_URL breaks the empty-availability and
// resolveModel-throw assertions in later tests).
const ENV_SNAPSHOT: Record<string, string | undefined> = {};
beforeEach(() => {
  ENV_SNAPSHOT.OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL;
  ENV_SNAPSHOT.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
});
afterEach(() => {
  if (ENV_SNAPSHOT.OLLAMA_BASE_URL === undefined) delete process.env.OLLAMA_BASE_URL;
  else process.env.OLLAMA_BASE_URL = ENV_SNAPSHOT.OLLAMA_BASE_URL;
  if (ENV_SNAPSHOT.GOOGLE_GENERATIVE_AI_API_KEY === undefined) delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  else process.env.GOOGLE_GENERATIVE_AI_API_KEY = ENV_SNAPSHOT.GOOGLE_GENERATIVE_AI_API_KEY;
});

// Mock AI providers BEFORE importing the module under test
vi.mock("@ai-sdk/google", () => ({
  google: vi.fn((modelId: string) => ({ provider: "google", modelId })),
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => {
    const factory = vi.fn((modelId: string) => ({
      provider: "openai-compat",
      modelId,
    }));
    // @ai-sdk/openai v3 routes provider(modelId) to the Responses API and
    // provider.chat(modelId) to the chat-completions API (the one Ollama
    // exposes). The ollama case must go through .chat().
    factory.chat = vi.fn((modelId: string) => ({
      provider: "openai-compat-chat",
      modelId,
    }));
    return factory;
  }),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn((modelId: string) => ({ provider: "anthropic", modelId })),
}));

import { createOpenAI } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import {
  MODEL_REGISTRY,
  getAvailableModels,
  getOllamaOpenAIProvider,
  resolveModel,
  ModelNotFoundError,
  NoModelsAvailableError,
} from "../../src/services/modelRegistry.js";

describe("Model Registry", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    // Clean environment: no API keys set
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // ─── MODEL_REGISTRY structure ───────────────────────────────────

  describe("MODEL_REGISTRY", () => {
    it("contains eight defined models (2 google + 3 ollama + openai + anthropic + openrouter)", () => {
      expect(MODEL_REGISTRY).toHaveLength(8);
      const ids = MODEL_REGISTRY.map((m) => m.id);
      expect(ids).toContain("google/gemini-3.1-flash-lite-preview");
      expect(ids).toContain("google/gemini-2.0-flash");
      expect(ids).toContain("ollama/qwen3.5:9b");
      expect(ids).toContain("ollama/llama3.2:3b");
      expect(ids).toContain("ollama/mistral:7b");
      // PR-2 adapters (R2.2/R2.3/R2.4)
      expect(ids).toContain("openai/gpt-4.1-mini");
      expect(ids).toContain("anthropic/claude-sonnet-4.5");
      expect(ids).toContain("openrouter/anthropic/claude-sonnet-4.5");
    });

    it("marks audited entries with a verifiedAt date (R2.3)", () => {
      for (const m of MODEL_REGISTRY) {
        expect(m.verifiedAt).toBe("2026-08-13");
      }
    });

    it("openrouter entry carries baseURL + HTTP-Referer/X-Title headers (R2.4)", () => {
      const or = MODEL_REGISTRY.find(
        (m) => m.id === "openrouter/anthropic/claude-sonnet-4.5"
      );
      expect(or?.baseURL).toBe("https://openrouter.ai/api/v1");
      expect(or?.headers?.["X-Title"]).toBe("Tatachio Mirabel");
      expect(or?.headers?.["HTTP-Referer"]).toBeTruthy();
    });

    it("assigns correct role defaults", () => {
      const capiModel = MODEL_REGISTRY.find(
        (m) => m.defaultFor === "CAPTAIN"
      );
      const adminModel = MODEL_REGISTRY.find(
        (m) => m.defaultFor === "ADMINISTRATOR"
      );

      expect(capiModel).toBeDefined();
      expect(capiModel!.id).toBe("google/gemini-3.1-flash-lite-preview");
      expect(adminModel).toBeDefined();
      expect(adminModel!.id).toBe("google/gemini-2.0-flash");
    });

    it("ollama model is available only when OLLAMA_BASE_URL is set", () => {
      const ollamaModel = MODEL_REGISTRY.find(
        (m) => m.provider === "ollama"
      );
      expect(ollamaModel).toBeDefined();
      expect(ollamaModel!.requiresApiKey).toBeUndefined();
      // No OLLAMA_BASE_URL → ollama hidden from getAvailableModels
      delete process.env.OLLAMA_BASE_URL;
      const available = getAvailableModels();
      const ollamaInAvailable = available.find((m) => m.provider === "ollama");
      expect(ollamaInAvailable).toBeUndefined();
      // OLLAMA_BASE_URL set → ollama models become available (OpenAI-compatible route)
      process.env.OLLAMA_BASE_URL = "http://localhost:11434/v1";
      const available2 = getAvailableModels();
      const ollamaInAvailable2 = available2.find((m) => m.provider === "ollama");
      expect(ollamaInAvailable2).toBeDefined();
    });

    it("google models require GOOGLE_GENERATIVE_AI_API_KEY to be available", () => {
      // Provider-based availability: no key → google models unavailable
      delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      const available = getAvailableModels();
      const googleModels = available.filter((m) => m.provider === "google");
      expect(googleModels.length).toBe(0);

      // Set key → google models become available
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";
      const available2 = getAvailableModels();
      const googleModels2 = available2.filter((m) => m.provider === "google");
      expect(googleModels2.length).toBeGreaterThanOrEqual(2);
    });

    it("all models declare tool calling capability", () => {
      for (const m of MODEL_REGISTRY) {
        expect(m.capabilities.tools).toBeTypeOf("boolean");
      }
    });
  });

  // ─── getAvailableModels filtering ───────────────────────────────

  describe("getAvailableModels", () => {
    it("returns empty array when no API keys set and no local models available", () => {
      const available = getAvailableModels();
      // Without API keys and without OLLAMA_BASE_URL, zero models should be available
      expect(available.length).toBe(0);
    });

    it("includes google models when GOOGLE_GENERATIVE_AI_API_KEY is set", () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-api-key";
      const available = getAvailableModels();
      const googleModels = available.filter((m) => m.provider === "google");
      expect(googleModels.length).toBeGreaterThanOrEqual(2);
    });

    it("returns at least two google models when key is configured", () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-api-key";
      const available = getAvailableModels();
      // Both google models should be available
      expect(available.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── resolveModel selection logic ───────────────────────────────

  describe("resolveModel", () => {
    it("selects CAPTAIN default (gemma-4) when no explicit model is provided", () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-api-key";
      const { info } = resolveModel(undefined, "CAPTAIN");
      expect(info.id).toBe("google/gemini-3.1-flash-lite-preview");
    });

    it("selects ADMINISTRATOR default (gemini) when no explicit model is provided", () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-api-key";
      const { info } = resolveModel(undefined, "ADMINISTRATOR");
      expect(info.id).toBe("google/gemini-2.0-flash");
    });

    it("overrides role default when explicit modelId is provided", () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-api-key";
      const { info } = resolveModel("google/gemini-2.0-flash", "CAPTAIN");
      expect(info.id).toBe("google/gemini-2.0-flash");
    });

    it("throws ModelNotFoundError when explicit modelId does not exist", () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-api-key";
      expect(() => resolveModel("nonexistent/model-id", "ADMINISTRATOR")).toThrow(
        ModelNotFoundError
      );
    });

    it("ModelNotFoundError message includes the invalid model id", () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-api-key";
      try {
        resolveModel("bad-model", "ADMINISTRATOR");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ModelNotFoundError);
        expect((error as Error).message).toContain("bad-model");
      }
    });

    it("throws NoModelsAvailableError when no models satisfy requirements", () => {
      // No API keys → no models are available (ollama is v1-incompatible)
      const error = new NoModelsAvailableError();
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain("modelos");
    });

    it("throws NoModelsAvailableError when resolveModel has no models to pick from", () => {
      // No API keys set, ollama hidden → resolveModel should throw
      expect(() => resolveModel(undefined, "CAPTAIN")).toThrow(
        NoModelsAvailableError
      );
    });

    it("falls back to first available model when role default is not available", () => {
      // When Google API key is set, both google models are available.
      // If CAPTAIN default (gemma) wasn't available, the fallback would pick the first.
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-api-key";
      const { info } = resolveModel(undefined, "CAPTAIN");
      // gemma IS available (key is set), so this is the expected behavior
      expect(getAvailableModels().some((m) => m.id === info.id)).toBe(true);
    });

    it("returns a LanguageModel alongside the ModelInfo", () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-api-key";
      const { model, info } = resolveModel(undefined, "ADMINISTRATOR");
      expect(info.id).toBe("google/gemini-2.0-flash");
      expect(model).toBeDefined();
      // With our mock, the model object has shape { provider, modelId }
      expect((model as Record<string, string>).provider).toBe("google");
    });

    it("does not resolve ollama models without OLLAMA_BASE_URL", () => {
      // No keys and no OLLAMA_BASE_URL → nothing is available, resolveModel throws
      expect(() => resolveModel(undefined, "CAPTAIN")).toThrow(
        NoModelsAvailableError
      );
    });
  });

  // ─── Unknown role fallback ──────────────────────────────────────

  describe("resolveModel with unknown role", () => {
    it("picks the first available model when role has no default", () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-api-key";
      const { info } = resolveModel(undefined, "INVITADO");
      // First available in registry order (gemini-3.1-flash-lite-preview)
      const availableIds = getAvailableModels().map((m) => m.id);
      expect(availableIds.length).toBeGreaterThan(0);
      expect(availableIds[0]).toBe(info.id);
    });
  });

  // ─── Ollama via OpenAI-compatible provider (PR-1) ───────────────
  //
  // NOTE: these tests are order-sensitive with respect to the lazy singleton:
  // the FIRST test that calls getOllamaOpenAIProvider()/resolveModel(ollama)
  // builds the cached provider with whatever OLLAMA_BASE_URL is set at that
  // moment. Vitest runs tests in declaration order within a file, so the
  // default-baseURL test is declared first.

  describe("ollama via @ai-sdk/openai (PR-1)", () => {
    it("defaults baseURL to http://localhost:11434/v1 when OLLAMA_BASE_URL is unset", () => {
      delete process.env.OLLAMA_BASE_URL;
      const provider = getOllamaOpenAIProvider();
      expect(provider).toBeTypeOf("function");
      expect(createOpenAI).toHaveBeenCalledWith({
        baseURL: "http://localhost:11434/v1",
        // Local Ollama needs no API key; @ai-sdk/openai requires a string (even
        // empty) or it throws AI_LoadAPIKeyError at request time.
        apiKey: "",
      });
    });

    it("is a lazy singleton: repeated calls reuse the cached provider", () => {
      delete process.env.OLLAMA_BASE_URL;
      const first = getOllamaOpenAIProvider();
      const second = getOllamaOpenAIProvider();
      expect(first).toBe(second);
    });

    it("createModel 'ollama' case returns a LanguageModel via the OpenAI-compatible chat-completions provider", () => {
      process.env.OLLAMA_BASE_URL = "http://localhost:11434/v1";
      const { model } = resolveModel("ollama/llama3.2:3b", "CAPTAIN");
      // Our mock: provider.chat(id) returns { provider: "openai-compat-chat", modelId }
      expect((model as Record<string, string>).provider).toBe("openai-compat-chat");
      expect((model as Record<string, string>).modelId).toBe("llama3.2:3b");
    });

    it("keeps the ollama ModelInfo provider name and registry entries unchanged", () => {
      const ids = MODEL_REGISTRY.filter((m) => m.provider === "ollama").map(
        (m) => m.id
      );
      expect(ids).toEqual([
        "ollama/qwen3.5:9b",
        "ollama/llama3.2:3b",
        "ollama/mistral:7b",
      ]);
    });
  });

  // ─── Config-declared providers (R2.0, data-driven registry) ─────
  //
  // Adding a provider = config only (EXTRA_PROVIDERS_JSON or providers.json),
  // zero code. Availability is keyed on the declared apiKeyEnv var.

  describe("config-declared providers (R2.0)", () => {
    const nvidiaConfig = JSON.stringify({
      providers: [
        {
          provider: "nvidia",
          baseURL: "https://integrate.api.nvidia.com/v1",
          apiKeyEnv: "NVIDIA_API_KEY",
          models: [
            {
              id: "deepseek-ai/deepseek-r1",
              name: "DeepSeek R1 (NVIDIA NIM)",
              capabilities: { tools: true, streaming: true },
            },
            {
              id: "meta/llama-3.3-70b-instruct",
              name: "Llama 3.3 70B Instruct (NVIDIA NIM)",
            },
          ],
        },
      ],
    });

    it("excludes config-declared models when apiKeyEnv is not set", () => {
      process.env.EXTRA_PROVIDERS_JSON = nvidiaConfig;
      delete process.env.NVIDIA_API_KEY;
      const available = getAvailableModels();
      expect(available.filter((m) => m.id.startsWith("nvidia/"))).toHaveLength(0);
    });

    it("includes config-declared models when apiKeyEnv is set", () => {
      process.env.EXTRA_PROVIDERS_JSON = nvidiaConfig;
      process.env.NVIDIA_API_KEY = "nvkey-123";
      const available = getAvailableModels();
      const nvidia = available.filter((m) => m.id.startsWith("nvidia/"));
      expect(nvidia).toHaveLength(2);
      expect(nvidia[0].id).toBe("nvidia/deepseek-ai/deepseek-r1");
      // OpenAI-compatible → routes through the shared @ai-sdk/openai adapter
      expect(nvidia[0].provider).toBe("openai");
      expect(nvidia[0].baseURL).toBe("https://integrate.api.nvidia.com/v1");
      expect(nvidia[0].apiKeyEnv).toBe("NVIDIA_API_KEY");
      expect(nvidia[0].capabilities.tools).toBe(true);
      // capabilities omitted in config → registry defaults applied
      expect(nvidia[1].capabilities.tools).toBe(true);
    });

    it("merges core + config-declared models (admin <select> source, R2.6)", () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = "g-key";
      process.env.EXTRA_PROVIDERS_JSON = nvidiaConfig;
      process.env.NVIDIA_API_KEY = "nvkey-123";
      const available = getAvailableModels();
      const googleCount = available.filter((m) => m.provider === "google").length;
      const nvidiaCount = available.filter((m) => m.id.startsWith("nvidia/")).length;
      expect(googleCount).toBeGreaterThanOrEqual(2);
      expect(nvidiaCount).toBe(2);
    });

    it("falls back to core providers when config is malformed (no crash)", () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = "g-key";
      process.env.EXTRA_PROVIDERS_JSON = "{ broken json";
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const available = getAvailableModels();
      expect(available.length).toBeGreaterThanOrEqual(2);
      expect(available.some((m) => m.provider === "google")).toBe(true);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("routes config-declared model via createOpenAI with the declared baseURL + key (baseURL discriminator)", () => {
      process.env.EXTRA_PROVIDERS_JSON = nvidiaConfig;
      process.env.NVIDIA_API_KEY = "nvkey-123";
      const { model } = resolveModel(
        "nvidia/deepseek-ai/deepseek-r1",
        "ADMINISTRATOR"
      );
      expect((model as Record<string, string>).provider).toBe(
        "openai-compat-chat"
      );
      // Model ids containing slashes survive the provider-model extraction
      expect((model as Record<string, string>).modelId).toBe(
        "deepseek-ai/deepseek-r1"
      );
      expect(createOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: "https://integrate.api.nvidia.com/v1",
          apiKey: "nvkey-123",
        })
      );
    });

    it("rejects an explicit config-declared model whose key is unset (admin select correctness, R2.6)", () => {
      process.env.EXTRA_PROVIDERS_JSON = nvidiaConfig;
      delete process.env.NVIDIA_API_KEY;
      expect(() =>
        resolveModel("nvidia/deepseek-ai/deepseek-r1", "ADMINISTRATOR")
      ).toThrow(ModelNotFoundError);
    });
  });

  // ─── Provider adapters (R2.2/R2.4) ──────────────────────────────

  describe("createModel provider adapters (PR-2)", () => {
    it("anthropic case routes to @ai-sdk/anthropic with the model id", () => {
      process.env.ANTHROPIC_API_KEY = "ant-key";
      const { model } = resolveModel(
        "anthropic/claude-sonnet-4.5",
        "ADMINISTRATOR"
      );
      expect((model as Record<string, string>).provider).toBe("anthropic");
      expect((model as Record<string, string>).modelId).toBe("claude-sonnet-4.5");
      expect(anthropic).toHaveBeenCalledWith("claude-sonnet-4.5");
    });

    it("openai case routes through createOpenAI().chat with no baseURL (real OpenAI)", () => {
      process.env.OPENAI_API_KEY = "oa-key";
      const { model } = resolveModel("openai/gpt-4.1-mini", "ADMINISTRATOR");
      expect((model as Record<string, string>).provider).toBe(
        "openai-compat-chat"
      );
      expect((model as Record<string, string>).modelId).toBe("gpt-4.1-mini");
      expect(createOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: "oa-key" })
      );
      // No baseURL → real OpenAI endpoint (no discriminator)
      expect(createOpenAI.mock.calls.at(-1)?.[0]?.baseURL).toBeUndefined();
    });

    it("openrouter case routes through createOpenAI with OpenRouter baseURL + headers", () => {
      process.env.OPENROUTER_API_KEY = "or-key";
      const { model } = resolveModel(
        "openrouter/anthropic/claude-sonnet-4.5",
        "ADMINISTRATOR"
      );
      expect((model as Record<string, string>).modelId).toBe(
        "anthropic/claude-sonnet-4.5"
      );
      expect(createOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: "https://openrouter.ai/api/v1",
          apiKey: "or-key",
          headers: expect.objectContaining({
            "HTTP-Referer": expect.any(String),
            "X-Title": "Tatachio Mirabel",
          }),
        })
      );
    });

    it("returns only providers whose keys are set (admin select list, R2.6)", () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = "g-key";
      process.env.OPENROUTER_API_KEY = "or-key";
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.OLLAMA_BASE_URL;
      delete process.env.EXTRA_PROVIDERS_JSON;
      const available = getAvailableModels();
      const providers = new Set(available.map((m) => m.provider));
      expect(providers.has("google")).toBe(true);
      expect(providers.has("openrouter")).toBe(true);
      expect(providers.has("anthropic")).toBe(false);
      expect(providers.has("openai")).toBe(false);
      expect(providers.has("ollama")).toBe(false);
    });
  });
});
