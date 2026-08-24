import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import type { Prisma } from "@prisma/client";
import prisma from "../database.js";
import { familiaSchema } from "@tatachio/shared";
import { applyCabildoScope } from "../middleware/authMiddleware.js";
import { paramString } from "../utils/params.js";

export const createFamilia = async (req: Request, res: Response) => {
  try {
    const validated = familiaSchema.parse(req.body);
    const cabildoId = validated.cabildoId ?? (req.usuario?.cabildoId as string);

    // Check cabildo exists before creating familia
    const cabildo = await prisma.cabildo.findUnique({
      where: { id: cabildoId },
    });

    if (!cabildo) {
      return res.status(404).json({ error: "Cabildo no encontrado" });
    }

    // Auto-calculate sequential numero if not provided
    let numero: number;
    if (validated.numero != null) {
      numero = validated.numero;
    } else {
      const maxResult = await prisma.familia.aggregate({
        where: { cabildoId },
        _max: { numero: true },
      });
      numero = (maxResult._max.numero ?? 0) + 1;
    }

    const data: Prisma.FamiliaUncheckedCreateInput = {
      numero,
      direccion: validated.direccion,
      telefono: validated.telefono,
      cabildoId,
    };

    const familia = await prisma.familia.create({
      data,
    });
    res.status(201).json(familia);
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    res.status(500).json({ error: "Error al crear familia" });
  }
};

export const getFamilias = async (req: Request, res: Response) => {
  try {
    const where: Record<string, unknown> = {};

    // CAPTAIN: always scoped to their cabildo (JWT wins)
    // ADMIN: can filter by query param, or see all
    applyCabildoScope(req, where);

    if (!where.cabildoId && req.query.cabildoId) {
      where.cabildoId = req.query.cabildoId as string;
    }

    // Search filter: mirror memberController — case-insensitive contains on
    // string fields, plus exact match on `numero` when the whole query parses
    // as an integer. The CLI already sends `?search=` for familias.
    const search = req.query.search;
    if (typeof search === "string" && search.length > 0) {
      const orConditions: Record<string, unknown>[] = [
        { direccion: { contains: search } },
        { telefono: { contains: search } },
      ];
      const searchNum = Number.parseInt(search, 10);
      if (!Number.isNaN(searchNum) && String(searchNum) === search) {
        orConditions.push({ numero: { equals: searchNum } });
      }
      where.OR = orConditions;
    }

    const familias = await prisma.familia.findMany({
      where: where as { cabildoId?: string },
    });
    res.json(familias);
  } catch {
    res.status(500).json({ error: "Error al obtener familias" });
  }
};

export const getFamiliaById = async (req: Request, res: Response) => {
  try {
    const id = paramString(req.params.id);
    const familia = await prisma.familia.findUnique({
      where: { id },
      include: { miembros: true },
    });

    if (!familia) {
      return res.status(404).json({ error: "Familia no encontrada" });
    }

    // CAPTAIN: cannot access familias from other cabildos
    if (
      req.usuario?.rol === "CAPTAIN" &&
      req.usuario?.cabildoId &&
      familia.cabildoId !== req.usuario.cabildoId
    ) {
      return res.status(404).json({ error: "Familia no encontrada" });
    }

    res.json(familia);
  } catch {
    res.status(500).json({ error: "Error al obtener familia" });
  }
};

export const updateFamilia = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = paramString(req.params.id);
    const validated = familiaSchema.partial().parse(req.body);

    const familia = await prisma.familia.update({
      where: { id },
      data: validated,
    });

    res.json(familia);
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    next(error);
  }
};

export const deleteFamilia = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = paramString(req.params.id);

    // Get the family to delete and its cabildoId for renumbering
    const familiaToDelete = await prisma.familia.findUnique({
      where: { id },
    });

    if (!familiaToDelete) {
      return res.status(404).json({ error: "Familia no encontrada" });
    }

    const deletedNumero = familiaToDelete.numero;
    const cabildoId = familiaToDelete.cabildoId;

    // Use transaction: delete family + renumber subsequent families
    await prisma.$transaction(async (tx) => {
      // Delete the family
      await tx.familia.delete({ where: { id } });

      // Get all families in the same cabildo with numero > deleted
      const familiesToRenumber = await tx.familia.findMany({
        where: {
          cabildoId,
          numero: { gt: deletedNumero },
        },
        orderBy: { numero: "asc" },
      });

      // Decrement numero by 1 for each subsequent family
      for (const familia of familiesToRenumber) {
        await tx.familia.update({
          where: { id: familia.id },
          data: { numero: familia.numero - 1 },
        });
      }
    });

    res.status(204).send();
  } catch (error: unknown) {
    next(error);
  }
};
