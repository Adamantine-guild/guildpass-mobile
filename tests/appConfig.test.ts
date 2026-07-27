import { describe, expect, it, beforeEach } from "vitest";
import Constants from "expo-constants";
import { loadConfig } from "../src/config/appConfig";

describe("appConfig validation", () => {
  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_API_URL;
    delete process.env.EXPO_PUBLIC_CHAIN_ID;
    delete process.env.EXPO_PUBLIC_APP_ENV;

    Constants.expoConfig = {
      extra: {},
    };
  });

  describe("valid config", () => {
    it("passes valid config through unchanged", () => {
      Constants.expoConfig!.extra.apiUrl = "https://api.guildpass.xyz";
      Constants.expoConfig!.extra.chainId = "11155111";

      const config = loadConfig();

      expect(config.apiUrl).toBe("https://api.guildpass.xyz");
      expect(config.chainId).toBe(11155111);
      expect(config.appEnv).toBe("development");
    });

    it("reads apiUrl from process.env when Constants.expoConfig.extra is empty", () => {
      process.env.EXPO_PUBLIC_API_URL = "https://env.guildpass.xyz";
      Constants.expoConfig!.extra.chainId = "1";

      const config = loadConfig();

      expect(config.apiUrl).toBe("https://env.guildpass.xyz");
    });

    it("coerces chainId from string to number", () => {
      Constants.expoConfig!.extra.apiUrl = "https://api.guildpass.xyz";
      Constants.expoConfig!.extra.chainId = "8453";

      const config = loadConfig();

      expect(config.chainId).toBe(8453);
      expect(typeof config.chainId).toBe("number");
    });
  });

  describe("missing variables", () => {
    it("throws when apiUrl is missing from both Constants.expoConfig and process.env", () => {
      Constants.expoConfig!.extra.chainId = "1";

      expect(() => loadConfig()).toThrow("Invalid application configuration");
    });

    it("throws when chainId is missing from both Constants.expoConfig and process.env", () => {
      Constants.expoConfig!.extra.apiUrl = "https://api.guildpass.xyz";

      expect(() => loadConfig()).toThrow("Invalid application configuration");
    });
  });

  describe("malformed values", () => {
    it("throws when apiUrl is not a valid URL", () => {
      Constants.expoConfig!.extra.apiUrl = "not-a-url";
      Constants.expoConfig!.extra.chainId = "1";

      expect(() => loadConfig()).toThrow("EXPO_PUBLIC_API_URL must be a valid URL");
    });

    it("throws when chainId is non-numeric", () => {
      Constants.expoConfig!.extra.apiUrl = "https://api.guildpass.xyz";
      Constants.expoConfig!.extra.chainId = "abc";

      expect(() => loadConfig()).toThrow("Invalid application configuration");
    });

    it("throws when chainId is Infinity", () => {
      Constants.expoConfig!.extra.apiUrl = "https://api.guildpass.xyz";
      Constants.expoConfig!.extra.chainId = Infinity;

      expect(() => loadConfig()).toThrow("EXPO_PUBLIC_CHAIN_ID must be a finite number");
    });
  });

  describe("fallback safety", () => {
    it("throws rather than silently defaulting to a production URL when apiUrl is missing", () => {
      Constants.expoConfig!.extra.chainId = "1";

      expect(() => loadConfig()).toThrow();
      try {
        loadConfig();
      } catch (e) {
        expect((e as Error).message).not.toContain("api.guildpass.xyz");
      }
    });
  });
});
