import { tool } from "ai";
import { z } from "zod";
import prisma from "../../database.js";

export const getMiembroByIdTool = tool({
  description:
    "Obtiene los detalles completos de un miembro por su ID. " +
    "Incluye información de la familia y el cabildo al que pertenece.",
  parameters: z.object({
    id: z.string().describe("UUID del miembro"),
  }),
  execute: async ({ id }: { id: string }) => {
    const miembro = await prisma.miembro.findUnique({
      where: { id },
      include: {
        familia: { select: { id: true, numero: true, direccion: true } },
        cabildo: { select: { id: true, nombre: true } },
      },
    });

    if (!miembro) {
      return { encontrado: false, mensaje: "Miembro no encontrado" };
    }

    return {
      encontrado: true,
      miembro: {
        id: miembro.id,
        nombre: `${miembro.nombres} ${miembro.apellidos}`,
        documento: miembro.numeroDocumento,
        tipoIdentificacion: miembro.tipoIdentificacion,
        sexo: miembro.sexo,
        fechaNacimiento: miembro.fechaNacimiento,
        parentesco: miembro.parentesco,
        estadoCivil: miembro.estadoCivil,
        profesion: miembro.profesion,
        escolaridad: miembro.escolaridad,
        integrantes: miembro.integrantes,
        direccion: miembro.direccion,
        telefono: miembro.telefono,
        estado: miembro.estado,
        familia: miembro.familia,
        cabildo: miembro.cabildo,
      },
    };
  },
});
