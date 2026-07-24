import { LanguageModel } from "ai";
import { google } from "@ai-sdk/google";
import { createOllama } from "ollama-ai-provider";

// ─── Types ────────────────────────────────────────────────────────────

export interface ModelCapabilities {
  tools: boolean;
  streaming: boolean;
  structuredOutput: boolean;
}

export interface ModelInfo {
  id: string; // e.g. "google/gemma-4-1b-it"
  name: string; // Display name: "Gemma 4 1B IT"
  provider: "google" | "ollama" | "openai" | "anthropic";
  capabilities: ModelCapabilities;
  defaultFor?: string; // Which role defaults to this model
  requiresApiKey?: string; // Env var name for API key
  /**
   * When true (default), the model is included in getAvailableModels().
   * Set false for models that are registered but not yet compatible
   * (e.g., ollama v1 models with AI SDK v6).
   */
  available?: boolean;
}

// ─── Ollama Provider ──────────────────────────────────────────────────

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434/api";

const ollamaProvider = createOllama({
  baseURL: OLLAMA_BASE_URL,
});

// ─── Registry ─────────────────────────────────────────────────────────

export const MODEL_REGISTRY: ModelInfo[] = [
  {
    id: "google/gemini-3.1-flash-lite-preview",
    name: "Gemini 3.1 Flash Lite",
    provider: "google",
    capabilities: { tools: true, streaming: true, structuredOutput: true },
    defaultFor: "CAPITANA",
    requiresApiKey: "GOOGLE_GENERATIVE_AI_API_KEY",
  },
  {
    id: "google/gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "google",
    capabilities: { tools: true, streaming: true, structuredOutput: true },
    defaultFor: "ADMINISTRADOR",
    requiresApiKey: "GOOGLE_GENERATIVE_AI_API_KEY",
  },
  {
    id: "ollama/qwen3.5:9b",
    name: "Qwen 3.5 9B (Ollama)",
    provider: "ollama",
    capabilities: { tools: false, streaming: false, structuredOutput: false },
    requiresApiKey: undefined, // Ollama is local, no API key needed
    available: false, // v1 model incompatible with AI SDK v6 streamText
  },
];

// ─── Error Classes ────────────────────────────────────────────────────

export class ModelNotFoundError extends Error {
  public availableModels: string[];

  constructor(
    modelId: string,
    availableModels: ModelInfo[]
  ) {
    const modelNames = availableModels.map((m) => m.id);
    super(
      `Modelo "${modelId}" no encontrado. Modelos disponibles: ${modelNames.join(", ")}`
    );
    this.name = "ModelNotFoundError";
    this.availableModels = modelNames;
  }
}

export class NoModelsAvailableError extends Error {
  constructor() {
    super(
      "No hay modelos de IA disponibles. Configure al menos una API key."
    );
    this.name = "NoModelsAvailableError";
  }
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Returns the subset of MODEL_REGISTRY whose API keys (if required)
 * are present in the environment. Local models (no API key) are
 * always included.
 */
export function getAvailableModels(): ModelInfo[] {
  return MODEL_REGISTRY.filter((m) => {
    // Explicitly marked unavailable
    if (m.available === false) return false;
    // Models that require an API key
    if (m.requiresApiKey) return !!process.env[m.requiresApiKey];
    // No API key required → always available
    return true;
  });
}

/**
 * Resolves a provider model for a given role + optional explicit selection.
 *
 * Priority:
 * 1. explicitModelId (if provided and found among available models)
 * 2. role default (first model matched by `defaultFor`)
 * 3. first available model
 *
 * @throws {ModelNotFoundError} when explicitModelId is not found.
 * @throws {NoModelsAvailableError} when no models pass the availability filter.
 */
export function resolveModel(
  explicitModelId?: string,
  rol?: string
): { model: LanguageModel; info: ModelInfo } {
  const available = getAvailableModels();

  if (explicitModelId) {
    const match = available.find((m) => m.id === explicitModelId);
    if (match) return { model: createModel(match), info: match };
    throw new ModelNotFoundError(explicitModelId, available);
  }

  // Default by role
  const defaultMatch =
    available.find((m) => m.defaultFor === rol) || available[0];

  if (!defaultMatch) {
    throw new NoModelsAvailableError();
  }

  return { model: createModel(defaultMatch), info: defaultMatch };
}

// ─── Internal Helpers ─────────────────────────────────────────────────

/**
 * Creates a LanguageModel instance from a ModelInfo registry entry.
 */
function createModel(info: ModelInfo): LanguageModel {
  switch (info.provider) {
    case "google":
      return google(info.id.split("/")[1]) as unknown as LanguageModel;
    case "ollama":
      return ollamaProvider(info.id.split("/")[1]) as unknown as LanguageModel;
    default:
      throw new Error(`Proveedor desconocido: ${info.provider}`);
  }
}
