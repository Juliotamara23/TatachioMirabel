import { apiFetch } from "./client.js";
import type { CliConfig } from "../types.js";
import { clearToken, storeToken } from "../config.js";

export async function login(baseUrl: string, email: string, password: string): Promise<CliConfig> {
  const result = await apiFetch("/api/auth/login", {
    method: "POST",
    baseUrl,
    body: { email, password },
  });

  if (typeof result !== "object" || result === null) {
    throw new Error("Invalid login response");
  }

  const { token, user } = result as { token: string; user: CliConfig["user"] };

  if (!user || typeof user !== "object") {
    throw new Error("Invalid user response");
  }

  await storeToken(token, user); // store the actual user
  return { baseUrl, token, user };
}

export async function logout(opts?: { configPath?: string }): Promise<void> {
  await clearToken(opts);
}
