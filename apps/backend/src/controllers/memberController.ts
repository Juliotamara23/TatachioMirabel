import { Request, Response } from "express";
import prisma from "../database.js";
import { memberSchema } from "@tatachio/shared";

export const createMember = async (req: Request, res: Response) => {
  try {
    const validatedData = memberSchema.parse(req.body);

    const nuevoMiembro = await prisma.miembro.create({
      data: validatedData,
    });

    res.status(201).json(nuevoMiembro);
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: error.issues });
    }
    console.error(error);
    res.status(500).json({ error: "Error al crear miembro" });
  }
};

export const getMembers = async (req: Request, res: Response) => {
  try {
    const miembros = await prisma.miembro.findMany({
      include: {
        familia: true,
      },
    });
    res.json(miembros);
  } catch (error) {
    console.error(error);
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

    res.json(miembro);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener miembro" });
  }
};

export const updateMember = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = memberSchema.partial().parse(req.body);

    const miembroActualizado = await prisma.miembro.update({
      where: { id: id as string },
      data: validatedData,
    });

    res.json(miembroActualizado);
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: error.issues });
    }
    console.error(error);
    res.status(500).json({ error: "Error al actualizar miembro" });
  }
};

export const deleteMember = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.miembro.delete({
      where: { id: id as string },
    });
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al eliminar miembro" });
  }
};
