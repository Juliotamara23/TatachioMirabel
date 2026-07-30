import { Request, Response } from "express";
import { getAvailableModels } from "../services/modelRegistry.js";

export const listModels = (_req: Request, res: Response): void => {
  const models = getAvailableModels();
  res.json({
    models: models.map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      capabilities: m.capabilities,
    })),
    defaults: {
      ADMINISTRATOR: "google/gemini-2.0-flash",
      CAPTAIN: "google/gemma-4-1b-it",
    },
  });
};
