import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

interface TokenPayload {
  id: string;
  rol: string;
}

// Extender la interfaz Request de Express para incluir al usuario
declare global {
  namespace Express {
    interface Request {
      usuario?: TokenPayload;
    }
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
  } catch (error) {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
};

// Middleware opcional para restringir por rol (enfocado en ADMIN por ahora)
export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.usuario?.rol !== "ADMINISTRADOR") {
    return res.status(403).json({ error: "Acceso denegado: se requieren permisos de administrador" });
  }
  next();
};

export const isCapitana = (req: Request, res: Response, next: NextFunction) => {
  if (req.usuario?.rol !== "CAPITANA" && req.usuario?.rol !== "ADMINISTRADOR") {
    return res.status(403).json({ error: "Acceso denegado" });
  }
  next();
};
