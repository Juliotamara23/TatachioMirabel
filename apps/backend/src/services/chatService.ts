import { streamText, stepCountIs, type ModelMessage } from "ai";
import { resolveModel } from "./modelRegistry.js";
import { buildGatewayProviderOptions } from "./failoverChain.js";
import { getToolsForRole } from "./tools/index.js";

// ─── System Prompt ────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres la asistente virtual del Cabildo Indígena Tatachio Mirabel.
Tu función es ayudar a la captain y administratores a consultar y gestionar
los datos del censo poblacional.

INSTRUCCIONES:
- Responde SIEMPRE en español, de forma clara y respetuosa.
- Usa las herramientas disponibles para consultar la base de datos.
- Si te preguntan algo que requiere datos, USA las herramientas, no inventes.
- Para miembros del cabildo, usa nombres completos y formales.
- Si no encuentras información, dilo honestamente.
- Los datos son CONFIDENCIALES — solo comparte información agregada o
  la mínima necesaria para responder.
- El cabildo está ubicado en el resguardo Tatachio Mirabel.
- Las familias se identifican por número, no por nombre.`;

// ─── Public API ──────────────────────────────────────────────────────

export interface ChatOptions {
  model?: string;
  stream?: boolean;
}

export function runChat(
  messages: ModelMessage[],
  rol: string,
  options?: ChatOptions
) {
  const { model, info } = resolveModel(options?.model, rol);
  const tools = getToolsForRole(rol);

  // PR-3 (R3.7): when the gateway key is set, thread the failover chain
  // ("Automático", R3.4) into streamText so the Vercel AI Gateway can fall
  // back google → openrouter on 5xx/429. Computed once per request. When the
  // key is absent the providerOptions key is omitted entirely (R3.5 — direct
  // provider path sends no gateway options).
  const providerOptions = process.env.AI_GATEWAY_API_KEY
    ? buildGatewayProviderOptions(rol)
    : undefined;

  const result = streamText({
    model,
    messages,
    tools,
    system: SYSTEM_PROMPT,
    // AI SDK v6: maxSteps was replaced by stop conditions; stopWhen: stepCountIs(5)
    // preserves the previous maxSteps: 5 tool-loop limit.
    stopWhen: stepCountIs(5),
    toolChoice: "auto",
    ...(providerOptions ? { providerOptions } : {}),
  });

  return { result, modelInfo: info };
}
