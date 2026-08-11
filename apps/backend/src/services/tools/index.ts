import type { ToolSet } from "ai";
import { searchMiembrosTool } from "./searchMiembros.js";
import { getMiembroByIdTool } from "./getMiembroById.js";
import { getFamiliaMembersTool } from "./getFamiliaMembers.js";
import { getCabildoStatsTool } from "./getCabildoStats.js";
import { createGetReporteDataTool } from "./getReporteData.js";

/**
 * Role-independent AI-callable tools. Each tool is a function-calling
 * definition consumable by `streamText({ tools: ... })`.
 *
 * getReporteData is intentionally NOT here: it is ADMIN-only and is built
 * dynamically inside getToolsForRole via createGetReporteDataTool(rol), so
 * the execute layer carries the caller's role and refuses non-admins
 * (issue #45).
 */
export const ALL_TOOLS = {
  searchMiembros: searchMiembrosTool,
  getMiembroById: getMiembroByIdTool,
  getFamiliaMembers: getFamiliaMembersTool,
  getCabildoStats: getCabildoStatsTool,
} satisfies ToolSet;

/**
 * Tools available to CAPTAIN role (read-only, no report data).
 * getReporteData must never be added here — it is ADMIN-only.
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
 * - ADMINISTRATOR: all 5 tools (getReporteData built with the role captured)
 * - CAPTAIN: 4 tools (excludes getReporteData)
 * - Unknown role: empty object
 */
export function getToolsForRole(rol: string): ToolSet {
  if (rol === "ADMINISTRATOR") {
    return { ...ALL_TOOLS, getReporteData: createGetReporteDataTool(rol) };
  }

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
