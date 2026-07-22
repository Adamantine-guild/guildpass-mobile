import { describe, expect, it } from "vitest";
import {
  ACCESS_QR_TYPE,
  ACCESS_QR_VERSION,
  SUPPORTED_QR_PAYLOAD_VERSIONS,
  parseAccessQrPayload,
  QrPayloadError,
  QR_PAYLOAD_ERROR_CODES,
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

describe("SUPPORTED_QR_PAYLOAD_VERSIONS", () => {
  it("exports a single constant allow-list of supported (type, version) pairs", () => {
    expect(SUPPORTED_QR_PAYLOAD_VERSIONS).toEqual([
      {
        type: "guildpass.access-check",
        version: 1,
      },
    ]);
  });
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

  it("rejects malformed JSON with QR_PAYLOAD_MALFORMED_JSON code", () => {
    try {
      parseAccessQrPayload("guild_abc:vip-door", now);
      expect.fail("Should have thrown QrPayloadError");
    } catch (e) {
      expect(e).toBeInstanceOf(QrPayloadError);
      const err = e as QrPayloadError;
      expect(err.code).toBe(QR_PAYLOAD_ERROR_CODES.MALFORMED_JSON);
      expect(err.message).toBe("QR code is not a supported GuildPass access payload.");
    }
  });

  it("rejects non-object payload with QR_PAYLOAD_MALFORMED code", () => {
    try {
      parseAccessQrPayload('"not-an-object"', now);
      expect.fail("Should have thrown QrPayloadError");
    } catch (e) {
      expect(e).toBeInstanceOf(QrPayloadError);
      const err = e as QrPayloadError;
      expect(err.code).toBe(QR_PAYLOAD_ERROR_CODES.MALFORMED_PAYLOAD);
      expect(err.message).toBe("QR code payload is malformed.");
    }
  });

  it("rejects unsupported payload types with QR_PAYLOAD_UNSUPPORTED_TYPE code", () => {
    try {
      parseAccessQrPayload(buildPayload({ type: "guildpass.event" }), now);
      expect.fail("Should have thrown QrPayloadError");
    } catch (e) {
      expect(e).toBeInstanceOf(QrPayloadError);
      const err = e as QrPayloadError;
      expect(err.code).toBe(QR_PAYLOAD_ERROR_CODES.UNSUPPORTED_TYPE);
      expect(err.message).toBe("QR code payload type is not supported.");
    }
  });

  it("rejects unsupported payload versions with QR_PAYLOAD_UNSUPPORTED_VERSION code and update suggestion", () => {
    try {
      parseAccessQrPayload(buildPayload({ version: 2 }), now);
      expect.fail("Should have thrown QrPayloadError");
    } catch (e) {
      expect(e).toBeInstanceOf(QrPayloadError);
      const err = e as QrPayloadError;
      expect(err.code).toBe(QR_PAYLOAD_ERROR_CODES.UNSUPPORTED_VERSION);
      expect(err.message).toContain("QR code payload version is not supported.");
      expect(err.message).toContain("Please update your app");
    }
  });

  it("distinguishes version: 2 from unknown type values by error code", () => {
    try {
      parseAccessQrPayload(buildPayload({ version: 2 }), now);
      expect.fail("Should have thrown");
    } catch (e) {
      expect((e as QrPayloadError).code).toBe(QR_PAYLOAD_ERROR_CODES.UNSUPPORTED_VERSION);
    }

    try {
      parseAccessQrPayload(buildPayload({ type: "unknown.type" }), now);
      expect.fail("Should have thrown");
    } catch (e) {
      expect((e as QrPayloadError).code).toBe(QR_PAYLOAD_ERROR_CODES.UNSUPPORTED_TYPE);
    }

    try {
      parseAccessQrPayload(buildPayload({ type: "unknown.type", version: 2 }), now);
      expect.fail("Should have thrown");
    } catch (e) {
      expect((e as QrPayloadError).code).toBe(QR_PAYLOAD_ERROR_CODES.UNSUPPORTED_TYPE);
    }
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

  it("parses a payload without a wallet address", () => {
    const payload = parseAccessQrPayload(buildPayload({ walletAddress: undefined }), now);

    expect(payload).toEqual({
      guildId: "guild_abc",
      resourceId: "vip-door",
      expiresAt: "2026-06-23T12:05:00.000Z",
    });
  });

  it("rejects invalid wallet addresses", () => {
    expect(() => parseAccessQrPayload(buildPayload({ walletAddress: "0x123" }), now)).toThrow(
      "QR code contains an invalid wallet address.",
    );
  });
});

describe("parseAccessQrPayload - Delimiter Injection Prevention (Property-based tests)", () => {
  it("rejects randomly generated colliding payloads", () => {
    // A lightweight custom generator for delimiter injection fuzzing
    const generateCollidingPayloads = (numPairs: number) => {
      const payloads = [];
      const safeChars = "abcdefghijklmnopqrstuvwxyz0123456789";
      for (let i = 0; i < numPairs; i++) {
        // e.g. guild="foo", resource="bar\nbaz" -> canonicalizes to foo\nbar\nbaz
        // collides with guild="foo\nbar", resource="baz" -> canonicalizes to foo\nbar\nbaz
        const p1 = `part1_${Math.random()}`;
        const p2 = `part2_${Math.random()}`;
        const p3 = `part3_${Math.random()}`;
        
        payloads.push({
          guildId: p1,
          resourceId: `${p2}\n${p3}`,
        });
        payloads.push({
          guildId: `${p1}\n${p2}`,
          resourceId: p3,
        });
      }
      return payloads;
    };

    const maliciousPayloads = generateCollidingPayloads(50);
    let rejectedCount = 0;

    for (const fields of maliciousPayloads) {
      try {
        parseAccessQrPayload(buildPayload(fields), now);
      } catch (e) {
        expect(e).toBeInstanceOf(QrPayloadError);
        rejectedCount++;
      }
    }

    // Ensure EVERY generated attempt with \n was rejected
    expect(rejectedCount).toBe(maliciousPayloads.length);
  });
});
