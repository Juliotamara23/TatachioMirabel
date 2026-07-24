import { tool } from "ai";
import { z } from "zod";
import prisma from "../../database.js";

/**
 * ADMIN-only tool: fetches report data with member details.
 */
export const getReporteDataTool = tool({
  description:
    "Obtiene los datos de un reporte específico incluyendo las altas y bajas. " +
    "SOLO disponible para administradores.",
  parameters: z.object({
    reporteId: z.string().describe("UUID del reporte"),
  }),
  execute: async ({ reporteId }: { reporteId: string }) => {
    const reporte = await prisma.reporte.findUnique({
      where: { id: reporteId },
      include: {
        miembrosAltas: {
          select: {
            id: true,
            nombres: true,
            apellidos: true,
            numeroDocumento: true,
            sexo: true,
            fechaNacimiento: true,
            parentesco: true,
          },
        },
        miembrosBajas: {
          select: {
            id: true,
            nombres: true,
            apellidos: true,
            numeroDocumento: true,
            sexo: true,
            fechaNacimiento: true,
            parentesco: true,
          },
        },
      },
    });

    if (!reporte) {
      return { encontrado: false, mensaje: "Reporte no encontrado" };
    }

    return {
      encontrado: true,
      reporte: {
        id: reporte.id,
        tipo: reporte.tipo,
        vigencia: reporte.vigencia,
        estado: reporte.estado,
        novedad: reporte.novedad,
        altas: reporte.miembrosAltas.map((m) => ({
          id: m.id,
          nombre: `${m.nombres} ${m.apellidos}`,
          documento: m.numeroDocumento,
        })),
        bajas: reporte.miembrosBajas.map((m) => ({
          id: m.id,
          nombre: `${m.nombres} ${m.apellidos}`,
          documento: m.numeroDocumento,
        })),
      },
    };
  },
});
