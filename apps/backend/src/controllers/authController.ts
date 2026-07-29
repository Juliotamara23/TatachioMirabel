import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../database.js";

const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

interface RegisterBody {
  email?: string;
  password?: string;
  nombre?: string;
  rol?: string;
  cabildoId?: string;
}

interface LoginBody {
  email?: string;
  password?: string;
}

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, nombre, rol, cabildoId } = req.body as RegisterBody;

    if (!email || !password || !nombre || !rol) {
      return res.status(400).json({ error: "Faltan campos requeridos: email, password, nombre, rol" });
    }

    if (rol === "CAPITANA") {
      if (!cabildoId) {
        return res.status(400).json({ error: "cabildoId is required for CAPITANA role" });
      }

      const existsCabildo = await prisma.cabildo.findUnique({
        where: { id: cabildoId },
      });

      if (!existsCabildo) {
        return res.status(400).json({ error: "Cabildo not found" });
      }
    }

    const usuarioExistente = await prisma.usuario.findUnique({
      where: { email },
    });

    if (usuarioExistente) {
      return res.status(400).json({ error: "El correo ya está registrado" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const nuevoUsuario = await prisma.usuario.create({
      data: {
        email,
        passwordHash,
        nombre,
        rol: (rol as "ADMINISTRADOR" | "CAPITANA") || "CAPITANA",
      },
    });

    if (rol === "CAPITANA" && cabildoId) {
      await prisma.usuarioCabildo.create({
        data: {
          usuarioId: nuevoUsuario.id,
          cabildoId,
        },
      });
    }

    const { passwordHash: hash, ...usuarioSinPassword } = nuevoUsuario;
    void hash;
    res.status(201).json(usuarioSinPassword);
  } catch {
    res.status(500).json({ error: "Error al registrar usuario" });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as LoginBody;

    if (!email || !password) {
      return res.status(400).json({ error: "Faltan campos requeridos: email, password" });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { email },
      include: { cabildos: true },
    });

    if (!usuario || !(await bcrypt.compare(password, usuario.passwordHash))) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    // Determinar cabildoId basado en rol y cabildos asignados
    let cabildoId: string | null = null;

    if (usuario.rol === "CAPITANA") {
      if (usuario.cabildos.length === 0) {
        return res.status(403).json({ 
          error: "Capitana requires at least one cabildo assignment. Contact an administrator." 
        });
      }
      if (usuario.cabildos.length > 1) {
        return res.status(403).json({ 
          error: "Capitana has multiple cabildo assignments. Contact an administrator to resolve." 
        });
      }
      cabildoId = usuario.cabildos[0].cabildoId;
    }

    const token = jwt.sign(
      { id: usuario.id, rol: usuario.rol, cabildoId },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ token });
  } catch {
    res.status(500).json({ error: "Error en el login" });
  }
};
