import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadProvidersConfig,
  ProvidersConfigError,
  type ConfigProvider,
} from "../../src/services/providersConfig.js";

// ── Helpers ────────────────────────────────────────────────────────

/** Minimal valid provider declaration (NVIDIA NIM example). */
const NVIDIA_PROVIDER = {
  provider: "nvidia",
  baseURL: "https://integrate.api.nvidia.com/v1",
  apiKeyEnv: "NVIDIA_API_KEY",
  models: [
    {
      id: "deepseek-ai/deepseek-r1",
      name: "DeepSeek R1 (NVIDIA NIM)",
      capabilities: { tools: true, streaming: true },
    },
    {
      id: "meta/llama-3.3-70b-instruct",
      name: "Llama 3.3 70B Instruct (NVIDIA NIM)",
    },
  ],
};

const ENV_SNAPSHOT: Record<string, string | undefined> = {};

// ── Tests ──────────────────────────────────────────────────────────

describe("providersConfig", () => {
  beforeEach(() => {
    ENV_SNAPSHOT.EXTRA_PROVIDERS_JSON = process.env.EXTRA_PROVIDERS_JSON;
    ENV_SNAPSHOT.PROVIDERS_CONFIG_PATH = process.env.PROVIDERS_CONFIG_PATH;
    delete process.env.EXTRA_PROVIDERS_JSON;
    delete process.env.PROVIDERS_CONFIG_PATH;
  });

  afterEach(() => {
    if (ENV_SNAPSHOT.EXTRA_PROVIDERS_JSON === undefined)
      delete process.env.EXTRA_PROVIDERS_JSON;
    else process.env.EXTRA_PROVIDERS_JSON = ENV_SNAPSHOT.EXTRA_PROVIDERS_JSON;
    if (ENV_SNAPSHOT.PROVIDERS_CONFIG_PATH === undefined)
      delete process.env.PROVIDERS_CONFIG_PATH;
    else process.env.PROVIDERS_CONFIG_PATH = ENV_SNAPSHOT.PROVIDERS_CONFIG_PATH;
  });

  it("returns [] when no config is declared anywhere", () => {
    const providers = loadProvidersConfig();
    expect(providers).toEqual([]);
  });

  it("parses a valid inline config from EXTRA_PROVIDERS_JSON", () => {
    process.env.EXTRA_PROVIDERS_JSON = JSON.stringify({
      providers: [NVIDIA_PROVIDER],
    });

    const providers = loadProvidersConfig();

    expect(providers).toHaveLength(1);
    expect(providers[0].provider).toBe("nvidia");
    expect(providers[0].baseURL).toBe("https://integrate.api.nvidia.com/v1");
    expect(providers[0].apiKeyEnv).toBe("NVIDIA_API_KEY");
    expect(providers[0].models).toHaveLength(2);
    expect(providers[0].models[0].id).toBe("deepseek-ai/deepseek-r1");
    expect(providers[0].models[0].capabilities?.tools).toBe(true);
    // capabilities omitted → undefined, default applied at registry merge
    expect(providers[0].models[1].capabilities).toBeUndefined();
  });

  it("loads config from a file referenced by PROVIDERS_CONFIG_PATH", () => {
    const dir = mkdtempSync(join(tmpdir(), "providers-config-"));
    const file = join(dir, "providers.json");
    writeFileSync(
      file,
      JSON.stringify({
        providers: [
          {
            provider: "deepseek",
            baseURL: "https://api.deepseek.com",
            apiKeyEnv: "DEEPSEEK_API_KEY",
            models: [{ id: "deepseek-chat", name: "DeepSeek Chat" }],
          },
        ],
      })
    );
    process.env.PROVIDERS_CONFIG_PATH = file;

    try {
      const providers = loadProvidersConfig();
      expect(providers).toHaveLength(1);
      expect(providers[0].provider).toBe("deepseek");
      expect(providers[0].models[0].id).toBe("deepseek-chat");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("picks up the default config/providers.json anchored to the backend dir (CWD-independent)", () => {
    // The loader anchors config/providers.json to the backend package dir
    // (3 levels up from src/services/), NOT to process.cwd(). From this test
    // file (tests/unit/) the backend dir is 2 levels up — write there so the
    // default-path resolution is exercised exactly as at runtime.
    const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const configFile = join(backendDir, "config", "providers.json");
    mkdirSync(dirname(configFile), { recursive: true });
    writeFileSync(configFile, JSON.stringify({ providers: [NVIDIA_PROVIDER] }));

    try {
      const providers = loadProvidersConfig();
      expect(providers).toHaveLength(1);
      expect(providers[0].apiKeyEnv).toBe("NVIDIA_API_KEY");
    } finally {
      rmSync(configFile, { force: true });
    }
  });

  it("EXTRA_PROVIDERS_JSON takes precedence over the config file", () => {
    const dir = mkdtempSync(join(tmpdir(), "providers-config-"));
    const file = join(dir, "providers.json");
    writeFileSync(
      file,
      JSON.stringify({
        providers: [{ provider: "file-provider", apiKeyEnv: "FILE_KEY", models: [{ id: "m1", name: "M1" }] }],
      })
    );
    process.env.PROVIDERS_CONFIG_PATH = file;
    process.env.EXTRA_PROVIDERS_JSON = JSON.stringify({
      providers: [{ provider: "inline-provider", apiKeyEnv: "INLINE_KEY", models: [{ id: "m2", name: "M2" }] }],
    });

    try {
      const providers = loadProvidersConfig();
      expect(providers).toHaveLength(1);
      expect(providers[0].provider).toBe("inline-provider");
      expect(providers[0].apiKeyEnv).toBe("INLINE_KEY");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws ProvidersConfigError with a clear message on malformed JSON", () => {
    process.env.EXTRA_PROVIDERS_JSON = "{ not valid json ";

    expect(() => loadProvidersConfig()).toThrow(ProvidersConfigError);
    expect(() => loadProvidersConfig()).toThrow(/JSON/);
  });

  it("throws ProvidersConfigError when a provider is missing apiKeyEnv", () => {
    process.env.EXTRA_PROVIDERS_JSON = JSON.stringify({
      providers: [
        {
          provider: "nvidia",
          models: [{ id: "deepseek-ai/deepseek-r1", name: "DeepSeek R1" }],
        },
      ],
    });

    expect(() => loadProvidersConfig()).toThrow(ProvidersConfigError);
    expect(() => loadProvidersConfig()).toThrow(/apiKeyEnv/);
  });

  it("throws ProvidersConfigError when defaultFor is not a known role", () => {
    process.env.EXTRA_PROVIDERS_JSON = JSON.stringify({
      providers: [
        {
          provider: "nvidia",
          apiKeyEnv: "NVIDIA_API_KEY",
          models: [
            { id: "m1", name: "M1", defaultFor: "PIRATA" },
          ],
        },
      ],
    });

    expect(() => loadProvidersConfig()).toThrow(ProvidersConfigError);
    expect(() => loadProvidersConfig()).toThrow(/defaultFor/);
  });

  it("throws ProvidersConfigError when baseURL is not a valid URL", () => {
    process.env.EXTRA_PROVIDERS_JSON = JSON.stringify({
      providers: [
        {
          provider: "nvidia",
          baseURL: "not-a-url",
          apiKeyEnv: "NVIDIA_API_KEY",
          models: [{ id: "m1", name: "M1" }],
        },
      ],
    });

    expect(() => loadProvidersConfig()).toThrow(ProvidersConfigError);
    expect(() => loadProvidersConfig()).toThrow(/baseURL/);
  });

  it("accepts a provider with no models array as malformed", () => {
    process.env.EXTRA_PROVIDERS_JSON = JSON.stringify({
      providers: [{ provider: "nvidia", apiKeyEnv: "NVIDIA_API_KEY" }],
    });

    expect(() => loadProvidersConfig()).toThrow(ProvidersConfigError);
    expect(() => loadProvidersConfig()).toThrow(/models/);
  });

  it("returns an empty array for a valid config with zero providers", () => {
    process.env.EXTRA_PROVIDERS_JSON = JSON.stringify({ providers: [] });

    const providers = loadProvidersConfig();
    expect(providers).toEqual([]);
  });

  it("defaultFor CAPTAIN is accepted by the schema", () => {
    process.env.EXTRA_PROVIDERS_JSON = JSON.stringify({
      providers: [
        {
          provider: "deepseek",
          apiKeyEnv: "DEEPSEEK_API_KEY",
          models: [{ id: "deepseek-chat", name: "DeepSeek Chat", defaultFor: "CAPTAIN" }],
        },
      ],
    });

    const providers = loadProvidersConfig();
    expect(providers[0].models[0].defaultFor).toBe("CAPTAIN");
  });

  it("returned providers satisfy the exported ConfigProvider type shape", () => {
    process.env.EXTRA_PROVIDERS_JSON = JSON.stringify({
      providers: [NVIDIA_PROVIDER],
    });

    const providers: ConfigProvider[] = loadProvidersConfig();
    expect(providers[0].headers).toBeUndefined();
    expect(typeof providers[0].provider).toBe("string");
    expect(Array.isArray(providers[0].models)).toBe(true);
  });
});
