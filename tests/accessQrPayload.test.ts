import { describe, expect, it } from "vitest";
import {
  ACCESS_QR_TYPE,
  ACCESS_QR_VERSION,
  parseAccessQrPayload,
} from "../src/features/access/qrPayload";

const now = new Date("2026-06-23T12:00:00.000Z");

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
