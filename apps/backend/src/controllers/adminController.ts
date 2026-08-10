import { Request, Response } from "express";
import prisma from "../database.js";
import { ZodError } from "zod";
import { paramString } from "../utils/params.js";

export const assignCapitana = async (req: Request, res: Response) => {
  try {
    const cabildoId = paramString(req.params.cabildoId);
    const usuarioId = paramString(req.params.usuarioId);

    // Check if usuario exists and has CAPTAIN rol
    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
    });

    if (!usuario) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    if (usuario.rol !== "CAPTAIN") {
      return res.status(400).json({ error: "Solo los usuarios con rol CAPTAIN pueden ser asignados como captain" });
    }

    // Check if usuario already has a cabildo assignment
    const usuarioCabildoExistente = await prisma.usuarioCabildo.findFirst({
      where: { usuarioId },
    });

    if (usuarioCabildoExistente) {
      return res.status(409).json({ error: "El usuario ya tiene una asignación de cabildo" });
    }

    // Create UsuarioCabildo entry
    const usuarioCabildo = await prisma.usuarioCabildo.create({
      data: {
        cabildoId,
        usuarioId,
      },
    });

    res.status(201).json(usuarioCabildo);
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    res.status(500).json({ error: "Error al asignar captain" });
  }
};

export const removeCapitana = async (req: Request, res: Response) => {
  try {
    const cabildoId = paramString(req.params.cabildoId);
    const usuarioId = paramString(req.params.usuarioId);

    // Find the UsuarioCabildo entry
    const usuarioCabildo = await prisma.usuarioCabildo.findUnique({
      where: {
        usuarioId_cabildoId: {
          usuarioId,
          cabildoId,
        },
      },
    });

    if (!usuarioCabildo) {
      return res.status(404).json({ error: "Asignación de captain no encontrada" });
    }

    // Remove the UsuarioCabildo entry
    await prisma.usuarioCabildo.delete({
      where: {
        usuarioId_cabildoId: {
          usuarioId,
          cabildoId,
        },
      },
    });

    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Error al remover captain" });
  }
};