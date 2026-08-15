import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../database.js";
import { JWT_SECRET } from "../middleware/authMiddleware.js";

/**
 * Crea el primer ADMINISTRATOR desde variables de entorno si no existe ninguno.
 * Se ejecuta al arrancar el backend (bootstrap inicial, issue #38).
 * Env: ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NOMBRE
 */
export async function ensureInitialAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const nombre = process.env.ADMIN_NOMBRE;

  // Si no se configuran credenciales de admin, no hay nada que crear
  if (!email || !password) return;

  const adminExistente = await prisma.usuario.findFirst({
    where: { rol: "ADMINISTRATOR" },
  });
  if (adminExistente) return;

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.usuario.create({
    data: {
      email,
      passwordHash,
      nombre: nombre || "Administrador",
      rol: "ADMINISTRATOR",
    },
  });
  console.log(`[auth] Primer administrador creado: ${email}`);
}

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

    // Role-cabildo mutual exclusion (issue #72):
    // CAPTAIN requires exactly one cabildo assignment; ADMINISTRATOR must NOT
    // have one. Catching mismatches here prevents orphan captains and admin
    // accounts that silently inherit a cabildo scope. Unknown roles are
    // rejected explicitly (R1-003) instead of falling through to the DB.
    if (rol !== "CAPTAIN" && rol !== "ADMINISTRATOR") {
      return res.status(400).json({ error: `Invalid rol: ${rol}. Expected CAPTAIN or ADMINISTRATOR` });
    }
    if (rol === "CAPTAIN") {
      if (!cabildoId) {
        return res.status(400).json({ error: "cabildoId is required for CAPTAIN role" });
      }
    } else if (rol === "ADMINISTRATOR") {
      if (cabildoId) {
        return res.status(400).json({ error: "ADMINISTRATOR cannot have a cabildo assignment" });
      }
    }

    if (cabildoId) {
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
      return res.status(409).json({ error: "El correo ya está registrado" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Atomic user + cabildo assignment (issue #72): if the UsuarioCabildo
    // insert fails, the Usuario row must not survive either.
    const nuevoUsuario = await prisma.$transaction(async (tx) => {
      const usuario = await tx.usuario.create({
        data: {
          email,
          passwordHash,
          nombre,
          rol: (rol as "ADMINISTRATOR" | "CAPTAIN") || "CAPTAIN",
        },
      });

      if (rol === "CAPTAIN" && cabildoId) {
        await tx.usuarioCabildo.create({
          data: {
            usuarioId: usuario.id,
            cabildoId,
          },
        });
      }

      return usuario;
    });

    const { passwordHash: hash, ...usuarioSinPassword } = nuevoUsuario;
    void hash;
    res.status(201).json(usuarioSinPassword);
  } catch (error: unknown) {
    if (error instanceof Error) {
      res.status(500).json({ error: "Error al registrar usuario" });
    } else {
      res.status(500).json({ error: "Error al registrar usuario" });
    }
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

    if (usuario.rol === "CAPTAIN") {
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

    // Shape the user payload explicitly — never leak passwordHash or the
    // cabildos array (the CLI and frontend both expect this exact shape).
    const user = {
      id: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      rol: usuario.rol,
      cabildoId,
    };

    res.json({ token, user });
  } catch {
    res.status(500).json({ error: "Error en el login" });
  }
};
