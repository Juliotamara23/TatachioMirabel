import type { OutputMode } from "./types.js";
import type { CliConfig } from "../types.js";

function isPipeMode(): boolean {
  return process.stdout.isTTY === false || Boolean(process.argv.includes("--json"));
}

function setExitCode(code: 0 | 1 | 2): void {
  process.exitCode = code;
}

function displayError(error: unknown, mode: OutputMode): void {
  if (mode === "json") {
    const jsonOutput = {
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    };
    console.error(JSON.stringify(jsonOutput));
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
}

function display(result: unknown, mode: OutputMode): void {
  if (mode === "json") {
    const jsonOutput = {
      ok: true as const,
      data: result,
    };
    console.log(JSON.stringify(jsonOutput, null, 2));
  } else {
    if (typeof result === "object" && result !== null) {
      const obj = result as Record<string, unknown>;
      if (Array.isArray(obj)) {
        obj.forEach((item, i) => console.log(`${i + 1}: ${JSON.stringify(item, null, 2)}`));
      } else {
        for (const key in obj) {
          console.log(`${key}: ${JSON.stringify(obj[key], null, 2)}`);
        }
      }
    } else {
      console.log(String(result));
    }
  }
}

export { display, displayError, isPipeMode, setExitCode };
