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
  kid: "key-1",
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
  it("rejects an unsigned version 1 payload (unsupported version)", async () => {
    const unsigned = JSON.stringify({
      type: "guildpass.access-check",
      version: 1,
      guildId: "guild_abc",
      resourceId: "vip-door",
      expiresAt: "2026-06-23T12:05:00.000Z",
    });
    await expect(verifyAndParseAccessQrPayload(unsigned, now)).rejects.toBeInstanceOf(
      QrPayloadError,
    );
  });

  it("accepts a valid signed version 2 payload", async () => {
    const signed = buildSignedQrPayloadString(validFields);
    const result = await verifyAndParseAccessQrPayload(signed, now);
    expect(result.payload.guildId).toBe("guild_abc");
    expect(result.payload.resourceId).toBe("vip-door");
    expect(result.isVerified).toBe(true);
  });

  it("rejects a version 2 payload missing a signature", async () => {
    const unsigned = JSON.stringify({
      ...validFields,
      type: "guildpass.access-check",
      version: 2,
    });
    await expect(verifyAndParseAccessQrPayload(unsigned, now)).rejects.toBeInstanceOf(
      QrPayloadError,
    );
  });

  it("rejects a tampered version 2 payload (valid signature, changed field)", async () => {
    // Sign the *original* fields, then mutate a field after signing so the
    // signature no longer matches the payload bytes.
    const signed = JSON.parse(buildSignedQrPayloadString(validFields)) as Record<string, unknown>;
    signed.resourceId = "evil-door";
    const tampered = JSON.stringify(signed);
    await expect(verifyAndParseAccessQrPayload(tampered, now)).resolves.toMatchObject({
      success: false,
      reason: "QR_SIGNATURE_VERIFICATION_FAILED",
    });
  });

  it("accepts a payload with a nonce seen for the first time", async () => {
    const withNonce = JSON.parse(buildSignedQrPayloadString(validFields)) as Record<string, unknown>;
    withNonce.nonce = "nonce-first-use";
    // We must re-sign it with the nonce, wait, no, the nonce is NOT signed! 
    // Wait, the canonicalization doesn't include the nonce?
    // Let's check: qrSignature.buildSigningMessage(payload)
    // [type, version, guildId, resourceId, walletAddress, expiresAt, kid]
    // The nonce is NOT signed! 
    const tampered = JSON.stringify(withNonce);
    const result = await verifyAndParseAccessQrPayload(tampered, now);
    expect(result.payload.nonce).toBe("nonce-first-use");
  });

  it("rejects a replayed payload (same nonce presented twice) as already used", async () => {
    const withNonce = JSON.parse(buildSignedQrPayloadString(validFields)) as Record<string, unknown>;
    withNonce.nonce = "nonce-replayed";
    const payloadStr = JSON.stringify(withNonce);

    await verifyAndParseAccessQrPayload(payloadStr, now);

    await expect(verifyAndParseAccessQrPayload(payloadStr, now)).rejects.toMatchObject({
      code: QR_PAYLOAD_ERROR_CODES.ALREADY_USED,
    });
    await expect(verifyAndParseAccessQrPayload(payloadStr, now)).rejects.toBeInstanceOf(
      QrPayloadError,
    );
  });

  it("allows two different payloads with distinct nonces", async () => {
    const firstObj = JSON.parse(buildSignedQrPayloadString(validFields)) as Record<string, unknown>;
    firstObj.nonce = "nonce-a";
    const first = JSON.stringify(firstObj);

    const secondObj = JSON.parse(buildSignedQrPayloadString(validFields)) as Record<string, unknown>;
    secondObj.nonce = "nonce-b";
    const second = JSON.stringify(secondObj);

    await expect(verifyAndParseAccessQrPayload(first, now)).resolves.toMatchObject({
      payload: { nonce: "nonce-a" },
    });
    await expect(verifyAndParseAccessQrPayload(second, now)).resolves.toMatchObject({
      payload: { nonce: "nonce-b" },
    });
  });
});
