import { Request, Response } from "express";
import prisma from "../database.js";
import { ZodError } from "zod";

export const assignCapitana = async (req: Request, res: Response) => {
  try {
    const { cabildoId, usuarioId } = req.params;

    // Check if usuario exists and has CAPITANA rol
    const usuario = await prisma.usuario.findUnique({
      where: { id: usuarioId },
    });

    if (!usuario) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    if (usuario.rol !== "CAPITANA") {
      return res.status(400).json({ error: "Solo los usuarios con rol CAPITANA pueden ser asignados como capitana" });
    }

    // Check if usuario already has a cabildo assignment
    const usuarioCabildoExistente = await prisma.usuarioCabildo.findUnique({
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
    res.status(500).json({ error: "Error al asignar capitana" });
  }
};

export const removeCapitana = async (req: Request, res: Response) => {
  try {
    const { cabildoId, usuarioId } = req.params;

    // Find the UsuarioCabildo entry
    const usuarioCabildo = await prisma.usuarioCabildo.findUnique({
      where: {
        cabildoId_usuarioId: {
          cabildoId,
          usuarioId,
        },
      },
    });

    if (!usuarioCabildo) {
      return res.status(404).json({ error: "Asignación de capitana no encontrada" });
    }

    // Remove the UsuarioCabildo entry
    await prisma.usuarioCabildo.delete({
      where: {
        cabildoId_usuarioId: {
          cabildoId,
          usuarioId,
        },
      },
    });

    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Error al remover capitana" });
  }
};