import { Request, Response } from "express";
import { z } from "zod";
import { pipeTextStreamToResponse } from "ai";
import { runChat } from "../services/chatService.js";
import {
  ModelNotFoundError,
  NoModelsAvailableError,
} from "../services/modelRegistry.js";

// ─── Validation Schema ────────────────────────────────────────────────

const chatBodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string(),
      })
    )
    .min(1),
  model: z.string().optional(),
  stream: z.boolean().optional().default(true),
});

// ─── Handler ──────────────────────────────────────────────────────────

export const chatHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  const parsed = chatBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Cuerpo inválido",
      details: parsed.error.issues,
    });
    return;
  }

  try {
    const { messages, model, stream } = parsed.data;
    const rol = req.usuario!.rol;

    const { result, modelInfo } = await runChat(messages, rol, {
      model,
      stream,
    });

    if (stream) {
      pipeTextStreamToResponse({
        response: res,
        textStream: result.textStream,
      });
      return;
    }

    // Non-streaming: await and return JSON
    const awaited = await result;
    res.json({
      text: awaited.text,
      steps: awaited.steps?.length || 0,
      model: modelInfo.name,
    });
  } catch (error) {
    if (error instanceof ModelNotFoundError) {
      res.status(400).json({
        error: error.message,
        availableModels: error.availableModels,
      });
      return;
    }
    if (error instanceof NoModelsAvailableError) {
      res.status(503).json({
        error:
          "No hay modelos de IA disponibles. Configure una API key.",
      });
      return;
    }
    throw error; // Let errorHandler catch unknown errors
  }
};
