import { Request, Response } from "express";
import { z } from "zod";
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

// ─── Streaming helper ────────────────────────────────────────────────

/**
 * Streams a text stream to the Express response, harded against mid-stream
 * provider failures.
 *
 * ai@6.0.233's `pipeTextStreamToResponse` has no error hook: its internal
 * read loop re-throws from a fire-and-forget async function, so a provider
 * error mid-stream becomes an unhandled promise rejection that crashes the
 * process (Express 4 does not auto-await async handler rejections). This
 * helper inlines the same pipe loop with an explicit error path: it writes a
 * final SSE-style error event, logs the cause, and always ends the response.
 */
export async function streamTextToResponse(
  response: Response,
  textStream: ReadableStream<string>
): Promise<void> {
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  try {
    const reader = textStream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const canContinue = response.write(value);
      if (!canContinue) {
        await new Promise((resolve) => response.once("drain", resolve));
      }
    }
  } catch (error) {
    console.error("[chat] AI provider stream failed:", error);
    response.write('event: error\ndata: {"error":"AI provider stream failed"}\n\n');
  } finally {
    response.end();
  }
}

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

    const { result, modelInfo } = runChat(messages, rol, {
      model,
      stream,
    });

    if (stream) {
      await streamTextToResponse(res, result.textStream);
      return;
    }

    // Non-streaming: await text and return JSON
    const steps = await result.steps;
    const text = await result.text;
    res.json({
      text,
      steps: steps.length,
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
