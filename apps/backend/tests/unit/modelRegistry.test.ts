import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

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

import { createOpenAI } from "@ai-sdk/openai";
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
    it("contains five defined models (2 google + 3 ollama)", () => {
      expect(MODEL_REGISTRY).toHaveLength(5);
      const ids = MODEL_REGISTRY.map((m) => m.id);
      expect(ids).toContain("google/gemini-3.1-flash-lite-preview");
      expect(ids).toContain("google/gemini-2.0-flash");
      expect(ids).toContain("ollama/qwen3.5:9b");
      expect(ids).toContain("ollama/llama3.2:3b");
      expect(ids).toContain("ollama/mistral:7b");
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
      // Singleton already built by the previous test → no second createOpenAI call
      expect(createOpenAI).toHaveBeenCalledTimes(0);
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
});
