import { describe, expect, it, vi, beforeEach } from "vitest";
import { QrSignatureError, QR_SIGNATURE_ERROR_CODES } from "../src/features/access/qrSignature";
import { QrPayloadError, QR_PAYLOAD_ERROR_CODES } from "../src/features/access/qrPayload";
import {
  clearIssuerKeyCache,
  getGuildIssuerPublicKey,
  getGuildKeyRegistry,
  setKeyRegistryCacheTtlMs,
  setKeyRegistryOfflineTrustWindowMs,
  resetKeyRegistryTimeouts,
  DEFAULT_KEY_REGISTRY_CACHE_TTL_MS,
  DEFAULT_KEY_REGISTRY_OFFLINE_TRUST_WINDOW_MS,
} from "../src/features/access/guildIssuerKey";
import { verifyAndParseAccessQrPayload } from "../src/features/access/verifyQrPayload";
import { clearNonceCache } from "../src/features/access/qrReplayGuard";
import {
  buildSignedQrPayloadString,
  signQrPayload,
  TEST_ISSUER_PRIVATE_KEY,
  TEST_ISSUER_PUBLIC_KEY,
  TEST_ISSUER_PRIVATE_KEY_V2,
  TEST_ISSUER_PUBLIC_KEY_V2,
  TEST_REVOKED_PRIVATE_KEY,
  TEST_REVOKED_PUBLIC_KEY,
} from "./fixtures/qrSignature.fixtures";

const { mockGetGuildConfig } = vi.hoisted(() => ({ mockGetGuildConfig: vi.fn() }));
const flagState = vi.hoisted(() => ({ qrSignatureVerification: true }));
const storageState = vi.hoisted(() => {
  const items = new Map<string, string>();
  return {
    items,
    getItem: vi.fn(async (name: string) => items.get(name) ?? null),
    setItem: vi.fn(async (name: string, value: string) => {
      items.set(name, value);
    }),
    removeItem: vi.fn(async (name: string) => {
      items.delete(name);
    }),
  };
});

vi.mock("../src/lib/guildpassClient", () => ({
  guildPassClient: {
    guilds: { getGuildConfig: mockGetGuildConfig },
  },
}));

vi.mock("../src/config/appConfig", () => ({
  appConfig: flagState,
}));

vi.mock("../src/lib/storage", () => ({
  migratingSecureStorage: {
    getItem: storageState.getItem,
    setItem: storageState.setItem,
    removeItem: storageState.removeItem,
  },
}));

const now = new Date("2026-07-20T12:00:00.000Z");

const validFields = {
  guildId: "guild_abc",
  resourceId: "vip-door",
  walletAddress: "0x1234567890123456789012345678901234567890",
  expiresAt: "2026-07-20T12:05:00.000Z",
};

describe("QR Key Rotation & Revocation Protocol", () => {
  beforeEach(() => {
    clearIssuerKeyCache();
    clearNonceCache();
    resetKeyRegistryTimeouts();
    storageState.items.clear();
    mockGetGuildConfig.mockReset();
    flagState.qrSignatureVerification = true;
  });

  describe("Multi-key concurrent verification (Rotation Overlap)", () => {
    it("correctly selects among multiple concurrently-valid key versions by kid", async () => {
      mockGetGuildConfig.mockResolvedValue({
        guildId: "guild_abc",
        issuerKeys: {
          "key-v1": TEST_ISSUER_PUBLIC_KEY,
          "key-v2": TEST_ISSUER_PUBLIC_KEY_V2,
        },
      });

      // Payload 1 signed with key-v1
      const payloadV1 = buildSignedQrPayloadString(
        { ...validFields, kid: "key-v1" },
        TEST_ISSUER_PRIVATE_KEY,
      );

      // Payload 2 signed with key-v2
      const payloadV2 = buildSignedQrPayloadString(
        { ...validFields, kid: "key-v2" },
        TEST_ISSUER_PRIVATE_KEY_V2,
      );

      const parsed1 = await verifyAndParseAccessQrPayload(payloadV1, now);
      expect(parsed1.payload.kid).toBe("key-v1");

      const parsed2 = await verifyAndParseAccessQrPayload(payloadV2, now);
      expect(parsed2.payload.kid).toBe("key-v2");
    });

    it("supports issuerKeys as an array of key entries", async () => {
      mockGetGuildConfig.mockResolvedValue({
        guildId: "guild_abc",
        issuerKeys: [
          { kid: "key-v1", publicKey: TEST_ISSUER_PUBLIC_KEY, status: "active" },
          { kid: "key-v2", publicKey: TEST_ISSUER_PUBLIC_KEY_V2, status: "active" },
        ],
      });

      const payloadV2 = buildSignedQrPayloadString(
        { ...validFields, kid: "key-v2" },
        TEST_ISSUER_PRIVATE_KEY_V2,
      );

      const parsed = await verifyAndParseAccessQrPayload(payloadV2, now);
      expect(parsed.payload.kid).toBe("key-v2");
    });
  });

  describe("Revoked kid rejection", () => {
    it("rejects a payload signed with a revoked kid even if the signature is otherwise well-formed and valid", async () => {
      mockGetGuildConfig.mockResolvedValue({
        guildId: "guild_abc",
        issuerKeys: {
          "key-v1": TEST_ISSUER_PUBLIC_KEY,
        },
        revokedKids: ["key-revoked-99"],
      });

      // Produce a valid signature using the revoked keypair
      const revokedFields = { ...validFields, kid: "key-revoked-99" };
      const revokedPayload = buildSignedQrPayloadString(revokedFields, TEST_REVOKED_PRIVATE_KEY);

      await expect(verifyAndParseAccessQrPayload(revokedPayload, now)).rejects.toThrow(
        expect.objectContaining({ code: QR_SIGNATURE_ERROR_CODES.REVOKED_KEY })
      );
    });

    it("rejects a revoked kid when marked as status 'revoked' in issuerKeys array", async () => {
      mockGetGuildConfig.mockResolvedValue({
        guildId: "guild_abc",
        issuerKeys: [
          { kid: "key-active", publicKey: TEST_ISSUER_PUBLIC_KEY, status: "active" },
          { kid: "key-compromised", publicKey: TEST_REVOKED_PUBLIC_KEY, status: "revoked" },
        ],
      });

      const payload = buildSignedQrPayloadString(
        { ...validFields, kid: "key-compromised" },
        TEST_REVOKED_PRIVATE_KEY,
      );

      await expect(verifyAndParseAccessQrPayload(payload, now)).rejects.toThrow(
        expect.objectContaining({ code: QR_SIGNATURE_ERROR_CODES.REVOKED_KEY })
      );
    });
  });

  describe("Unknown kid rejection", () => {
    it("rejects a payload signed with an unknown/unrecognized kid", async () => {
      mockGetGuildConfig.mockResolvedValue({
        guildId: "guild_abc",
        issuerKeys: {
          "key-v1": TEST_ISSUER_PUBLIC_KEY,
        },
      });

      const unknownPayload = buildSignedQrPayloadString(
        { ...validFields, kid: "key-unknown-3000" },
        TEST_ISSUER_PRIVATE_KEY,
      );

      await expect(verifyAndParseAccessQrPayload(unknownPayload, now)).rejects.toThrow(
        expect.objectContaining({ code: QR_SIGNATURE_ERROR_CODES.UNKNOWN_KEY })
      );
    });

    it("rejects payload with invalid non-string kid format at structural layer", async () => {
      const malformedKidPayload = JSON.stringify({
        type: "guildpass.access-check",
        version: 2,
        guildId: "guild_abc",
        resourceId: "vip-door",
        expiresAt: "2026-07-20T12:05:00.000Z",
        signature: "304402204f4c2f9a1b3c5d6e7f8091a2b3c4d5e6f70819a2b3c4d5e6f70819a2b3c4d5e6022033445566778899aabbccddeeff00112233445566778899aabbccddeeff001122",
        kid: "", // empty kid string
      });

      await expect(verifyAndParseAccessQrPayload(malformedKidPayload, now)).rejects.toThrow(
        expect.objectContaining({ code: QR_PAYLOAD_ERROR_CODES.INVALID_KID })
      );
    });
  });

  describe("TTL Expiry and Cache Refresh Behavior", () => {
    it("uses cached key registry within TTL window without re-fetching SDK", async () => {
      mockGetGuildConfig.mockResolvedValue({
        guildId: "guild_abc",
        issuerKeys: { "key-v1": TEST_ISSUER_PUBLIC_KEY },
      });

      const t0 = new Date("2026-07-20T12:00:00.000Z");
      const t1 = new Date("2026-07-20T12:10:00.000Z"); // +10 mins (within 15 min TTL)

      await getGuildIssuerPublicKey("guild_abc", "key-v1", t0);
      await getGuildIssuerPublicKey("guild_abc", "key-v1", t1);

      expect(mockGetGuildConfig).toHaveBeenCalledTimes(1);
    });

    it("refreshes key registry after TTL expires", async () => {
      mockGetGuildConfig.mockResolvedValue({
        guildId: "guild_abc",
        issuerKeys: { "key-v1": TEST_ISSUER_PUBLIC_KEY },
      });

      setKeyRegistryCacheTtlMs(15 * 60 * 1000); // 15 mins

      const t0 = new Date("2026-07-20T12:00:00.000Z");
      const tAfterTtl = new Date("2026-07-20T12:16:00.000Z"); // +16 mins (past TTL)

      await getGuildIssuerPublicKey("guild_abc", "key-v1", t0);

      // Second call after TTL should trigger SDK fetch
      await getGuildIssuerPublicKey("guild_abc", "key-v1", tAfterTtl);

      expect(mockGetGuildConfig).toHaveBeenCalledTimes(2);
    });

    it("picks up updated keys or revocations on registry refresh", async () => {
      // First fetch: key-v1 active
      mockGetGuildConfig.mockResolvedValueOnce({
        guildId: "guild_abc",
        issuerKeys: { "key-v1": TEST_ISSUER_PUBLIC_KEY },
      });

      setKeyRegistryCacheTtlMs(5 * 60 * 1000); // 5 mins

      const t0 = new Date("2026-07-20T12:00:00.000Z");
      await getGuildIssuerPublicKey("guild_abc", "key-v1", t0);

      // Second fetch after TTL: key-v1 revoked, key-v2 active
      mockGetGuildConfig.mockResolvedValueOnce({
        guildId: "guild_abc",
        issuerKeys: { "key-v2": TEST_ISSUER_PUBLIC_KEY_V2 },
        revokedKids: ["key-v1"],
      });

      const t1 = new Date("2026-07-20T12:06:00.000Z"); // +6 mins

      // key-v1 is now revoked
      await expect(getGuildIssuerPublicKey("guild_abc", "key-v1", t1)).rejects.toMatchObject({
        code: QR_SIGNATURE_ERROR_CODES.REVOKED_KEY,
      });

      // key-v2 is now active
      const keyV2 = await getGuildIssuerPublicKey("guild_abc", "key-v2", t1);
      expect(keyV2).toBe(TEST_ISSUER_PUBLIC_KEY_V2);
    });
  });

  describe("Offline Fallback Behavior", () => {
    it("re-uses cached key registry when offline if within reasonable trust window", async () => {
      mockGetGuildConfig.mockResolvedValueOnce({
        guildId: "guild_abc",
        issuerKeys: { "key-v1": TEST_ISSUER_PUBLIC_KEY },
      });

      setKeyRegistryCacheTtlMs(15 * 60 * 1000); // 15 mins TTL
      setKeyRegistryOfflineTrustWindowMs(24 * 60 * 60 * 1000); // 24 hrs trust window

      const t0 = new Date("2026-07-20T12:00:00.000Z");
      await getGuildIssuerPublicKey("guild_abc", "key-v1", t0);

      // Simulate offline / network error on refresh attempt at +1 hour (past TTL but within trust window)
      mockGetGuildConfig.mockRejectedValueOnce(new Error("Network Error / Offline"));

      const tOffline = new Date("2026-07-20T13:00:00.000Z"); // +1 hour
      const key = await getGuildIssuerPublicKey("guild_abc", "key-v1", tOffline);

      expect(key).toBe(TEST_ISSUER_PUBLIC_KEY); // Safe fallback to cached registry
    });

    it("rejects verification when cache is expired past the offline trust window", async () => {
      mockGetGuildConfig.mockResolvedValueOnce({
        guildId: "guild_abc",
        issuerKeys: { "key-v1": TEST_ISSUER_PUBLIC_KEY },
      });

      setKeyRegistryCacheTtlMs(15 * 60 * 1000); // 15 mins TTL
      setKeyRegistryOfflineTrustWindowMs(2 * 60 * 60 * 1000); // 2 hours trust window

      const t0 = new Date("2026-07-20T12:00:00.000Z");
      await getGuildIssuerPublicKey("guild_abc", "key-v1", t0);

      // Network error on refresh
      mockGetGuildConfig.mockRejectedValueOnce(new Error("Network Error / Offline"));

      const tPastTrustWindow = new Date("2026-07-20T15:00:00.000Z"); // +3 hours (past trust window)

      await expect(
        getGuildIssuerPublicKey("guild_abc", "key-v1", tPastTrustWindow),
      ).rejects.toMatchObject({
        code: QR_SIGNATURE_ERROR_CODES.KEY_REGISTRY_EXPIRED,
      });
    });

    it("loads a persisted registry after a simulated restart and uses it while offline", async () => {
      mockGetGuildConfig.mockResolvedValueOnce({
        guildId: "guild_abc",
        issuerKeys: { "key-v1": TEST_ISSUER_PUBLIC_KEY },
      });

      setKeyRegistryCacheTtlMs(15 * 60 * 1000);
      setKeyRegistryOfflineTrustWindowMs(24 * 60 * 60 * 1000);

      const t0 = new Date("2026-07-20T12:00:00.000Z");
      await getGuildIssuerPublicKey("guild_abc", "key-v1", t0);

      clearIssuerKeyCache(); // Simulates an app restart while SecureStore survives.
      mockGetGuildConfig.mockRejectedValueOnce(new Error("Network Error / Offline"));

      const tAfterRestart = new Date("2026-07-20T13:00:00.000Z");
      const key = await getGuildIssuerPublicKey("guild_abc", "key-v1", tAfterRestart);

      expect(key).toBe(TEST_ISSUER_PUBLIC_KEY);
      expect(storageState.setItem).toHaveBeenCalledWith(
        "guildpass:access-key-registry:v1:guild_abc",
        expect.stringContaining('"checksum"'),
      );
      expect(mockGetGuildConfig).toHaveBeenCalledTimes(2);
    });

    it("ignores tampered persisted registries and fetches a fresh copy", async () => {
      storageState.items.set(
        "guildpass:access-key-registry:v1:guild_abc",
        JSON.stringify({
          version: 1,
          guildId: "guild_abc",
          keys: [["key-v1", TEST_REVOKED_PUBLIC_KEY]],
          revokedKids: [],
          fetchedAt: now.getTime(),
          checksum: "0xinvalid",
        }),
      );
      mockGetGuildConfig.mockResolvedValueOnce({
        guildId: "guild_abc",
        issuerKeys: { "key-v1": TEST_ISSUER_PUBLIC_KEY },
      });

      const key = await getGuildIssuerPublicKey("guild_abc", "key-v1", now);

      expect(key).toBe(TEST_ISSUER_PUBLIC_KEY);
      expect(storageState.removeItem).toHaveBeenCalledWith(
        "guildpass:access-key-registry:v1:guild_abc",
      );
    });

    it("does not silently accept unverifiable payloads when no cache exists and offline", async () => {
      mockGetGuildConfig.mockRejectedValueOnce(new Error("Network Error / Offline"));

      const payload = buildSignedQrPayloadString(
        { ...validFields, kid: "key-v1" },
        TEST_ISSUER_PRIVATE_KEY,
      );

      await expect(verifyAndParseAccessQrPayload(payload, now)).rejects.toThrow(
        expect.objectContaining({ code: QR_SIGNATURE_ERROR_CODES.PUBLIC_KEY_UNAVAILABLE })
      );
    });
  });
});
