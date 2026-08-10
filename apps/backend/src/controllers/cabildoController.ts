import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import prisma from "../database.js";
import { cabildoSchema } from "@tatachio/shared";
import { paramString } from "../utils/params.js";

export const createCabildo = async (req: Request, res: Response, next: NextFunction) => {
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
    next(error);
  }
};

export const getCabildos = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // CAPTAIN: only see their assigned cabildo
    if (req.usuario?.rol === "CAPTAIN" && req.usuario?.cabildoId) {
      const cabildo = await prisma.cabildo.findUnique({
        where: { id: req.usuario.cabildoId },
      });
      return res.json(cabildo ? [cabildo] : []);
    }
    
    const cabildos = await prisma.cabildo.findMany();
    res.json(cabildos);
  } catch (error: unknown) {
    next(error);
  }
};

export const getCabildoById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = paramString(req.params.id);
    
    const cabildo = await prisma.cabildo.findUnique({ where: { id } });

    if (!cabildo) {
      return res.status(404).json({ error: "Cabildo no encontrado" });
    }
    
    // CAPTAIN: cannot access other cabildos
    if (req.usuario?.rol === "CAPTAIN" && req.usuario?.cabildoId && cabildo.id !== req.usuario.cabildoId) {
      return res.status(404).json({ error: "Cabildo no encontrado" });
    }

    res.json(cabildo);
  } catch (error: unknown) {
    next(error);
  }
};

export const updateCabildo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = paramString(req.params.id);
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
    next(error);
  }
};

export const deleteCabildo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = paramString(req.params.id);
    await prisma.cabildo.delete({
      where: { id },
    });
    res.status(204).send();
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    next(error);
  }
};
