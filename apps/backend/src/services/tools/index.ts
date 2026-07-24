import { searchMiembrosTool } from "./searchMiembros.js";
import { getMiembroByIdTool } from "./getMiembroById.js";
import { getFamiliaMembersTool } from "./getFamiliaMembers.js";
import { getCabildoStatsTool } from "./getCabildoStats.js";
import { getReporteDataTool } from "./getReporteData.js";

/**
 * All available AI-callable tools. Each tool is a function-calling
 * definition consumable by `streamText({ tools: ... })`.
 */
export const ALL_TOOLS = {
  searchMiembros: searchMiembrosTool,
  getMiembroById: getMiembroByIdTool,
  getFamiliaMembers: getFamiliaMembersTool,
  getCabildoStats: getCabildoStatsTool,
  getReporteData: getReporteDataTool,
};

/**
 * Tools available to CAPITANA role (read-only, no report data).
 */
const CAPITANA_ALLOWED = new Set([
  "searchMiembros",
  "getMiembroById",
  "getFamiliaMembers",
  "getCabildoStats",
]);

/**
 * Returns the subset of tools available for a given role.
 *
 * - ADMINISTRADOR: all 5 tools
 * - CAPITANA: 4 tools (excludes getReporteData)
 * - Unknown role: empty object
 */
export function getToolsForRole(rol: string): Record<string, unknown> {
  if (rol === "ADMINISTRADOR") return { ...ALL_TOOLS };

  if (rol === "CAPITANA") {
    const filtered: Record<string, unknown> = {};
    for (const [name, toolDef] of Object.entries(ALL_TOOLS)) {
      if (CAPITANA_ALLOWED.has(name)) {
        filtered[name] = toolDef;
      }
    }
    return filtered;
  }

  return {};
}
