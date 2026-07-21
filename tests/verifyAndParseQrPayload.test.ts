import { describe, expect, it, vi, beforeEach } from "vitest";
import { QrSignatureError } from "../src/features/access/qrSignature";
import { QrPayloadError, QR_PAYLOAD_ERROR_CODES } from "../src/features/access/qrPayload";
import {
  clearIssuerKeyCache,
  getGuildIssuerPublicKey,
} from "../src/features/access/guildIssuerKey";
import { verifyAndParseAccessQrPayload } from "../src/features/access/verifyQrPayload";
import { clearNonceCache } from "../src/features/access/qrReplayGuard";
import { GUILD_CONFIG_FIXTURE } from "./fixtures/guild.fixtures";
import {
  buildSignedQrPayloadString,
  TEST_ISSUER_PUBLIC_KEY,
} from "./fixtures/qrSignature.fixtures";

// vi.hoisted values survive vi.mock hoisting and can be referenced by factories.
const { mockGetGuildConfig } = vi.hoisted(() => ({ mockGetGuildConfig: vi.fn() }));
const flagState = vi.hoisted(() => ({ qrSignatureVerification: false }));

// Mock the GuildPass client module directly (rather than @guildpass/sdk) so the
// test runs without the SDK's build output. The code under test only depends on
// `guildPassClient.guilds.getGuildConfig` returning a config with
// `issuerPublicKey`.
vi.mock("../src/lib/guildpassClient", () => ({
  guildPassClient: {
    guilds: { getGuildConfig: mockGetGuildConfig },
  },
}));

// Feature flag is controllable per-test via a mutable mock.
vi.mock("../src/config/appConfig", () => ({
  appConfig: flagState,
}));

const now = new Date("2026-06-23T12:00:00.000Z");
const validFields = {
  guildId: "guild_abc",
  resourceId: "vip-door",
  walletAddress: "0x1234567890123456789012345678901234567890",
  expiresAt: "2026-06-23T12:05:00.000Z",
};

beforeEach(() => {
  clearIssuerKeyCache();
  clearNonceCache();
  mockGetGuildConfig.mockReset();
  mockGetGuildConfig.mockResolvedValue(GUILD_CONFIG_FIXTURE);
  flagState.qrSignatureVerification = false;
});

describe("getGuildIssuerPublicKey", () => {
  it("fetches and caches the issuer key per guild", async () => {
    const key1 = await getGuildIssuerPublicKey("guild_abc");
    const key2 = await getGuildIssuerPublicKey("guild_abc");
    expect(key1).toBe(TEST_ISSUER_PUBLIC_KEY);
    expect(key1).toBe(key2); // cached, no second SDK call
    expect(mockGetGuildConfig).toHaveBeenCalledTimes(1);
  });

  it("throws when the config has no issuer public key", async () => {
    mockGetGuildConfig.mockResolvedValueOnce({ guildId: "guild_abc" });
    await expect(getGuildIssuerPublicKey("guild_abc")).rejects.toBeInstanceOf(QrSignatureError);
  });
});

describe("verifyAndParseAccessQrPayload", () => {
  it("accepts an unsigned payload when the feature flag is OFF (migration)", async () => {
    flagState.qrSignatureVerification = false;
    const unsigned = JSON.stringify({
      type: "guildpass.access-check",
      version: 1,
      guildId: "guild_abc",
      resourceId: "vip-door",
      expiresAt: "2026-06-23T12:05:00.000Z",
    });
    const parsed = await verifyAndParseAccessQrPayload(unsigned, now);
    expect(parsed.guildId).toBe("guild_abc");
    expect(mockGetGuildConfig).not.toHaveBeenCalled();
  });

  it("accepts a valid signed payload when the feature flag is ON", async () => {
    flagState.qrSignatureVerification = true;
    const signed = buildSignedQrPayloadString(validFields);
    const parsed = await verifyAndParseAccessQrPayload(signed, now);
    expect(parsed.guildId).toBe("guild_abc");
    expect(parsed.resourceId).toBe("vip-door");
  });

  it("rejects an unsigned payload when the feature flag is ON", async () => {
    flagState.qrSignatureVerification = true;
    const unsigned = JSON.stringify({
      type: "guildpass.access-check",
      version: 1,
      guildId: "guild_abc",
      resourceId: "vip-door",
      expiresAt: "2026-06-23T12:05:00.000Z",
    });
    await expect(verifyAndParseAccessQrPayload(unsigned, now)).rejects.toBeInstanceOf(
      QrSignatureError,
    );
  });

  it("rejects a tampered payload (valid signature, changed field) when the flag is ON", async () => {
    flagState.qrSignatureVerification = true;
    // Sign the *original* fields, then mutate a field after signing so the
    // signature no longer matches the payload bytes.
    const signed = JSON.parse(buildSignedQrPayloadString(validFields)) as Record<string, unknown>;
    signed.resourceId = "evil-door";
    const tampered = JSON.stringify(signed);
    await expect(verifyAndParseAccessQrPayload(tampered, now)).rejects.toMatchObject({
      code: "QR_SIGNATURE_VERIFICATION_FAILED",
    });
  });

  it("accepts a payload with a nonce seen for the first time", async () => {
    const withNonce = JSON.stringify({
      type: "guildpass.access-check",
      version: 1,
      guildId: "guild_abc",
      resourceId: "vip-door",
      expiresAt: "2026-06-23T12:05:00.000Z",
      nonce: "nonce-first-use",
    });
    const parsed = await verifyAndParseAccessQrPayload(withNonce, now);
    expect(parsed.nonce).toBe("nonce-first-use");
  });

  it("rejects a replayed payload (same nonce presented twice) as already used", async () => {
    const withNonce = JSON.stringify({
      type: "guildpass.access-check",
      version: 1,
      guildId: "guild_abc",
      resourceId: "vip-door",
      expiresAt: "2026-06-23T12:05:00.000Z",
      nonce: "nonce-replayed",
    });

    await verifyAndParseAccessQrPayload(withNonce, now);

    await expect(verifyAndParseAccessQrPayload(withNonce, now)).rejects.toMatchObject({
      code: QR_PAYLOAD_ERROR_CODES.ALREADY_USED,
    });
    await expect(verifyAndParseAccessQrPayload(withNonce, now)).rejects.toBeInstanceOf(
      QrPayloadError,
    );
  });

  it("allows two different payloads with distinct nonces", async () => {
    const first = JSON.stringify({
      type: "guildpass.access-check",
      version: 1,
      guildId: "guild_abc",
      resourceId: "vip-door",
      expiresAt: "2026-06-23T12:05:00.000Z",
      nonce: "nonce-a",
    });
    const second = JSON.stringify({
      type: "guildpass.access-check",
      version: 1,
      guildId: "guild_abc",
      resourceId: "vip-door",
      expiresAt: "2026-06-23T12:05:00.000Z",
      nonce: "nonce-b",
    });

    await expect(verifyAndParseAccessQrPayload(first, now)).resolves.toMatchObject({
      nonce: "nonce-a",
    });
    await expect(verifyAndParseAccessQrPayload(second, now)).resolves.toMatchObject({
      nonce: "nonce-b",
    });
  });
});
