import { tool } from "ai";
import { z } from "zod";
import prisma from "../../database.js";

export const getFamiliaMembersTool = tool({
  description:
    "Obtiene todos los miembros que pertenecen a una familia específica. " +
    "Útil para consultas como '¿quiénes viven en la familia 15?'.",
  inputSchema: z.object({
    familiaId: z.string().describe("UUID de la familia"),
  }),
  execute: async ({ familiaId }: { familiaId: string }) => {
    const familia = await prisma.familia.findUnique({
      where: { id: familiaId },
      select: {
        id: true,
        numero: true,
        direccion: true,
        cabildo: { select: { id: true, nombre: true } },
      },
    });

    if (!familia) {
      return { encontrada: false, mensaje: "Familia no encontrada" };
    }

    const miembros = await prisma.miembro.findMany({
      where: { familiaId, activo: true },
      select: {
        id: true,
        nombres: true,
        apellidos: true,
        numeroDocumento: true,
        sexo: true,
        fechaNacimiento: true,
        parentesco: true,
        integrantes: true,
      },
      orderBy: { integrantes: "asc" },
    });

    return {
      familia: {
        id: familia.id,
        numero: familia.numero,
        direccion: familia.direccion,
        cabildo: familia.cabildo.nombre,
      },
      totalMiembros: miembros.length,
      miembros: miembros.map((m) => ({
        id: m.id,
        nombre: `${m.nombres} ${m.apellidos}`,
        documento: m.numeroDocumento,
        sexo: m.sexo,
        fechaNacimiento: m.fechaNacimiento,
        parentesco: m.parentesco,
        integrantes: m.integrantes,
      })),
    };
  },
});
