import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { unlink, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import {
  resolveToken,
  getBaseUrl,
  loadConfig,
  saveConfig,
  storeToken,
  clearToken,
  CONFIG_DIR_BASENAME,
} from "../../src/config.js";

describe("config — token resolution order", () => {
  const tmpDir = join(tmpdir(), `tatachio-test-${randomUUID()}`);
  const configDir = join(tmpDir, CONFIG_DIR_BASENAME);
  const configFile = join(configDir, "config.json");

  beforeEach(async () => {
    await mkdir(configDir, { recursive: true });
    await writeFile(
      configFile,
      JSON.stringify({
        baseUrl: "http://localhost:3000",
        token: "cached-token-123",
        user: { id: "u1", email: "test@test.com", nombre: "Test", rol: "ADMIN" },
      }),
    );
  });

  afterEach(async () => {
    try { await unlink(configFile); } catch {}
  });

  describe("resolveToken", () => {
    it("uses TATACHIO_TOKEN env var when set", async () => {
      vi.stubEnv("TATACHIO_TOKEN", "env-token-456");
      const token = await resolveToken({ configPath: configDir });
      expect(token).toBe("env-token-456");
    });

    it("falls back to cached token when env var is unset", async () => {
      vi.stubEnv("TATACHIO_TOKEN", "");
      const token = await resolveToken({ configPath: configDir });
      expect(token).toBe("cached-token-123");
    });

    it("returns null when no env var and no cached token", async () => {
      vi.stubEnv("TATACHIO_TOKEN", "");
      await writeFile(configFile, JSON.stringify({ baseUrl: "http://localhost:3000" }));
      const token = await resolveToken({ configPath: configDir });
      expect(token).toBeNull();
    });
  });

  describe("getBaseUrl", () => {
    it("returns config baseUrl when set", async () => {
      vi.stubEnv("TATACHIO_BASE_URL", "");
      const url = await getBaseUrl({ configPath: configDir });
      expect(url).toBe("http://localhost:3000");
    });

    it("returns default when no config file exists", async () => {
      vi.stubEnv("TATACHIO_BASE_URL", "");
      await unlink(configFile);
      const url = await getBaseUrl({ configPath: configDir });
      expect(url).toBe("http://localhost:3000");
    });

    it("TATACHIO_BASE_URL env var overrides config", async () => {
      vi.stubEnv("TATACHIO_BASE_URL", "http://custom:8080");
      const url = await getBaseUrl({ configPath: configDir });
      expect(url).toBe("http://custom:8080");
    });
  });

  describe("storeToken and clearToken", () => {
    it("storeToken saves token and user to config", async () => {
      vi.stubEnv("TATACHIO_TOKEN", "");
      await storeToken("new-token", { id: "u2", email: "a@b.com", nombre: "A", rol: "USER" }, { configPath: configDir });
      const token = await resolveToken({ configPath: configDir });
      expect(token).toBe("new-token");
    });

    it("clearToken removes token from config", async () => {
      await clearToken({ configPath: configDir });
      vi.stubEnv("TATACHIO_TOKEN", "");
      const token = await resolveToken({ configPath: configDir });
      expect(token).toBeNull();
    });
  });
});
