import { resolveToken, getBaseUrl } from "../config.js";
import { login as apiLogin } from "../api/auth.js";
import { display, displayError, setExitCode } from "../display.js";
import type { OutputMode } from "../types.js";
import { isPipeMode } from "../display.js";

async function getCredentials(): Promise<{ email: string; password: string }> {
  if (isPipeMode()) {
    throw new Error("Credentials required in TTY mode. Use --email and --password flags when using JSON mode.");
  }

  const { input, password: pw } = await import("@inquirer/prompts");

  const email = await input({ message: "Email:" });
  const userPassword = await pw({ message: "Password:" });

  return { email, password: userPassword };
}

export async function login(
  email?: string,
  password?: string,
  outputMode: OutputMode = isPipeMode() ? "json" : "pretty",
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const baseUrl = await getBaseUrl();
    const cred = email && password ? { email, password } : await getCredentials();
    const { baseUrl: _, token, user } = await apiLogin(
      baseUrl,
      cred.email,
      cred.password,
    );
    void _;
    display({ token, user }, outputMode);
    setExitCode(0);
    return { success: true, data: { token, user } };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    displayError(err, outputMode);
    setExitCode(1);
    return { success: false, error: message };
  }
}
