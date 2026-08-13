import { LanguageModel } from "ai";
import { google } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import {
  loadProvidersConfig,
  type ConfigProvider,
} from "./providersConfig.js";

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
  /**
   * OpenAI-compatible baseURL — when set, the factory uses
   * `createOpenAI({ baseURL })` (the discriminator that lets config-declared
   * OpenAI-compatible providers share the "openai" adapter, R2.0).
   */
  baseURL?: string;
  /** PR-3: marks entries valid as GatewayModelId strings. */
  gateway?: boolean;
  /** ISO date of the catalog audit pass (R2.3). */
  verifiedAt?: string;
  /** Env var holding the API key for config-declared providers (R2.0). */
  apiKeyEnv?: string;
  /** Extra HTTP headers sent to the provider (e.g. OpenRouter referer). */
  headers?: Record<string, string>;
}

export type ProviderName =
  | "google"
  | "ollama"
  | "openai"
  | "anthropic"
  | "openrouter";

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
  openrouter: {
    envVar: "OPENROUTER_API_KEY",
    check: () => !!process.env.OPENROUTER_API_KEY,
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
  if (
    raw === "google" ||
    raw === "ollama" ||
    raw === "openai" ||
    raw === "anthropic" ||
    raw === "openrouter"
  ) {
    return raw;
  }
  return undefined;
}

// ─── Ollama provider (lazy singleton via OpenAI-compatible endpoint) ────

let _ollamaOpenAI: ReturnType<typeof createOpenAI> | null = null;

/**
 * OpenAI-compatible provider pointed at Ollama's `/v1` endpoint.
 * Ollama exposes an OpenAI-compatible API since v0.1.34, so the same
 * `@ai-sdk/openai` adapter serves both real OpenAI and local Ollama.
 * Lazy singleton: the provider is built once and reused on every call.
 */
export function getOllamaOpenAIProvider() {
  if (!_ollamaOpenAI) {
    _ollamaOpenAI = createOpenAI({
      baseURL: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
      // Local Ollama requires no API key. @ai-sdk/openai throws AI_LoadAPIKeyError
      // at request time when apiKey is undefined and OPENAI_API_KEY is unset, so
      // pass an explicit empty string (loadApiKey returns any string as-is).
      apiKey: "",
    });
  }
  return _ollamaOpenAI;
}

// ─── Registry ─────────────────────────────────────────────────────────
//
// Core (code-declared) entries: audited against live provider catalogs on
// 2026-08-13 (R2.3). Valid entries kept (gemini-3.1-flash-lite-preview,
// qwen3.5:9b verified); adapters added for openai / anthropic / openrouter.
// Additional providers are declared via config (R2.0) — see providersConfig.ts.

export const MODEL_REGISTRY: ModelInfo[] = [
  // ── Google ──────────────────────────────────────────────────────
  {
    id: "google/gemini-3.1-flash-lite-preview",
    name: "Gemini 3.1 Flash Lite",
    provider: "google",
    capabilities: { tools: true, streaming: true, structuredOutput: true },
    defaultFor: "CAPTAIN",
    verifiedAt: "2026-08-13",
  },
  {
    id: "google/gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "google",
    capabilities: { tools: true, streaming: true, structuredOutput: true },
    defaultFor: "ADMINISTRATOR",
    verifiedAt: "2026-08-13",
  },
  // ── Ollama ──────────────────────────────────────────────────────
  {
    id: "ollama/qwen3.5:9b",
    name: "Qwen 3.5 9B (Ollama)",
    provider: "ollama",
    capabilities: { tools: false, streaming: false, structuredOutput: false },
    verifiedAt: "2026-08-13",
  },
  {
    id: "ollama/llama3.2:3b",
    name: "Llama 3.2 3B (Ollama)",
    provider: "ollama",
    capabilities: { tools: true, streaming: true, structuredOutput: false },
    verifiedAt: "2026-08-13",
  },
  {
    id: "ollama/mistral:7b",
    name: "Mistral 7B (Ollama)",
    provider: "ollama",
    capabilities: { tools: true, streaming: true, structuredOutput: false },
    verifiedAt: "2026-08-13",
  },
  // ── OpenAI (R2.2 — via @ai-sdk/openai, real endpoint) ───────────
  {
    id: "openai/gpt-4.1-mini",
    name: "GPT-4.1 Mini",
    provider: "openai",
    capabilities: { tools: true, streaming: true, structuredOutput: true },
    verifiedAt: "2026-08-13",
  },
  // ── Anthropic (R2.2 — own adapter, non-OpenAI protocol) ──────────
  {
    id: "anthropic/claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    provider: "anthropic",
    capabilities: { tools: true, streaming: true, structuredOutput: true },
    verifiedAt: "2026-08-13",
  },
  // ── OpenRouter (R2.4 — via @ai-sdk/openai, baseURL + headers) ────
  {
    id: "openrouter/anthropic/claude-sonnet-4.5",
    name: "Claude Sonnet 4.5 (OpenRouter)",
    provider: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    headers: {
      "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000",
      "X-Title": "Tatachio Mirabel",
    },
    capabilities: { tools: true, streaming: true, structuredOutput: true },
    verifiedAt: "2026-08-13",
  },
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
 * Maps a config-declared provider (R2.0) into ModelInfo entries.
 *
 * OpenAI-compatible providers share the "openai" adapter; the declared
 * baseURL is the discriminator at createModel time. Only "anthropic" has its
 * own adapter (non-OpenAI protocol).
 */
function configProviderToModelInfos(provider: ConfigProvider): ModelInfo[] {
  return provider.models.map((model) => ({
    id: `${provider.provider}/${model.id}`,
    name: model.name,
    provider: provider.provider === "anthropic" ? "anthropic" : "openai",
    capabilities: {
      tools: model.capabilities?.tools ?? true,
      streaming: model.capabilities?.streaming ?? true,
      structuredOutput: model.capabilities?.structuredOutput ?? false,
    },
    defaultFor: model.defaultFor,
    baseURL: provider.baseURL,
    apiKeyEnv: provider.apiKeyEnv,
    headers: provider.headers,
    verifiedAt: "2026-08-13",
  }));
}

let _configWarningLogged = false;

/**
 * Config-declared models (R2.0). Loaded lazily on every call so env changes
 * are honored; malformed config logs a warning ONCE and falls back to the
 * core providers (no crash — design "Error Handling & Edge Cases").
 */
function getConfigDeclaredModels(): ModelInfo[] {
  try {
    return loadProvidersConfig().flatMap(configProviderToModelInfos);
  } catch (error) {
    if (!_configWarningLogged) {
      console.warn(
        `[modelRegistry] ${(error as Error).message} — continuando solo con los providers core.`
      );
      _configWarningLogged = true;
    }
    return [];
  }
}

/**
 * Returns subset of MODEL_REGISTRY whose provider prerequisites are met,
 * merged with config-declared models whose declared apiKeyEnv is set.
 * This is the admin <select> source (R2.6/R2.7): only actually-available
 * models appear.
 */
export function getAvailableModels(): ModelInfo[] {
  const core = MODEL_REGISTRY.filter((m) => isProviderAvailable(m.provider));
  const declared = getConfigDeclaredModels().filter(
    (m) => !!m.apiKeyEnv && !!process.env[m.apiKeyEnv]
  );
  return [...core, ...declared];
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

/**
 * Extracts the provider model id — everything after the first slash.
 * e.g. "ollama/qwen3.5:9b" → "qwen3.5:9b";
 * "nvidia/deepseek-ai/deepseek-r1" → "deepseek-ai/deepseek-r1" (model ids may
 * contain slashes, e.g. NVIDIA NIM / OpenRouter org/model ids).
 */
function modelIdPart(info: ModelInfo): string {
  const slash = info.id.indexOf("/");
  return slash === -1 ? info.id : info.id.slice(slash + 1);
}

function createModel(info: ModelInfo): LanguageModel {
  switch (info.provider) {
    case "google":
      return google(modelIdPart(info)) as unknown as LanguageModel;
    case "ollama":
      // @ai-sdk/openai v3 routes provider(modelId) to the Responses API
      // (/responses); Ollama only exposes the chat-completions API, so go
      // through provider.chat() → POST {baseURL}/chat/completions.
      return getOllamaOpenAIProvider().chat(modelIdPart(info)) as unknown as LanguageModel;
    case "anthropic":
      // Non-OpenAI protocol — its own adapter (R2.2).
      return anthropic(modelIdPart(info)) as unknown as LanguageModel;
    case "openai": {
      // Real OpenAI (no baseURL) + every config-declared OpenAI-compatible
      // provider (baseURL discriminator, R2.0). chat() = chat completions,
      // the wire format NVIDIA NIM / DeepSeek / OpenRouter all expose.
      const apiKey =
        info.apiKeyEnv && process.env[info.apiKeyEnv]
          ? process.env[info.apiKeyEnv]
          : (process.env.OPENAI_API_KEY ?? "");
      return createOpenAI({
        ...(info.baseURL ? { baseURL: info.baseURL } : {}),
        apiKey,
        ...(info.headers ? { headers: info.headers } : {}),
      }).chat(modelIdPart(info)) as unknown as LanguageModel;
    }
    case "openrouter":
      return createOpenAI({
        baseURL: info.baseURL ?? "https://openrouter.ai/api/v1",
        apiKey: process.env.OPENROUTER_API_KEY ?? "",
        headers: info.headers ?? {
          "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000",
          "X-Title": "Tatachio Mirabel",
        },
      }).chat(modelIdPart(info)) as unknown as LanguageModel;
    default:
      throw new Error(`Proveedor no implementado: ${info.provider}`);
  }
}
