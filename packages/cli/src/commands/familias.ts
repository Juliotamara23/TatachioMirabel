import { Command } from "commander";
import { resolveToken, getBaseUrl } from "../config.js";
import { display, displayError, setExitCode } from "../display.js";
import { isPipeMode } from "../display.js";
import type { OutputMode } from "../types.js";
import { listFamilias, getFamilia } from "../api/familias.js";

const outputMode = (isPipeMode() ? "json" : "pretty") as OutputMode;

export async function listFamiliasCmd(
  search?: string,
  cabildoId?: string,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const token = await resolveToken();
    if (!token) throw new Error("No authentication token found. Please login first.");
    const baseUrl = await getBaseUrl();

    const params: { search?: string; cabildoId?: string } = {};
    if (search) params.search = search;
    if (cabildoId) params.cabildoId = cabildoId;

    const result = await listFamilias(baseUrl, token, params);
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

export async function getFamiliaCmd(
  id: string,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const token = await resolveToken();
    if (!token) throw new Error("No authentication token found. Please login first.");
    const baseUrl = await getBaseUrl();

    const result = await getFamilia(baseUrl, token, id);
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

function setupFamiliasCommand(): void {
  const program = new Command();

  program
    .command("list")
    .description("List families")
    .option("--search <value>", "Filter by search term")
    .option("--cabildo-id <value>", "Filter by cabildo ID")
    .action(async (options) => {
      await listFamiliasCmd(
        options.search,
        options.cabildoId,
      );
    });

  program
    .command("get <id>")
    .description("Get family by ID")
    .action(async (id) => {
      await getFamiliaCmd(id);
    });

  program.parse();
}

export { setupFamiliasCommand };
