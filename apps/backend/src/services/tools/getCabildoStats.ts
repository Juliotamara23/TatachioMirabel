import { tool } from "ai";
import { z } from "zod";
import prisma from "../../database.js";

export const getCabildoStatsTool = tool({
  description:
    "Obtiene estadísticas agregadas de un cabildo: total de miembros, " +
    "distribución por sexo, estado y escolaridad. Si no se especifica " +
    "cabildoId, usa el primer cabildo activo.",
  inputSchema: z.object({
    cabildoId: z
      .string()
      .optional()
      .describe("UUID del cabildo (opcional, usa el primero activo si no se especifica)"),
  }),
  execute: async ({ cabildoId }: { cabildoId?: string }) => {
    // Resolve cabildoId: use provided or find first active
    let resolvedCabildoId = cabildoId;
    if (!resolvedCabildoId) {
      const firstCabildo = await prisma.cabildo.findFirst({
        where: { activo: true },
        select: { id: true },
      });
      if (!firstCabildo) {
        return { error: "No hay cabildos activos registrados" };
      }
      resolvedCabildoId = firstCabildo.id;
    }

    const whereClause = { cabildoId: resolvedCabildoId, activo: true };

    const [totalMiembros, porSexo, porEstado, porEscolaridad, totalFamilias] =
      await Promise.all([
        prisma.miembro.count({ where: whereClause }),
        prisma.miembro.groupBy({
          by: ["sexo"],
          where: whereClause,
          _count: { id: true },
        }),
        prisma.miembro.groupBy({
          by: ["estado"],
          where: whereClause,
          _count: { id: true },
        }),
        prisma.miembro.groupBy({
          by: ["escolaridad"],
          where: whereClause,
          _count: { id: true },
        }),
        prisma.familia.count({
          where: { cabildoId: resolvedCabildoId },
        }),
      ]);

    return {
      cabildoId: resolvedCabildoId,
      totalMiembros,
      totalFamilias,
      porSexo: porSexo.map((g) => ({ sexo: g.sexo, cantidad: g._count.id })),
      porEstado: porEstado.map((g) => ({
        estado: g.estado,
        cantidad: g._count.id,
      })),
      porEscolaridad: porEscolaridad.map((g) => ({
        escolaridad: g.escolaridad,
        cantidad: g._count.id,
      })),
    };
  },
});
