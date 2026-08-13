import type { GatewayProviderOptions } from "@ai-sdk/gateway";

// ─── Default Failover Chain (PR-3, R3.3/R3.4) ─────────────────────────
//
// The "Automático" path (obs 709): the admin <select> "Automático" option
// and ALL captain requests route through this HTTP-level failover chain.
// Primary model lives in the registry (google default per role); the
// providerOptions.gateway { order, models } tells the Vercel AI Gateway
// which providers/models to fall back to when the primary fails (5xx/429).
//
// VERIFIED against @ai-sdk/gateway@3.0.155 (2026-08-13):
// - order values are gateway provider slugs (docs: "promoted to the front").
// - models values are GatewayModelId strings. The GatewayModelId union is
//   OPEN (`| (string & {})`), so these ids typecheck; note the curated
//   catalog does NOT list gemini-2.0-flash nor any openrouter/* id —
//   server-side routing is unverifiable offline (design risk, flagged).
export const DEFAULT_FAILOVER_CHAIN = {
  order: ["google", "openrouter"],
  models: [
    "google/gemini-2.0-flash",
    "openrouter/anthropic/claude-sonnet-4.5",
  ],
} as const;

/**
 * Builds the per-request `providerOptions.gateway` payload for streamText.
 *
 * CAPTAIN and ADMINISTRATOR share the same chain by default (R3.4); `rol` is
 * accepted so a future per-role chain only swaps the constant. The order and
 * models arrays are copied so callers cannot mutate the shared default.
 *
 * NOTE: `satisfies GatewayProviderOptions` (the SDK docs pattern) verifies the
 * literal against the gateway schema while keeping the inferred JSON-safe
 * type — widening to the full GatewayProviderOptions type would fail
 * streamText's `SharedV3ProviderOptions` (its `byok` field is not a JSONValue).
 */
export function buildGatewayProviderOptions(rol: string) {
  return {
    gateway: {
      order: [...DEFAULT_FAILOVER_CHAIN.order],
      models: [...DEFAULT_FAILOVER_CHAIN.models],
    } satisfies GatewayProviderOptions,
  };
}
