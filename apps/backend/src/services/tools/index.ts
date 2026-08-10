import type { ToolSet } from "ai";
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
} satisfies ToolSet;

/**
 * Tools available to CAPTAIN role (read-only, no report data).
 */
const CAPTAIN_ALLOWED = new Set([
  "searchMiembros",
  "getMiembroById",
  "getFamiliaMembers",
  "getCabildoStats",
]);

/**
 * Returns the subset of tools available for a given role.
 *
 * - ADMINISTRATOR: all 5 tools
 * - CAPTAIN: 4 tools (excludes getReporteData)
 * - Unknown role: empty object
 */
export function getToolsForRole(rol: string): ToolSet {
  if (rol === "ADMINISTRATOR") return { ...ALL_TOOLS };

  if (rol === "CAPTAIN") {
    const filtered: ToolSet = {};
    for (const [name, toolDef] of Object.entries(ALL_TOOLS)) {
      if (CAPTAIN_ALLOWED.has(name)) {
        filtered[name] = toolDef;
      }
    }
    return filtered;
  }

  return {};
}
