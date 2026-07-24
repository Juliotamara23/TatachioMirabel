import { Request, Response } from "express";
import { ZodError } from "zod";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import prisma from "../database.js";
import { familiaSchema } from "@tatachio/shared";

export const createFamilia = async (req: Request, res: Response) => {
  try {
    const validated = familiaSchema.parse(req.body);

    // Check cabildo exists before creating familia
    const cabildo = await prisma.cabildo.findUnique({
      where: { id: validated.cabildoId },
    });

    if (!cabildo) {
      return res.status(404).json({ error: "Cabildo no encontrado" });
    }

    const familia = await prisma.familia.create({ data: validated });
    res.status(201).json(familia);
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    if (error instanceof PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ error: "Ya existe un registro con esos datos" });
    }
    res.status(500).json({ error: "Error al crear familia" });
  }
};

export const getFamilias = async (req: Request, res: Response) => {
  try {
    const where: Record<string, unknown> = {};
    if (req.query.cabildoId) {
      where.cabildoId = req.query.cabildoId as string;
    }

    const familias = await prisma.familia.findMany({ where: where as { cabildoId?: string } });
    res.json(familias);
  } catch {
    res.status(500).json({ error: "Error al obtener familias" });
  }
};

export const getFamiliaById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const familia = await prisma.familia.findUnique({
      where: { id },
      include: { miembros: true },
    });

    if (!familia) {
      return res.status(404).json({ error: "Familia no encontrada" });
    }

    res.json(familia);
  } catch {
    res.status(500).json({ error: "Error al obtener familia" });
  }
};

export const updateFamilia = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
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
    res.status(500).json({ error: "Error al actualizar familia" });
  }
};

export const deleteFamilia = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.familia.delete({
      where: { id },
    });
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Error al eliminar familia" });
  }
};
