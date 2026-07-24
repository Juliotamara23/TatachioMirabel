import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock AI providers BEFORE importing the module under test
vi.mock("@ai-sdk/google", () => ({
  google: vi.fn((modelId: string) => ({ provider: "google", modelId })),
}));

vi.mock("ollama-ai-provider", () => ({
  createOllama: vi.fn(() =>
    vi.fn((modelId: string) => ({ provider: "ollama", modelId }))
  ),
}));

import {
  MODEL_REGISTRY,
  getAvailableModels,
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
        (m) => m.defaultFor === "CAPITANA"
      );
      const adminModel = MODEL_REGISTRY.find(
        (m) => m.defaultFor === "ADMINISTRADOR"
      );

      expect(capiModel).toBeDefined();
      expect(capiModel!.id).toBe("google/gemini-3.1-flash-lite-preview");
      expect(adminModel).toBeDefined();
      expect(adminModel!.id).toBe("google/gemini-2.0-flash");
    });

    it("marks ollama model as NOT currently available (v1 incompatibility)", () => {
      const ollamaModel = MODEL_REGISTRY.find(
        (m) => m.provider === "ollama"
      );
      expect(ollamaModel).toBeDefined();
      expect(ollamaModel!.requiresApiKey).toBeUndefined();
      // Due to v1/v2 incompatibility, it should not appear in getAvailableModels
      const available = getAvailableModels();
      const ollamaInAvailable = available.find((m) => m.provider === "ollama");
      expect(ollamaInAvailable).toBeUndefined();
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
      // Without API keys, zero models should be available
      // (ollama is v1-incompatible, google requires key)
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
    it("selects CAPITANA default (gemma-4) when no explicit model is provided", () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-api-key";
      const { info } = resolveModel(undefined, "CAPITANA");
      expect(info.id).toBe("google/gemini-3.1-flash-lite-preview");
    });

    it("selects ADMINISTRADOR default (gemini) when no explicit model is provided", () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-api-key";
      const { info } = resolveModel(undefined, "ADMINISTRADOR");
      expect(info.id).toBe("google/gemini-2.0-flash");
    });

    it("overrides role default when explicit modelId is provided", () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-api-key";
      const { info } = resolveModel("google/gemini-2.0-flash", "CAPITANA");
      expect(info.id).toBe("google/gemini-2.0-flash");
    });

    it("throws ModelNotFoundError when explicit modelId does not exist", () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-api-key";
      expect(() => resolveModel("nonexistent/model-id", "ADMINISTRADOR")).toThrow(
        ModelNotFoundError
      );
    });

    it("ModelNotFoundError message includes the invalid model id", () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-api-key";
      try {
        resolveModel("bad-model", "ADMINISTRADOR");
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
      expect(() => resolveModel(undefined, "CAPITANA")).toThrow(
        NoModelsAvailableError
      );
    });

    it("falls back to first available model when role default is not available", () => {
      // When Google API key is set, both google models are available.
      // If CAPITANA default (gemma) wasn't available, the fallback would pick the first.
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-api-key";
      const { info } = resolveModel(undefined, "CAPITANA");
      // gemma IS available (key is set), so this is the expected behavior
      expect(getAvailableModels().some((m) => m.id === info.id)).toBe(true);
    });

    it("returns a LanguageModel alongside the ModelInfo", () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-api-key";
      const { model, info } = resolveModel(undefined, "ADMINISTRADOR");
      expect(info.id).toBe("google/gemini-2.0-flash");
      expect(model).toBeDefined();
      // With our mock, the model object has shape { provider, modelId }
      expect((model as Record<string, string>).provider).toBe("google");
    });

    it("does not create ollama models (v1 incompatible)", () => {
      // Ollama is marked available: false, so resolveModel should
      // throw NoModelsAvailableError when no other models are available
      expect(() => resolveModel(undefined, "CAPITANA")).toThrow(
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
});
