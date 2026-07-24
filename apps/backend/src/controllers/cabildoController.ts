import { Request, Response } from "express";
import prisma from "../database.js";
import { cabildoSchema } from "@tatachio/shared";

export const createCabildo = async (req: Request, res: Response) => {
  try {
    const validated = cabildoSchema.parse(req.body);
    const cabildo = await prisma.cabildo.create({ data: validated });
    res.status(201).json(cabildo);
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: error.issues });
    }
    if (error.code === "P2002") {
      return res.status(409).json({ error: "Ya existe un registro con esos datos" });
    }
    console.error(error);
    res.status(500).json({ error: "Error al crear cabildo" });
  }
};

export const getCabildos = async (_req: Request, res: Response) => {
  try {
    const cabildos = await prisma.cabildo.findMany();
    res.json(cabildos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener cabildos" });
  }
};

export const getCabildoById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const cabildo = await prisma.cabildo.findUnique({
      where: { id },
    });

    if (!cabildo) {
      return res.status(404).json({ error: "Cabildo no encontrado" });
    }

    res.json(cabildo);
  } catch (error) {
    console.error(error);
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
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: error.issues });
    }
    console.error(error);
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
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al eliminar cabildo" });
  }
};
