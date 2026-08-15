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

// Signals "the cabildo would be left without a captain" — thrown INSIDE the
// $transaction so the count+delete stays atomic (fix R4-001: two concurrent
// DELETE requests could previously both pass a standalone count guard and
// both delete, leaving zero captains).
class LastCaptainError extends Error {}

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

    // Business rule (issue #72): a cabildo must always have at least one
    // captain. The count guard and the delete run inside ONE $transaction
    // (SQLite serializes writes), so the check-then-act sequence is atomic
    // and two concurrent removals cannot both pass the guard.
    await prisma.$transaction(async (tx) => {
      const captainCount = await tx.usuarioCabildo.count({
        where: {
          cabildoId,
          usuario: { rol: "CAPTAIN" },
        },
      });

      if (captainCount <= 1) {
        throw new LastCaptainError();
      }

      await tx.usuarioCabildo.delete({
        where: {
          usuarioId_cabildoId: {
            usuarioId,
            cabildoId,
          },
        },
      });
    });

    res.status(204).send();
  } catch (error) {
    if (error instanceof LastCaptainError) {
      return res.status(409).json({ error: "El cabildo debe tener al menos una capitana" });
    }
    res.status(500).json({ error: "Error al remover captain" });
  }
};

/**
 * GET /api/admin/captains — list CAPTAIN users (admin-only).
 *
 * Optional query: `cabildoId=<uuid>` — filter to a single cabildo.
 * Without cabildoId: returns ALL captains (including unassigned "zombies"
 * with cabildoId: null, so the frontend can audit them).
 *
 * Response shape: flat `{ id, email, nombre, activo, cabildoId }` — never
 * leaks passwordHash.
 */
export const listCaptains = async (req: Request, res: Response) => {
  try {
    const cabildoId = req.query.cabildoId
      ? paramString(req.query.cabildoId as string | string[])
      : undefined;

    const where = cabildoId
      ? { rol: "CAPTAIN" as const, cabildos: { some: { cabildoId } } }
      : { rol: "CAPTAIN" as const };

    const captains = await prisma.usuario.findMany({
      where,
      select: {
        id: true,
        email: true,
        nombre: true,
        activo: true,
        cabildos: {
          select: { cabildoId: true },
        },
      },
    });

    // Flatten: a captain has at most one cabildo assignment (enforced by
    // assignCapitana 409). Map to the contract shape.
    const result = captains.map((c) => ({
      id: c.id,
      email: c.email,
      nombre: c.nombre,
      activo: c.activo,
      cabildoId: c.cabildos[0]?.cabildoId ?? null,
    }));

    res.status(200).json(result);
  } catch {
    res.status(500).json({ error: "Error al listar capitanas" });
  }
};