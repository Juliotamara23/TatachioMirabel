import { Request, Response } from "express";
import { getAvailableModels } from "../services/modelRegistry.js";

export const listModels = async (
  _req: Request,
  res: Response
): Promise<void> => {
  const models = getAvailableModels();
  res.json({
    models: models.map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      capabilities: m.capabilities,
    })),
    defaults: {
      ADMINISTRADOR: "google/gemini-2.0-flash",
      CAPITANA: "google/gemma-4-1b-it",
    },
  });
};
