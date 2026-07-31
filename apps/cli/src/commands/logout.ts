import { display } from "../display.js";
import { clearToken } from "../config.js";
import type { OutputMode } from "../types.js";
import { isPipeMode } from "../display.js";

export async function logout(outputMode: OutputMode = isPipeMode() ? "json" : "pretty"): Promise<{ success: boolean }> {
  try {
    await clearToken();
    display({ message: "Logged out successfully" }, outputMode);
    return { success: true };
  } catch (err) {
    display({ error: "Failed to logout" }, outputMode);
    return { success: false };
  }
}
