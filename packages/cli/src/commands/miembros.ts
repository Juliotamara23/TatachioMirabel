import { Command } from "commander";
import { resolveToken, getBaseUrl } from "../config.js";
import { display, displayError, setExitCode } from "../display.js";
import { isPipeMode } from "../display.js";
import type { OutputMode } from "../types.js";
import { listMiembros, getMiembro, createMiembro, updateMiembro } from "../api/miembros.js";

const outputMode = (isPipeMode() ? "json" : "pretty") as OutputMode;

export async function listMiembrosCmd(
  search?: string,
  cabildoId?: string,
  rol?: string,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const token = await resolveToken();
    if (!token) throw new Error("No authentication token found. Please login first.");
    const baseUrl = await getBaseUrl();

    const params: { search?: string; cabildoId?: string; rol?: string } = {};
    if (search) params.search = search;
    if (cabildoId) params.cabildoId = cabildoId;
    if (rol) params.rol = rol;

    const result = await listMiembros(baseUrl, token, params);
    display(result, outputMode);
    setExitCode(0);
    return { success: true, data: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    displayError(err, outputMode);
    const status = (err as { status?: number }).status;
    setExitCode(status && status >= 500 ? 2 : 1);
    return { success: false, error: message };
  }
}

export async function getMiembroCmd(
  id: string,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const token = await resolveToken();
    if (!token) throw new Error("No authentication token found. Please login first.");
    const baseUrl = await getBaseUrl();

    const result = await getMiembro(baseUrl, token, id);
    display(result, outputMode);
    setExitCode(0);
    return { success: true, data: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    displayError(err, outputMode);
    const status = (err as { status?: number }).status;
    setExitCode(status && status >= 500 ? 2 : 1);
    return { success: false, error: message };
  }
}

export async function createMiembroCmd(
  fields?: Record<string, unknown>,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const token = await resolveToken();
    if (!token) throw new Error("No authentication token found. Please login first.");
    const baseUrl = await getBaseUrl();

    let data: Record<string, unknown>;
    if (isPipeMode() && fields) {
      data = fields;
    } else {
      console.log("Enter member details (press enter to skip optional fields):");
      const { input } = await import("@inquirer/prompts");

      const nombre = await input({ message: "Nombre:" });
      const apellidos = await input({ message: "Apellidos:" });
      const email = await input({ message: "Email:" });
      const telefono = await input({ message: "Teléfono (opcional):" });
      const rol = await input({ message: "Rol (opcional):" });
      const cabildoId = await input({ message: "Cabildo ID (opcional):" });

      data = {
        nombre: nombre || undefined,
        apellidos: apellidos || undefined,
        email: email || undefined,
        telefono: telefono || undefined,
        rol: rol || undefined,
        cabildoId: cabildoId || undefined,
      };

      const definedData = Object.entries(data).reduce((acc, [key, value]) => {
        if (value !== undefined) acc[key] = value;
        return acc;
      }, {} as Record<string, unknown>);
      data = definedData;
    }

    if (data && Object.keys(data).length > 0) {
      const result = await createMiembro(baseUrl, token, data);
      display(result, outputMode);
      setExitCode(0);
      return { success: true, data: result };
    } else {
      const error = new Error("No member data provided");
      displayError(error, outputMode);
      setExitCode(1);
      return { success: false, error: error.message };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    displayError(err, outputMode);
    const status = (err as { status?: number }).status;
    setExitCode(status && status >= 500 ? 2 : 1);
    return { success: false, error: message };
  }
}

export async function updateMiembroCmd(
  id: string,
  fields?: Record<string, unknown>,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const token = await resolveToken();
    if (!token) throw new Error("No authentication token found. Please login first.");
    const baseUrl = await getBaseUrl();

    let data: Record<string, unknown>;
    if (isPipeMode() && fields) {
      data = fields;
    } else {
      console.log("Enter fields to update (press enter to skip):");
      const { input } = await import("@inquirer/prompts");

      const nombre = await input({ message: "Nombre (opcional):" });
      const apellidos = await input({ message: "Apellidos (opcional):" });
      const email = await input({ message: "Email (opcional):" });
      const telefono = await input({ message: "Teléfono (opcional):" });
      const rol = await input({ message: "Rol (opcional):" });
      const cabildoId = await input({ message: "Cabildo ID (opcional):" });

      data = {
        nombre: nombre || undefined,
        apellidos: apellidos || undefined,
        email: email || undefined,
        telefono: telefono || undefined,
        rol: rol || undefined,
        cabildoId: cabildoId || undefined,
      };

      const definedData = Object.entries(data).reduce((acc, [key, value]) => {
        if (value !== undefined) acc[key] = value;
        return acc;
      }, {} as Record<string, unknown>);
      data = definedData;
    }

    const result = await updateMiembro(baseUrl, token, id, data);
    display(result, outputMode);
    setExitCode(0);
    return { success: true, data: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    displayError(err, outputMode);
    const status = (err as { status?: number }).status;
    setExitCode(status && status >= 500 ? 2 : 1);
    return { success: false, error: message };
  }
}

function setupMiembrosCommand(): void {
  const program = new Command();

  program
    .command("list")
    .description("List members")
    .option("--search <value>", "Filter by search term")
    .option("--cabildo-id <value>", "Filter by cabildo ID")
    .option("--rol <value>", "Filter by role")
    .action(async (options) => {
      await listMiembrosCmd(
        options.search,
        options.cabildoId,
        options.rol,
      );
    });

  program
    .command("get <id>")
    .description("Get member by ID")
    .action(async (id) => {
      await getMiembroCmd(id);
    });

  program
    .command("create")
    .description("Create a new member")
    .option("--json <jsonString>", "JSON string with member fields for pipe mode")
    .action(async (options) => {
      if (options.json && isPipeMode()) {
        try {
          const fields = JSON.parse(options.json);
          await createMiembroCmd(fields);
        } catch (err) {
          const error = new Error("Invalid JSON format");
          displayError(error, outputMode);
          setExitCode(1);
        }
      } else {
        await createMiembroCmd();
      }
    });

  program
    .command("update <id>")
    .description("Update a member")
    .option("--json <jsonString>", "JSON string with fields to update for pipe mode")
    .action(async (id, options) => {
      if (options.json && isPipeMode()) {
        try {
          const fields = JSON.parse(options.json);
          await updateMiembroCmd(id, fields);
        } catch (err) {
          const error = new Error("Invalid JSON format");
          displayError(error, outputMode);
          setExitCode(1);
        }
      } else {
        await updateMiembroCmd(id);
      }
    });

  program.parse();
}

export { setupMiembrosCommand };
