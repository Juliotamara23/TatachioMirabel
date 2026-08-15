import { Command } from "commander";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { resolveReportesDir, validateReportesDirPath } from "@tatachio/shared/node";
import { getBaseUrl, resolveToken } from "../config.js";
import { display, displayError, isPipeMode, setExitCode } from "../display.js";
import type { OutputMode } from "../types.js";
import { descargarCenso } from "../api/reportes.js";

export interface GenerarReporteResult {
  archivo: string;
  path: string;
}

/**
 * `tatachio reportes generar` — descarga el censo ministerial del backend y lo
 * persiste en la carpeta compartida TATACHIO_REPORTES_DIR (~/.tatachio/reportes).
 * El binario NUNCA va a stdout: pretty imprime la ruta absoluta; json imprime
 * { ok, data: { archivo, path } }. Exit: 0 éxito · 1 4xx/otros · 2 5xx.
 */
export async function generarReporteCmd(
  options: { output?: string },
  mode: OutputMode,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const token = await resolveToken();
    if (!token) throw new Error("No authentication token found. Please login first.");
    const baseUrl = await getBaseUrl();

    // Validate the output path BEFORE the network call: fail fast on bad
    // input (issue #66). Empty / relative paths shouldn't waste a backend
    // round-trip. Using `!== undefined` instead of a truthy check is
    // intentional — `""` is falsy in JS but still an explicit (misconfigured)
    // user input that must be rejected, not silently replaced by the default.
    const validatedOutput =
      options.output !== undefined
        ? validateReportesDirPath(options.output, "--output")
        : undefined;

    const { buffer, nombre } = await descargarCenso(baseUrl, token);

    const filePath = validatedOutput ?? join(resolveReportesDir(), nombre);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);

    const result: GenerarReporteResult = { archivo: basename(filePath), path: filePath };
    if (mode === "json") {
      display(result, mode);
    } else {
      console.log(filePath);
    }
    setExitCode(0);
    return { success: true, data: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    displayError(err, mode);
    const status = (err as { status?: number }).status;
    setExitCode(status && status >= 500 ? 2 : 1);
    return { success: false, error: message };
  }
}

export function setupReportesCommand(program: Command): void {
  program
    .command("generar")
    .description("Descarga el censo ministerial y lo guarda en la carpeta compartida de reportes")
    .option("--output <path>", "Ruta destino alternativa (override)")
    .option("--json", "Output in JSON format")
    .action(async (options) => {
      const mode = (options.json ? "json" : isPipeMode() ? "json" : "pretty") as OutputMode;
      await generarReporteCmd({ output: options.output }, mode);
    });
}
