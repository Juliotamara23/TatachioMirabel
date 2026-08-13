import { z } from "zod";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Data-driven provider registry config (R2.0, obs 709).
 *
 * Providers and their models are declared in configuration — env var
 * `EXTRA_PROVIDERS_JSON` (inline JSON) or a JSON file (`PROVIDERS_CONFIG_PATH`,
 * default `config/providers.json`) — so adding a NEW OpenAI-compatible provider
 * (NVIDIA NIM, DeepSeek, Qwen, Moonshot, Groq, Together, OpenRouter, ...)
 * requires ZERO code: only an API key + baseURL + model IDs in config.
 *
 * Shape (zod-validated):
 *   { providers: [{ provider, baseURL?, apiKeyEnv, headers?,
 *                   models: [{ id, name, defaultFor?, capabilities? }] }] }
 *
 * On malformed config this module throws {@link ProvidersConfigError} with a
 * clear message. The caller (modelRegistry) catches it, logs a warning, and
 * falls back to the core (code-declared) providers — the backend never crashes
 * because of a bad config file.
 */

// ─── Zod schemas (source of truth for the ConfigProvider types) ────

export const configModelSchema = z.object({
  /** Model id sent to the provider (e.g. "deepseek-ai/deepseek-r1"). */
  id: z.string().min(1),
  /** Display name for the admin model <select>. */
  name: z.string().min(1),
  defaultFor: z.enum(["CAPTAIN", "ADMINISTRATOR"]).optional(),
  capabilities: z
    .object({
      tools: z.boolean().optional(),
      streaming: z.boolean().optional(),
      structuredOutput: z.boolean().optional(),
    })
    .optional(),
});

export const configProviderSchema = z.object({
  /** Provider name/alias; OpenAI-compatible by default, "anthropic" = own adapter. */
  provider: z.string().min(1),
  /** OpenAI-compatible baseURL; omitted = real OpenAI endpoint. */
  baseURL: z.url().optional(),
  /** Env var that must be set for this provider to be available. */
  apiKeyEnv: z.string().min(1),
  /** Extra HTTP headers (e.g. OpenRouter HTTP-Referer / X-Title). */
  headers: z.record(z.string(), z.string()).optional(),
  models: z.array(configModelSchema).min(1),
});

export const providersConfigSchema = z.object({
  providers: z.array(configProviderSchema),
});

export type ConfigModel = z.infer<typeof configModelSchema>;
export type ConfigProvider = z.infer<typeof configProviderSchema>;
export type ProvidersConfig = z.infer<typeof providersConfigSchema>;

// ─── Error class ────────────────────────────────────────────────────

export class ProvidersConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProvidersConfigError";
  }
}

// ─── Loader ─────────────────────────────────────────────────────────

// Anchor the default config path to the backend package directory (3 levels up
// from src/services/), NOT to process.cwd(). This makes `config/providers.json`
// resolve identically whether the server is started from apps/backend/ or from
// the monorepo root (review WARNING, PR-2).
const BACKEND_DIR = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const DEFAULT_CONFIG_PATH = join(BACKEND_DIR, "config", "providers.json");

/**
 * Parses + zod-validates a raw JSON string declaring providers.
 *
 * @throws {ProvidersConfigError} when the JSON is malformed or fails the schema.
 */
export function parseProvidersConfig(raw: string, source: string): ConfigProvider[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new ProvidersConfigError(
      `[providers] Config JSON inválido en ${source}: ${(error as Error).message}`
    );
  }

  const result = providersConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new ProvidersConfigError(
      `[providers] Config de proveedores inválido en ${source}: ${issues}`
    );
  }

  return result.data.providers;
}

/**
 * Loads the config-declared providers.
 *
 * Source priority:
 * 1. `EXTRA_PROVIDERS_JSON` env var (inline JSON)
 * 2. File at `PROVIDERS_CONFIG_PATH` env var
 * 3. Default file `config/providers.json` (only if it exists)
 *
 * Returns `[]` when no config is declared. Throws {@link ProvidersConfigError}
 * on malformed config — the caller decides how to degrade.
 */
export function loadProvidersConfig(
  env: NodeJS.ProcessEnv = process.env
): ConfigProvider[] {
  const inline = env.EXTRA_PROVIDERS_JSON;
  if (inline) return parseProvidersConfig(inline, "EXTRA_PROVIDERS_JSON");

  const path = env.PROVIDERS_CONFIG_PATH ?? DEFAULT_CONFIG_PATH;
  if (existsSync(path)) {
    return parseProvidersConfig(readFileSync(path, "utf8"), path);
  }

  return [];
}
