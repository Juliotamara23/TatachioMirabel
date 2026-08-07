import { Request, Response, NextFunction } from "express";

export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[ErrorHandler]", err);

  const prismaCode = (err as { code?: string })?.code;

  if (prismaCode === "P2002") {
    return res.status(409).json({ error: "Ya existe un registro con esos datos" });
  }
  if (prismaCode === "P2025") {
    return res.status(404).json({ error: "Registro no encontrado" });
  }
  if (prismaCode === "P2003") {
    return res.status(400).json({ error: "Referencia inválida: el registro relacionado no existe" });
  }

  res.status(500).json({ error: "Error interno del servidor" });
};
