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
  id: string; // e.g. "google/gemini-2.0-flash"
  name: string; // Display name: "Gemini 2.0 Flash"
  provider: ProviderName;
  capabilities: ModelCapabilities;
  /** Role that defaults to this model when no explicit model is requested. */
  defaultFor?: string;
}

export type ProviderName = "google" | "ollama" | "openai" | "anthropic";

// ─── Provider Prerequisites ───────────────────────────────────────────

interface ProviderConfig {
  /** Env var that must be set for this provider to be available. */
  envVar?: string;
  /** Custom check (e.g. ollama doesn't need an API key, just a base URL). */
  check: () => boolean;
}

const PROVIDERS: Record<ProviderName, ProviderConfig> = {
  google: {
    envVar: "GOOGLE_GENERATIVE_AI_API_KEY",
    check: () => !!process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  },
  ollama: {
    check: () => !!process.env.OLLAMA_BASE_URL,
  },
  openai: {
    envVar: "OPENAI_API_KEY",
    check: () => !!process.env.OPENAI_API_KEY,
  },
  anthropic: {
    envVar: "ANTHROPIC_API_KEY",
    check: () => !!process.env.ANTHROPIC_API_KEY,
  },
};

function isProviderAvailable(provider: ProviderName): boolean {
  return PROVIDERS[provider]?.check() ?? false;
}

/**
 * Active provider preference from AI_PROVIDER env var.
 * When set, models from this provider are preferred for role defaults.
 */
function activeProvider(): ProviderName | undefined {
  const raw = process.env.AI_PROVIDER?.toLowerCase();
  if (raw === "google" || raw === "ollama" || raw === "openai" || raw === "anthropic") {
    return raw;
  }
  return undefined;
}

// ─── Ollama Provider (lazy init) ──────────────────────────────────────

let _ollama: ReturnType<typeof createOllama> | null = null;

function getOllamaProvider() {
  if (!_ollama) {
    _ollama = createOllama({
      baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434/api",
    });
  }
  return _ollama;
}

// ─── Registry ─────────────────────────────────────────────────────────

export const MODEL_REGISTRY: ModelInfo[] = [
  // ── Google ──────────────────────────────────────────────────────
  {
    id: "google/gemini-3.1-flash-lite-preview",
    name: "Gemini 3.1 Flash Lite",
    provider: "google",
    capabilities: { tools: true, streaming: true, structuredOutput: true },
    defaultFor: "CAPTAIN",
  },
  {
    id: "google/gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "google",
    capabilities: { tools: true, streaming: true, structuredOutput: true },
    defaultFor: "ADMINISTRATOR",
  },
  // ── Ollama ──────────────────────────────────────────────────────
  {
    id: "ollama/qwen3.5:9b",
    name: "Qwen 3.5 9B (Ollama)",
    provider: "ollama",
    capabilities: { tools: false, streaming: false, structuredOutput: false },
  },
  {
    id: "ollama/llama3.2:3b",
    name: "Llama 3.2 3B (Ollama)",
    provider: "ollama",
    capabilities: { tools: true, streaming: true, structuredOutput: false },
  },
  {
    id: "ollama/mistral:7b",
    name: "Mistral 7B (Ollama)",
    provider: "ollama",
    capabilities: { tools: true, streaming: true, structuredOutput: false },
  },
  // ── OpenAI (placeholder — add models + install @ai-sdk/openai) ──
  // ── Anthropic (placeholder — add models + install @ai-sdk/anthropic) ──
];

// ─── Error Classes ────────────────────────────────────────────────────

export class ModelNotFoundError extends Error {
  public availableModels: string[];

  constructor(modelId: string, availableModels: ModelInfo[]) {
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
      "No hay modelos de IA disponibles. Configure al menos un proveedor (GOOGLE_GENERATIVE_AI_API_KEY, OLLAMA_BASE_URL, OPENAI_API_KEY, o ANTHROPIC_API_KEY)."
    );
    this.name = "NoModelsAvailableError";
  }
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Returns subset of MODEL_REGISTRY whose provider prerequisites are met.
 */
export function getAvailableModels(): ModelInfo[] {
  return MODEL_REGISTRY.filter((m) => isProviderAvailable(m.provider));
}

/**
 * Resolves a model for a given role + optional explicit selection.
 *
 * Priority:
 * 1. explicitModelId — if provided and found among available models
 * 2. Role default from active provider — if AI_PROVIDER is set, prefer
 *    models from that provider matching the role's defaultFor
 * 3. Role default (any provider) — first available model with matching defaultFor
 * 4. First available model
 *
 * @throws {ModelNotFoundError} when explicitModelId is not found.
 * @throws {NoModelsAvailableError} when no models pass availability.
 */
export function resolveModel(
  explicitModelId?: string,
  rol?: string
): { model: LanguageModel; info: ModelInfo } {
  const available = getAvailableModels();

  // 1. Explicit model request
  if (explicitModelId) {
    const match = available.find((m) => m.id === explicitModelId);
    if (match) return { model: createModel(match), info: match };
    throw new ModelNotFoundError(explicitModelId, available);
  }

  // 2. Active provider + role default
  const preferred = activeProvider();
  if (preferred && rol) {
    const match = available.find(
      (m) => m.provider === preferred && m.defaultFor === rol
    );
    if (match) return { model: createModel(match), info: match };
  }

  // 3. Any provider role default
  if (rol) {
    const match = available.find((m) => m.defaultFor === rol);
    if (match) return { model: createModel(match), info: match };
  }

  // 4. Fallback: first available
  const fallback = available[0];
  if (!fallback) throw new NoModelsAvailableError();

  return { model: createModel(fallback), info: fallback };
}

// ─── Internal Helpers ─────────────────────────────────────────────────

function createModel(info: ModelInfo): LanguageModel {
  switch (info.provider) {
    case "google":
      return google(info.id.split("/")[1]) as unknown as LanguageModel;
    case "ollama":
      return getOllamaProvider()(info.id.split("/")[1]) as unknown as LanguageModel;
    default:
      throw new Error(`Proveedor no implementado: ${info.provider}`);
  }
}
