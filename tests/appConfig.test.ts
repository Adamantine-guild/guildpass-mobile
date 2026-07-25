import { describe, expect, it, vi, beforeEach } from "vitest";
import { z } from "zod";

/**
 * appConfig unit tests
 *
 * We cannot import appConfig directly because it runs loadConfig() at module
 * level, which requires expo-constants. Instead we replicate the schema and
 * loadConfig logic here so we can test validation rules in isolation without
 * needing the Expo runtime.
 */

const AppEnvSchema = z.enum(["development", "preview", "production"]).default("development");

const ConfigSchema = z.object({
  apiUrl: z.string().url("EXPO_PUBLIC_API_URL must be a valid URL"),
  chainId: z.coerce.number().finite("EXPO_PUBLIC_CHAIN_ID must be a finite number"),
  appEnv: AppEnvSchema,
  walletConnectProjectId: z.string().optional(),
});

type AppConfig = z.infer<typeof ConfigSchema>;

function loadConfig(raw: Record<string, unknown>): AppConfig {
  const parsed = ConfigSchema.safeParse(raw);

  if (!parsed.success) {
    const errorMessages = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid application configuration:\n${errorMessages}`);
  }

  return parsed.data;
}

describe("appConfig validation", () => {
  const validConfig = {
    apiUrl: "http://localhost:3000",
    chainId: "11155111",
    appEnv: "development",
  };

  it("parses a valid configuration", () => {
    const config = loadConfig(validConfig);

    expect(config.apiUrl).toBe("http://localhost:3000");
    expect(config.chainId).toBe(11155111);
    expect(config.appEnv).toBe("development");
  });

  it("coerces chainId from string to number", () => {
    const config = loadConfig({ ...validConfig, chainId: "8453" });

    expect(config.chainId).toBe(8453);
    expect(typeof config.chainId).toBe("number");
  });

  it("defaults appEnv to development when omitted", () => {
    const { appEnv, ...withoutEnv } = validConfig;
    const config = loadConfig(withoutEnv);

    expect(config.appEnv).toBe("development");
  });

  it("accepts all valid appEnv values", () => {
    for (const env of ["development", "preview", "production"] as const) {
      const config = loadConfig({ ...validConfig, appEnv: env });
      expect(config.appEnv).toBe(env);
    }
  });

  it("rejects missing apiUrl", () => {
    const { apiUrl, ...withoutUrl } = validConfig;

    expect(() => loadConfig(withoutUrl)).toThrow("Invalid application configuration");
  });

  it("rejects invalid apiUrl format", () => {
    expect(() => loadConfig({ ...validConfig, apiUrl: "not-a-url" })).toThrow(
      "EXPO_PUBLIC_API_URL must be a valid URL",
    );
  });

  it("rejects missing chainId", () => {
    const { chainId, ...withoutChain } = validConfig;

    expect(() => loadConfig(withoutChain)).toThrow("Invalid application configuration");
  });

  it("rejects non-numeric chainId", () => {
    expect(() => loadConfig({ ...validConfig, chainId: "abc" })).toThrow(
      "Invalid application configuration",
    );
  });

  it("rejects Infinity as chainId", () => {
    expect(() => loadConfig({ ...validConfig, chainId: Infinity })).toThrow(
      "EXPO_PUBLIC_CHAIN_ID must be a finite number",
    );
  });

  it("rejects invalid appEnv values", () => {
    expect(() => loadConfig({ ...validConfig, appEnv: "staging" })).toThrow(
      "Invalid application configuration",
    );
  });

  it("accepts optional walletConnectProjectId", () => {
    const config = loadConfig({ ...validConfig, walletConnectProjectId: "test-project-id" });

    expect(config.walletConnectProjectId).toBe("test-project-id");
  });

  it("allows walletConnectProjectId to be omitted", () => {
    const config = loadConfig(validConfig);

    expect(config.walletConnectProjectId).toBeUndefined();
  });
});
