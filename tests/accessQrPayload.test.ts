import { describe, expect, it } from "vitest";
import {
  ACCESS_QR_TYPE,
  ACCESS_QR_VERSION,
  parseAccessQrPayload,
} from "../src/features/access/qrPayload";
import {
  INVALID_WALLET_CHECKSUM,
  WalletAddressError,
} from "../src/lib/walletValidation";

const now = new Date("2026-06-23T12:00:00.000Z");

const EIP55_VALID = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
const EIP55_INVALID_MIXED = "0x5aaeb6053F3E94C9b9A09f33669435E7Ef1BeAed"; // wrong case on first hex letter

const buildPayload = (overrides = {}) =>
  JSON.stringify({
    type: ACCESS_QR_TYPE,
    version: ACCESS_QR_VERSION,
    guildId: "guild_abc",
    resourceId: "vip-door",
    expiresAt: "2026-06-23T12:05:00.000Z",
    ...overrides,
  });

describe("parseAccessQrPayload", () => {
  it("parses a supported access check payload", () => {
    const payload = parseAccessQrPayload(
      buildPayload({
        walletAddress: "0x1234567890123456789012345678901234567890",
      }),
      now,
    );

    expect(payload).toEqual({
      guildId: "guild_abc",
      resourceId: "vip-door",
      walletAddress: "0x1234567890123456789012345678901234567890",
      expiresAt: "2026-06-23T12:05:00.000Z",
    });
  });

  it("accepts a valid EIP-55 checksummed wallet address", () => {
    const payload = parseAccessQrPayload(buildPayload({ walletAddress: EIP55_VALID }), now);
    expect(payload.walletAddress).toBe(EIP55_VALID);
  });

  it("accepts an all-lowercase wallet address", () => {
    const lower = EIP55_VALID.toLowerCase();
    const payload = parseAccessQrPayload(buildPayload({ walletAddress: lower }), now);
    expect(payload.walletAddress).toBe(lower);
  });

  it("rejects a mixed-case address with an invalid EIP-55 checksum", () => {
    expect(() =>
      parseAccessQrPayload(buildPayload({ walletAddress: EIP55_INVALID_MIXED }), now),
    ).toThrow(WalletAddressError);

    try {
      parseAccessQrPayload(buildPayload({ walletAddress: EIP55_INVALID_MIXED }), now);
    } catch (err) {
      expect(err).toBeInstanceOf(WalletAddressError);
      expect((err as WalletAddressError).code).toBe(INVALID_WALLET_CHECKSUM);
      expect((err as Error).message).toMatch(/checksum/i);
    }
  });

  it("rejects malformed JSON", () => {
    expect(() => parseAccessQrPayload("guild_abc:vip-door", now)).toThrow(
      "QR code is not a supported GuildPass access payload.",
    );
  });

  it("rejects unsupported payload types", () => {
    expect(() => parseAccessQrPayload(buildPayload({ type: "guildpass.event" }), now)).toThrow(
      "QR code payload type is not supported.",
    );
  });

  it("rejects unsupported payload versions", () => {
    expect(() => parseAccessQrPayload(buildPayload({ version: 2 }), now)).toThrow(
      "QR code payload version is not supported.",
    );
  });

  it("rejects missing required fields", () => {
    expect(() => parseAccessQrPayload(buildPayload({ resourceId: "" }), now)).toThrow(
      "QR code is missing a valid resource ID.",
    );
  });

  it("rejects expired payloads", () => {
    expect(() =>
      parseAccessQrPayload(buildPayload({ expiresAt: "2026-06-23T11:59:59.000Z" }), now),
    ).toThrow("QR code has expired.");
  });

  it("rejects invalid wallet addresses", () => {
    expect(() => parseAccessQrPayload(buildPayload({ walletAddress: "0x123" }), now)).toThrow(
      "QR code contains an invalid wallet address.",
    );
  });
});
