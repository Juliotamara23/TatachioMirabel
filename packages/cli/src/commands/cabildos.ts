import { Command } from "commander";
import { resolveToken, getBaseUrl } from "../config.js";
import { display, displayError, setExitCode } from "../display.js";
import { isPipeMode } from "../display.js";
import type { OutputMode } from "../types.js";
import { listCabildos, getCabildo } from "../api/cabildos.js";

const outputMode = (isPipeMode() ? "json" : "pretty") as OutputMode;

export async function listCabildosCmd(
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const token = await resolveToken();
    const baseUrl = await getBaseUrl();

    const result = await listCabildos(baseUrl, token);
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

export async function getCabildoCmd(
  id: string,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const token = await resolveToken();
    const baseUrl = await getBaseUrl();

    const result = await getCabildo(baseUrl, token, id);
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

function setupCabildosCommand(): void {
  const program = new Command();

  program
    .command("list")
    .description("List cabildos")
    .action(async () => {
      await listCabildosCmd();
    });

  program
    .command("get <id>")
    .description("Get cabildo by ID")
    .action(async (id) => {
      await getCabildoCmd(id);
    });

  program.parse();
}

export { setupCabildosCommand };
