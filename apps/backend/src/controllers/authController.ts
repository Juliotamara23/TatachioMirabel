import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../database.js";

const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

interface RegisterBody {
  email?: string;
  password?: string;
  nombre?: string;
}

interface LoginBody {
  email?: string;
  password?: string;
}

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, nombre } = req.body as RegisterBody;

    if (!email || !password || !nombre) {
      return res.status(400).json({ error: "Faltan campos requeridos: email, password, nombre" });
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
      },
    });

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
    });

    if (!usuario || !(await bcrypt.compare(password, usuario.passwordHash))) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const token = jwt.sign({ id: usuario.id, rol: usuario.rol }, JWT_SECRET, {
      expiresIn: "1h",
    });

    res.json({ token });
  } catch {
    res.status(500).json({ error: "Error en el login" });
  }
};
