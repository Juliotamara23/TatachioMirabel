import { resolveToken } from "../config.js";
import { login as apiLogin } from "../api/auth.js";
import { display, displayError, setExitCode } from "../display.js";
import type { OutputMode } from "../types.js";
import { isPipeMode } from "../display.js";

async function getCredentials(): Promise<{ email: string; password: string }> {
  if (isPipeMode()) {
    // In pipe mode, CLI flags should have provided values earlier
    // For now, throw an error to force user to provide values in TTY mode
    throw new Error("Credentials required in TTY mode. Use --email and --password flags when using JSON mode.");
  }

  const { ask } = await import("@inquirer/prompts");

  const email = await ask({ type: "input", message: "Email:" });
  const password = await ask({ type: "password", message: "Password:" });

  return { email, password };
}

export async function login(
  email?: string,
  password?: string,
  outputMode: OutputMode = isPipeMode() ? "json" : "pretty",
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const cred = email && password ? { email, password } : await getCredentials();
    const { baseUrl, token } = await apiLogin(
      "http://localhost:3000", // TODO: Use configured baseUrl
      cred.email,
      cred.password,
    );

    display({ token, user: { id: "test", email: cred.email, nombre: "Test", rol: "USER" } }, outputMode);
    setExitCode(0);
    return { success: true, data: { token, user: { id: "test", email: cred.email, nombre: "Test", rol: "USER" } } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    displayError(err, outputMode);
    setExitCode(1);
    return { success: false, error: message };
  }
}
