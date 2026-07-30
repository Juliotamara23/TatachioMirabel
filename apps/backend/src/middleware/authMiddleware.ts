import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

interface TokenPayload {
  id: string;
  rol: string;
  cabildoId: string | null;
}

// Extender la interfaz Request de Express para incluir al usuario
declare module "express" {
  interface Request {
    usuario?: TokenPayload;
  }
}

/**
 * Inyecta cabildoId al where_clause para captains; deja where intacto para ADMIN o sin cabildo
 */
export function applyCabildoScope(req: Request, where: Record<string, unknown>): void {
  if (req.usuario?.rol === "CAPTAIN" && req.usuario?.cabildoId) {
    where.cabildoId = req.usuario.cabildoId;
  }
}

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token no proporcionado o formato inválido" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    req.usuario = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
};

// Middleware opcional para restringir por rol (enfocado en ADMIN por ahora)
export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.usuario?.rol !== "ADMINISTRATOR") {
    return res.status(403).json({ error: "Acceso denegado: se requieren permisos de administrator" });
  }
  next();
};

export const isCaptain = (req: Request, res: Response, next: NextFunction) => {
  if (req.usuario?.rol !== "CAPTAIN" && req.usuario?.rol !== "ADMINISTRATOR") {
    return res.status(403).json({ error: "Acceso denegado" });
  }
  next();
};
