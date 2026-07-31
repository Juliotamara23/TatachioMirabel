import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CliConfig, ChatEntry } from "./types.js";

export const CONFIG_DIR_BASENAME = ".tatachio";
export const DEFAULT_BASE_URL = "http://localhost:3000";

// ── Options interface for testability ──────────────────────────────────
interface ConfigOptions {
  configPath?: string;
}

function resolveConfigDir(opts?: ConfigOptions): string {
  if (opts?.configPath) return opts.configPath;
  return join(homedir(), CONFIG_DIR_BASENAME);
}

function configFilePath(dir: string): string {
  return join(dir, "config.json");
}

// ── Internal helpers ────────────────────────────────────────────────────

async function readConfigFile(dir: string): Promise<Partial<CliConfig>> {
  const file = configFilePath(dir);
  try {
    const raw = await readFile(file, "utf-8");
    return JSON.parse(raw) as Partial<CliConfig>;
  } catch {
    return {};
  }
}

async function writeConfigFile(dir: string, config: Partial<CliConfig>): Promise<void> {
  const file = configFilePath(dir);
  await mkdir(dir, { recursive: true });
  // chmod 600-equivalent: read+write for owner only
  await writeFile(file, JSON.stringify(config, null, 2), { mode: 0o600 });
}

// ── Public API ──────────────────────────────────────────────────────────

export async function loadConfig(opts?: ConfigOptions): Promise<CliConfig> {
  const dir = resolveConfigDir(opts);
  const raw = await readConfigFile(dir);
  return {
    baseUrl: raw.baseUrl ?? DEFAULT_BASE_URL,
    token: raw.token,
    user: raw.user,
  };
}

export async function saveConfig(config: Partial<CliConfig>, opts?: ConfigOptions): Promise<void> {
  const dir = resolveConfigDir(opts);
  const existing = await readConfigFile(dir);
  const merged = { ...existing, ...config };
  await writeConfigFile(dir, merged);
}

export async function resolveToken(opts?: ConfigOptions): Promise<string | null> {
  const envToken = process.env.TATACHIO_TOKEN;
  if (envToken) return envToken;

  const dir = resolveConfigDir(opts);
  const raw = await readConfigFile(dir);
  return raw.token ?? null;
}

export async function getBaseUrl(opts?: ConfigOptions): Promise<string> {
  const dir = resolveConfigDir(opts);
  const rawEnv = process.env.TATACHIO_BASE_URL;
  if (rawEnv) return rawEnv;

  const raw = await readConfigFile(dir);
  return raw.baseUrl ?? DEFAULT_BASE_URL;
}

export async function storeToken(
  token: string,
  user: NonNullable<CliConfig["user"]>,
  opts?: ConfigOptions,
): Promise<void> {
  await saveConfig({ token, user }, opts);
}

export async function clearToken(opts?: ConfigOptions): Promise<void> {
  await saveConfig({ token: undefined, user: undefined }, opts);
}

export async function saveChatHistory(entries: ChatEntry[]): Promise<void> {
  const dir = resolveConfigDir();
  const historyFile = join(dir, "history.jsonl");
  
  await mkdir(dir, { recursive: true });
  
  // Append each entry as a JSON line
  for (const entry of entries) {
    const line = JSON.stringify(entry) + "\n";
    await writeFile(historyFile, line, { flag: "a" });
  }
}

export async function loadChatHistory(): Promise<ChatEntry[]> {
  const dir = resolveConfigDir();
  const historyFile = join(dir, "history.jsonl");
  
  try {
    const content = await readFile(historyFile, "utf-8");
    const lines = content.split("\n").filter(line => line.trim());
    return lines.map(line => JSON.parse(line)) as ChatEntry[];
  } catch (error) {
    // File doesn't exist yet
    return [];
  }
}