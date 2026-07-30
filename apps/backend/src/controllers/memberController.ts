import { Request, Response } from "express";
import { ZodError } from "zod";
import prisma from "../database.js";
import { memberSchema } from "@tatachio/shared";
import type { Prisma } from "@prisma/client";
import { applyCabildoScope } from "../middleware/authMiddleware.js";

export const createMember = async (req: Request, res: Response) => {
  try {
    const validatedData = memberSchema.parse(req.body);
    const where: Record<string, unknown> = {};
    applyCabildoScope(req, where);

    const dataToCreate: {
      nombres: string;
      apellidos: string;
      numeroDocumento: string;
      email: string;
      estado: string;
      cabildoId?: string;
      familiaId?: string;
    } = { ...validatedData };
    if (where.cabildoId) {
      dataToCreate.cabildoId = where.cabildoId as string;
    }

    const nuevoMiembro = await prisma.miembro.create({
      data: dataToCreate,
    });

    res.status(201).json(nuevoMiembro);
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    void error; // Prevent unused variable warning
    res.status(500).json({ error: "Error al crear miembro" });
  }
};

export const getMembers = async (req: Request, res: Response) => {
  try {
    const { search } = req.query;
    const where: Prisma.MiembroWhereInput = {};
    
    if (search) {
      where.OR = [
        { nombres: { contains: search as string } },
        { apellidos: { contains: search as string } },
        { numeroDocumento: { contains: search as string } },
      ];
    }
    
    applyCabildoScope(req, where);

    const miembros = await prisma.miembro.findMany({
      where,
      include: {
        familia: true,
      },
    });
    res.json(miembros);
  } catch {
    res.status(500).json({ error: "Error al obtener miembros" });
  }
};

export const getMemberById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const miembro = await prisma.miembro.findUnique({
      where: { id: id as string },
      include: {
        familia: true,
      },
    });

    if (!miembro) {
      return res.status(404).json({ error: "Miembro no encontrado" });
    }

    if (req.usuario?.rol === "CAPITANA" && miembro.cabildoId !== req.usuario.cabildoId) {
      return res.status(404).json({ error: "Miembro no encontrado" });
    }

    res.json(miembro);
  } catch {
    res.status(500).json({ error: "Error al obtener miembro" });
  }
};

export const updateMember = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = memberSchema.partial().parse(req.body);

    const miembro = await prisma.miembro.findUnique({ where: { id: id as string } });
    
    if (!miembro) {
      return res.status(404).json({ error: "Miembro no encontrado" });
    }
    
    if (req.usuario?.rol === "CAPITANA" && miembro.cabildoId !== req.usuario.cabildoId) {
      return res.status(404).json({ error: "Miembro no encontrado" });
    }

    const miembroActualizado = await prisma.miembro.update({
      where: { id: id as string },
      data: validatedData,
    });

    res.json(miembroActualizado);
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    res.status(500).json({ error: "Error al actualizar miembro" });
  }
};

export const deleteMember = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const miembro = await prisma.miembro.findUnique({ where: { id: id as string } });
    
    if (!miembro) {
      return res.status(404).json({ error: "Miembro no encontrado" });
    }
    
    if (req.usuario?.rol === "CAPITANA" && miembro.cabildoId !== req.usuario.cabildoId) {
      return res.status(404).json({ error: "Miembro no encontrado" });
    }
    
    await prisma.miembro.delete({
      where: { id: id as string },
    });
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Error al eliminar miembro" });
  }
};
