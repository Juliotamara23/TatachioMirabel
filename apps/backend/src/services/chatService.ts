import { streamText, stepCountIs, type ModelMessage } from "ai";
import { resolveModel } from "./modelRegistry.js";
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

  const result = streamText({
    model,
    messages,
    tools,
    system: SYSTEM_PROMPT,
    // AI SDK v6: maxSteps was replaced by stop conditions; stopWhen: stepCountIs(5)
    // preserves the previous maxSteps: 5 tool-loop limit.
    stopWhen: stepCountIs(5),
    toolChoice: "auto",
  });

  return { result, modelInfo: info };
}
