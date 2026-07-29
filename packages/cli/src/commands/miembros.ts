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

      const tipoIdentificacion = await input({ message: "Tipo de Identificación (CC, TI, RC, NUIP):" });
      const numeroDocumento = await input({ message: "Número de Documento:" });
      const nombres = await input({ message: "Nombres:" });
      const apellidos = await input({ message: "Apellidos:" });
      const fechaNacimiento = await input({ message: "Fecha de Nacimiento (DD/MM/YYYY):" });
      const parentesco = await input({ message: "Parentesco (PA, MA, CO, HE, CF, ES, HI, YR, NU, SU, SO, CU, TI, AB, NI):" });
      const sexo = await input({ message: "Sexo (M o F):" });
      const estadoCivil = await input({ message: "Estado Civil (S o C, opcional):" });
      const profesion = await input({ message: "Profesión (opcional):" });
      const escolaridad = await input({ message: "Escolaridad (PR, SE, UN, NI, opcional):" });
      const integrantes = await input({ message: "Integrantes:" });
      const direccion = await input({ message: "Dirección (opcional):" });
      const telefono = await input({ message: "Teléfono (opcional):" });
      const novedad = await input({ message: "Novedad (opcional):" });
      const familiaId = await input({ message: "Familia ID:" });
      const cabildoId = await input({ message: "Cabildo ID (opcional):" });

      const enumOptions = {
        tipoIdentificacion: ["CC", "TI", "RC", "NUIP"],
        parentesco: ["PA", "MA", "CO", "HE", "CF", "ES", "HI", "YR", "NU", "SU", "SO", "CU", "TI", "AB", "NI"],
        sexo: ["M", "F"],
        estadoCivil: ["S", "C"],
        escolaridad: ["PR", "SE", "UN", "NI"]
      };

      const validateEnum = (value: string, options: string[]) => {
        const normalizedValue = value.toUpperCase();
        if (!options.includes(normalizedValue)) {
          throw new Error(`Valor inválido. Opciones: ${options.join(", ")}`);
        }
        return normalizedValue as typeof options[number];
      };

      data = {
        tipoIdentificacion: validateEnum(tipoIdentificacion, enumOptions.tipoIdentificacion),
        numeroDocumento: numeroDocumento,
        nombres: nombres,
        apellidos: apellidos,
        fechaNacimiento: validateEnum(fechaNacimiento, ["DD/MM/YYYY"]),
        parentesco: validateEnum(parentesco, enumOptions.parentesco),
        sexo: validateEnum(sexo, enumOptions.sexo),
        estadoCivil: estadoCivil ? validateEnum(estadoCivil, enumOptions.estadoCivil) : undefined,
        profesion: profesion || undefined,
        escolaridad: escolaridad ? validateEnum(escolaridad, enumOptions.escolaridad) : undefined,
        integrantes: parseInt(integrantes, 10),
        direccion: direccion || undefined,
        telefono: telefono || undefined,
        novedad: novedad || undefined,
        familiaId: familiaId,
        cabildoId: cabildoId || undefined,
      };

      const definedData = Object.entries(data).reduce((acc, [key, value]) => {
        if (value !== undefined && value !== "" && value !== null) acc[key] = value;
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

      const tipoIdentificacion = await input({ message: "Tipo de Identificación (CC, TI, RC, NUIP, opcional):" });
      const numeroDocumento = await input({ message: "Número de Documento (opcional):" });
      const nombres = await input({ message: "Nombres (opcional):" });
      const apellidos = await input({ message: "Apellidos (opcional):" });
      const fechaNacimiento = await input({ message: "Fecha de Nacimiento (DD/MM/YYYY, opcional):" });
      const parentesco = await input({ message: "Parentesco (PA, MA, CO, HE, CF, ES, HI, YR, NU, SU, SO, CU, TI, AB, NI, opcional):" });
      const sexo = await input({ message: "Sexo (M o F, opcional):" });
      const estadoCivil = await input({ message: "Estado Civil (S o C, opcional):" });
      const profesion = await input({ message: "Profesión (opcional):" });
      const escolaridad = await input({ message: "Escolaridad (PR, SE, UN, NI, opcional):" });
      const integrantes = await input({ message: "Integrantes (opcional):" });
      const direccion = await input({ message: "Dirección (opcional):" });
      const telefono = await input({ message: "Teléfono (opcional):" });
      const novedad = await input({ message: "Novedad (opcional):" });
      const familiaId = await input({ message: "Familia ID (opcional):" });
      const cabildoId = await input({ message: "Cabildo ID (opcional):" });

      const enumOptions = {
        tipoIdentificacion: ["CC", "TI", "RC", "NUIP"],
        parentesco: ["PA", "MA", "CO", "HE", "CF", "ES", "HI", "YR", "NU", "SU", "SO", "CU", "TI", "AB", "NI"],
        sexo: ["M", "F"],
        estadoCivil: ["S", "C"],
        escolaridad: ["PR", "SE", "UN", "NI"]
      };

      const validateEnum = (value: string, options: string[]) => {
        if (!value || value.trim() === "") return undefined;
        const normalizedValue = value.toUpperCase();
        if (!options.includes(normalizedValue)) {
          throw new Error(`Valor inválido. Opciones: ${options.join(", ")}`);
        }
        return normalizedValue as typeof options[number];
      };

      data = {
        tipoIdentificacion: tipoIdentificacion ? validateEnum(tipoIdentificacion, enumOptions.tipoIdentificacion) : undefined,
        numeroDocumento: numeroDocumento || undefined,
        nombres: nombres || undefined,
        apellidos: apellidos || undefined,
        fechaNacimiento: fechaNacimiento ? validateEnum(fechaNacimiento, ["DD/MM/YYYY"]) : undefined,
        parentesco: parentesco ? validateEnum(parentesco, enumOptions.parentesco) : undefined,
        sexo: sexo ? validateEnum(sexo, enumOptions.sexo) : undefined,
        estadoCivil: estadoCivil ? validateEnum(estadoCivil, enumOptions.estadoCivil) : undefined,
        profesion: profesion || undefined,
        escolaridad: escolaridad ? validateEnum(escolaridad, enumOptions.escolaridad) : undefined,
        integrantes: integrantes ? parseInt(integrantes, 10) : undefined,
        direccion: direccion || undefined,
        telefono: telefono || undefined,
        novedad: novedad || undefined,
        familiaId: familiaId || undefined,
        cabildoId: cabildoId || undefined,
      };

      const definedData = Object.entries(data).reduce((acc, [key, value]) => {
        if (value !== undefined && value !== "" && value !== null) acc[key] = value;
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

export function setupMiembrosCommand(program: Command): void {
  program
    .option("--json", "Output in JSON format")
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
}
