import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guildPassClient } from "../src/lib/guildpassClient";
import {
  clearIssuerKeyCache,
  getGuildKeyRegistry,
  resetKeyRegistryTimeouts,
  setKeyRegistryCacheTtlMs,
  setKeyRegistryOfflineTrustWindowMs,
  type GuildConfigWithIssuerKeys,
} from "../src/features/access/guildIssuerKey";

vi.mock("../src/lib/guildpassClient", () => ({
  guildPassClient: {
    guilds: {
      getGuildConfig: vi.fn(),
    },
  },
}));

vi.mock("../src/features/access/qrSignature", () => {
  const QR_SIGNATURE_ERROR_CODES = {
    MISSING_SIGNATURE: "QR_SIGNATURE_MISSING",
    INVALID_SIGNATURE_FORMAT: "QR_SIGNATURE_FORMAT_INVALID",
    VERIFICATION_FAILED: "QR_SIGNATURE_VERIFICATION_FAILED",
    PUBLIC_KEY_UNAVAILABLE: "QR_SIGNATURE_PUBLIC_KEY_UNAVAILABLE",
    REVOKED_KEY: "QR_KEY_REVOKED",
    UNKNOWN_KEY: "QR_KEY_UNKNOWN",
    MISSING_KID: "QR_KID_MISSING",
    KEY_REGISTRY_EXPIRED: "QR_KEY_REGISTRY_EXPIRED",
  } as const;

  class QrSignatureError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
      super(message);
      this.name = "QrSignatureError";
      this.code = code;
    }
  }

  return {
    QrSignatureError,
    QR_SIGNATURE_ERROR_CODES,
  };
});

const GUILD_ID = "guild-boundary-test";
const BASE_TIME_MS = Date.UTC(2026, 0, 1, 0, 0, 0);

const CACHE_TTL_MS = 1_000;
const OFFLINE_TRUST_WINDOW_MS = 5_000;
const KEY_REGISTRY_EXPIRED_CODE = "QR_KEY_REGISTRY_EXPIRED";

const cachedConfig: GuildConfigWithIssuerKeys = {
  guildId: GUILD_ID,
  issuerKeys: {
    "cached-kid": "cached-public-key",
  },
};

const freshConfig: GuildConfigWithIssuerKeys = {
  guildId: GUILD_ID,
  issuerKeys: {
    "fresh-kid": "fresh-public-key",
  },
};

const getGuildConfigMock = vi.mocked(guildPassClient.guilds.getGuildConfig);

const primeCache = async () => {
  getGuildConfigMock.mockResolvedValueOnce(cachedConfig as never);

  const registry = await getGuildKeyRegistry(GUILD_ID, new Date(BASE_TIME_MS));

  expect(registry.fetchedAt).toBe(BASE_TIME_MS);
  expect(registry.keys.get("cached-kid")).toBe("cached-public-key");

  return registry;
};

describe("getGuildKeyRegistry cache boundaries", () => {
  beforeEach(() => {
    getGuildConfigMock.mockReset();
    clearIssuerKeyCache();
    setKeyRegistryCacheTtlMs(CACHE_TTL_MS);
    setKeyRegistryOfflineTrustWindowMs(OFFLINE_TRUST_WINDOW_MS);
  });

  afterEach(() => {
    clearIssuerKeyCache();
    resetKeyRegistryTimeouts();
    vi.clearAllMocks();
  });

  it("serves the cached registry without refreshing just under the TTL", async () => {
    const cachedRegistry = await primeCache();

    const result = await getGuildKeyRegistry(GUILD_ID, new Date(BASE_TIME_MS + CACHE_TTL_MS - 1));

    expect(result).toBe(cachedRegistry);
    expect(getGuildConfigMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      boundaryDescription: "exactly at",
      ageMs: CACHE_TTL_MS,
    },
    {
      boundaryDescription: "just over",
      ageMs: CACHE_TTL_MS + 1,
    },
  ])("refreshes the registry $boundaryDescription the TTL", async ({ ageMs }) => {
    await primeCache();
    getGuildConfigMock.mockResolvedValueOnce(freshConfig as never);

    const result = await getGuildKeyRegistry(GUILD_ID, new Date(BASE_TIME_MS + ageMs));

    expect(result.fetchedAt).toBe(BASE_TIME_MS + ageMs);
    expect(result.keys.get("fresh-kid")).toBe("fresh-public-key");
    expect(result.keys.has("cached-kid")).toBe(false);
    expect(getGuildConfigMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      boundaryDescription: "just under",
      ageMs: OFFLINE_TRUST_WINDOW_MS - 1,
    },
    {
      boundaryDescription: "exactly at",
      ageMs: OFFLINE_TRUST_WINDOW_MS,
    },
  ])(
    "falls back to the cached registry when refresh fails $boundaryDescription the offline trust boundary",
    async ({ ageMs }) => {
      const cachedRegistry = await primeCache();
      getGuildConfigMock.mockRejectedValueOnce(new Error("offline"));

      const result = await getGuildKeyRegistry(GUILD_ID, new Date(BASE_TIME_MS + ageMs));

      expect(result).toBe(cachedRegistry);
      expect(getGuildConfigMock).toHaveBeenCalledTimes(2);
    },
  );

  it("throws KEY_REGISTRY_EXPIRED only just past the offline trust boundary", async () => {
    await primeCache();
    getGuildConfigMock.mockRejectedValueOnce(new Error("offline"));

    await expect(
      getGuildKeyRegistry(GUILD_ID, new Date(BASE_TIME_MS + OFFLINE_TRUST_WINDOW_MS + 1)),
    ).rejects.toMatchObject({
      name: "QrSignatureError",
      code: KEY_REGISTRY_EXPIRED_CODE,
    });

    expect(getGuildConfigMock).toHaveBeenCalledTimes(2);
  });

  it("resets the effective cache age after a successful refresh of a registry past the trust window", async () => {
    await primeCache();

    const refreshTimeMs = BASE_TIME_MS + OFFLINE_TRUST_WINDOW_MS + 10_000;

    getGuildConfigMock.mockResolvedValueOnce(freshConfig as never);

    const refreshedRegistry = await getGuildKeyRegistry(GUILD_ID, new Date(refreshTimeMs));

    expect(refreshedRegistry.fetchedAt).toBe(refreshTimeMs);
    expect(refreshedRegistry.keys.get("fresh-kid")).toBe("fresh-public-key");
    expect(getGuildConfigMock).toHaveBeenCalledTimes(2);

    const resultWithinResetTtl = await getGuildKeyRegistry(
      GUILD_ID,
      new Date(refreshTimeMs + CACHE_TTL_MS - 1),
    );

    expect(resultWithinResetTtl).toBe(refreshedRegistry);
    expect(getGuildConfigMock).toHaveBeenCalledTimes(2);
  });
});
