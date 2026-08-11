import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import prisma from "../database.js";
import { memberSchema, ageFromFechaNacimiento, MAX_PLAUSIBLE_AGE_YEARS } from "@tatachio/shared";
import type { Prisma } from "@prisma/client";
import { applyCabildoScope } from "../middleware/authMiddleware.js";

function ageWarnings(validatedData: { fechaNacimiento?: string }): string[] {
  if (!validatedData.fechaNacimiento) return [];
  const age = ageFromFechaNacimiento(validatedData.fechaNacimiento);
  if (age > MAX_PLAUSIBLE_AGE_YEARS) {
    return [`fechaNacimiento sugiere edad extrema (>${MAX_PLAUSIBLE_AGE_YEARS} años, calculada ${age}). Verificar posible error de transcripción.`];
  }
  return [];
}

export const createMember = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = memberSchema.parse(req.body);
    const userRole = req.usuario?.rol;
    const userCabildoId = req.usuario?.cabildoId;

    let cabildoId: string;
    if (userRole === "CAPTAIN") {
      if (validatedData.cabildoId && validatedData.cabildoId !== userCabildoId) {
        return res.status(403).json({ error: "cabildoId en el body no coincide con el del JWT" });
      }
      if (!userCabildoId) {
        return res.status(400).json({ error: "CAPTAIN sin cabildoId asignado" });
      }
      cabildoId = userCabildoId;
    } else if (userRole === "ADMINISTRATOR") {
      if (!validatedData.cabildoId) {
        return res.status(400).json({ error: "cabildoId es requerido para ADMINISTRATOR" });
      }
      cabildoId = validatedData.cabildoId;
    } else {
      // Inalcanzable: la ruta POST /api/miembros exige isCaptain (CAPTAIN|ADMINISTRATOR).
      return res.status(403).json({ error: "Rol no autorizado" });
    }

    // CAPTAIN: never let a client-supplied cabildoId reach the create input
    // (issue #45). The JWT cabildoId is authoritative; the 403 mismatch check
    // above stays as defense-in-depth, but the body value can never win.
    let dataToCreate: Prisma.MiembroUncheckedCreateInput;
    if (userRole === "CAPTAIN") {
      const { cabildoId: _bodyCabildoId, ...rest } = validatedData;
      void _bodyCabildoId;
      dataToCreate = { ...rest, cabildoId };
    } else {
      // ADMINISTRATOR: body cabildoId is legitimately required (validated above).
      dataToCreate = { ...validatedData, cabildoId };
    }
    const nuevoMiembro = await prisma.miembro.create({ data: dataToCreate });

    const warnings = ageWarnings(dataToCreate);
    res.status(201).json(warnings.length > 0 ? { ...nuevoMiembro, warnings } : nuevoMiembro);
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    next(error);
  }
};

export const getMembers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, cabildoId } = req.query;
    const where: Prisma.MiembroWhereInput = {};

    if (search) {
      where.OR = [
        { nombres: { contains: search as string } },
        { apellidos: { contains: search as string } },
        { numeroDocumento: { contains: search as string } },
      ];
    }

    // Admin can filter by cabildoId query param; Captain is scoped to JWT
    if (req.usuario?.rol === "ADMINISTRATOR" && cabildoId) {
      where.cabildoId = cabildoId as string;
    }

    applyCabildoScope(req, where);

    const miembros = await prisma.miembro.findMany({
      where,
      include: {
        familia: true,
      },
    });
    res.json(miembros);
  } catch (error: unknown) {
    next(error);
  }
};

export const getMemberById = async (req: Request, res: Response, next: NextFunction) => {
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

    if (req.usuario?.rol === "CAPTAIN" && miembro.cabildoId !== req.usuario.cabildoId) {
      return res.status(404).json({ error: "Miembro no encontrado" });
    }

    res.json(miembro);
  } catch (error: unknown) {
    next(error);
  }
};

export const updateMember = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const validatedData = memberSchema.partial().parse(req.body);

    const miembro = await prisma.miembro.findUnique({ where: { id: id as string } });
    
    if (!miembro) {
      return res.status(404).json({ error: "Miembro no encontrado" });
    }
    
    if (req.usuario?.rol === "CAPTAIN" && miembro.cabildoId !== req.usuario.cabildoId) {
      return res.status(404).json({ error: "Miembro no encontrado" });
    }

    const miembroActualizado = await prisma.miembro.update({
      where: { id: id as string },
      data: validatedData,
    });

    const warnings = ageWarnings(validatedData);
    res.json(warnings.length > 0 ? { ...miembroActualizado, warnings } : miembroActualizado);
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    next(error);
  }
};

export const deleteMember = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const miembro = await prisma.miembro.findUnique({ where: { id: id as string } });
    
    if (!miembro) {
      return res.status(404).json({ error: "Miembro no encontrado" });
    }
    
    if (req.usuario?.rol === "CAPTAIN" && miembro.cabildoId !== req.usuario.cabildoId) {
      return res.status(404).json({ error: "Miembro no encontrado" });
    }
    
    await prisma.miembro.delete({
      where: { id: id as string },
    });
    res.status(204).send();
  } catch (error: unknown) {
    next(error);
  }
};
