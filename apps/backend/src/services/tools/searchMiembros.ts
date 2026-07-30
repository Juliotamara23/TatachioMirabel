import { tool } from "ai";
import { z } from "zod";
import prisma from "../../database.js";

export const searchMiembrosTool = tool({
  description:
    "Busca miembros del cabildo por nombre, apellido o número de documento. " +
    "Útil cuando la captain pregunta '¿cómo está la familia de...?' o 'busca a Juan'.",
  parameters: z.object({
    query: z
      .string()
      .min(1)
      .describe("Texto de búsqueda (nombre, apellido o documento)"),
    limit: z
      .number()
      .optional()
      .default(10)
      .describe("Máximo resultados"),
  }),
  execute: async ({ query, limit }: { query: string; limit: number }) => {
    const miembros = await prisma.miembro.findMany({
      where: {
        OR: [
          { nombres: { contains: query.toUpperCase() } },
          { apellidos: { contains: query.toUpperCase() } },
          { numeroDocumento: { contains: query } },
        ],
        activo: true,
      },
      select: {
        id: true,
        nombres: true,
        apellidos: true,
        numeroDocumento: true,
        sexo: true,
        fechaNacimiento: true,
        familia: { select: { numero: true, direccion: true } },
        cabildo: { select: { nombre: true } },
      },
      take: limit,
    });

    return {
      encontrados: miembros.length,
      miembros: miembros.map((m) => ({
        id: m.id,
        nombre: `${m.nombres} ${m.apellidos}`,
        documento: m.numeroDocumento,
        familia: m.familia.numero,
        cabildo: m.cabildo.nombre,
        sexo: m.sexo,
        edad: m.fechaNacimiento,
      })),
    };
  },
});
