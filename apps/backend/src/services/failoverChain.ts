import type { GatewayProviderOptions } from "@ai-sdk/gateway";

// ─── Default Failover Chain (PR-3, R3.3/R3.4) ─────────────────────────
//
// The "Automático" path (obs 709): the admin <select> "Automático" option
// and ALL captain requests route through this HTTP-level failover chain.
// Primary model lives in the registry (google default per role); the
// providerOptions.gateway { order, models } tells the Vercel AI Gateway
// which providers/models to fall back to when the primary fails (5xx/429).
//
// VERIFIED against the @ai-sdk/gateway@3.0.155 curated GatewayModelId
// catalog (2026-08-13, review PR-3 finding 1): every id below is an exact
// catalog member — gemini-3.1-flash-lite-preview, deepseek-r1, llama-3.3-70b.
// The previous chain used gemini-2.0-flash and openrouter/* ids that are NOT
// in the catalog. OpenRouter and NVIDIA remain DIRECT providers via the
// data-driven registry (providers.json / EXTRA_PROVIDERS_JSON, R2.0) — they
// are not gateway models and never belong in this chain.
export const DEFAULT_FAILOVER_CHAIN = {
  order: ["google", "deepseek", "meta"],
  models: [
    "google/gemini-3.1-flash-lite-preview",
    "deepseek/deepseek-r1",
    "meta/llama-3.3-70b",
  ],
} as const;

/**
 * Builds the per-request `providerOptions.gateway` payload for streamText.
 *
 * CAPTAIN and ADMINISTRATOR share the same chain by default (R3.4), so the
 * builder takes no arguments (review PR-3 finding 3). The order and models
 * arrays are copied so callers cannot mutate the shared default.
 *
 * NOTE: `satisfies GatewayProviderOptions` (the SDK docs pattern) verifies the
 * literal against the gateway schema while keeping the inferred JSON-safe
 * type — widening to the full GatewayProviderOptions type would fail
 * streamText's `SharedV3ProviderOptions` (its `byok` field is not a JSONValue).
 */
export function buildGatewayProviderOptions() {
  return {
    gateway: {
      order: [...DEFAULT_FAILOVER_CHAIN.order],
      models: [...DEFAULT_FAILOVER_CHAIN.models],
    } satisfies GatewayProviderOptions,
  };
}
