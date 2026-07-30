import { Request, Response } from "express";
import { ZodError } from "zod";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import prisma from "../database.js";
import { cabildoSchema } from "@tatachio/shared";
import { applyCabildoScope } from "../middleware/authMiddleware.js";

export const createCabildo = async (req: Request, res: Response) => {
  try {
    const validated = cabildoSchema.parse(req.body);
    const cabildo = await prisma.cabildo.create({ data: validated });
    res.status(201).json(cabildo);
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    if (error instanceof PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ error: "Ya existe un registro con esos datos" });
    }
    res.status(500).json({ error: "Error al crear cabildo" });
  }
};

export const getCabildos = async (req: Request, res: Response) => {
  try {
    const where: Record<string, unknown> = {};
    
    applyCabildoScope(req, where);

    const cabildos = where.cabildoId 
      ? await prisma.cabildo.findMany({ where })
      : await prisma.cabildo.findMany();
      
    res.json(cabildos);
  } catch {
    res.status(500).json({ error: "Error al obtener cabildos" });
  }
};

export const getCabildoById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const where: Record<string, unknown> = {};
    
    applyCabildoScope(req, where);

    const cabildo = await prisma.cabildo.findUnique({
      where: where.cabildoId ? { id, cabildoId: where.cabildoId as string } : { id },
    });

    if (!cabildo) {
      return res.status(404).json({ error: "Cabildo no encontrado" });
    }

    res.json(cabildo);
  } catch {
    res.status(500).json({ error: "Error al obtener cabildo" });
  }
};

export const updateCabildo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validated = cabildoSchema.partial().parse(req.body);

    const cabildo = await prisma.cabildo.update({
      where: { id },
      data: validated,
    });

    res.json(cabildo);
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    res.status(500).json({ error: "Error al actualizar cabildo" });
  }
};

export const deleteCabildo = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.cabildo.delete({
      where: { id },
    });
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Error al eliminar cabildo" });
  }
};
