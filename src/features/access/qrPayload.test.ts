import { describe, it, expect } from "vitest";
import { parseAccessQrPayload, ACCESS_QR_TYPE, ACCESS_QR_VERSION } from "./qrPayload";

describe("parseAccessQrPayload edge cases", () => {
  const basePayload = {
    type: ACCESS_QR_TYPE,
    version: ACCESS_QR_VERSION,
    guildId: "guild-123",
    resourceId: "resource-abc",
    walletAddress: "0x1234567890123456789012345678901234567890",
    expiresAt: "2026-07-20T00:00:00.000Z",
  };

  const mockNow = new Date("2026-07-19T00:00:00.000Z");

  it.each([
    {
      name: "Malformed JSON",
      input: "{ invalid json",
      expectedError: "QR code is not a supported GuildPass access payload.",
    },
    {
      name: "Unsupported type",
      input: JSON.stringify({ ...basePayload, type: "UNSUPPORTED_TYPE" }),
      expectedError: "QR code payload type is not supported.",
    },
    {
      name: "Unsupported version",
      input: JSON.stringify({ ...basePayload, version: "999.0.0" }),
      expectedError: "QR code payload version is not supported.",
    },
    {
      name: "Missing required fields (guildId)",
      input: JSON.stringify({ ...basePayload, guildId: "" }),
      expectedError: "QR code is missing a valid guild ID.",
    },
    {
      name: "Missing required fields (resourceId)",
      input: JSON.stringify({ ...basePayload, resourceId: "   " }),
      expectedError: "QR code is missing a valid resource ID.",
    },
    {
      name: "Invalid wallet address pattern",
      input: JSON.stringify({ ...basePayload, walletAddress: "0xInvalidAddress" }),
      expectedError: "QR code contains an invalid wallet address.",
    },
    {
      name: "Expired payload",
      input: JSON.stringify({ ...basePayload, expiresAt: "2026-07-18T23:59:59.000Z" }),
      expectedError: "QR code has expired.",
    },
    {
      name: "Invalid nonce (blank string)",
      input: JSON.stringify({ ...basePayload, nonce: "   " }),
      expectedError: "QR code contains an invalid nonce.",
    },
  ])("should reject case: $name", ({ input, expectedError }) => {
    expect(() => parseAccessQrPayload(input, mockNow)).toThrowError(expectedError);
  });

  it("should accept a valid payload as a control case", () => {
    const result = parseAccessQrPayload(JSON.stringify(basePayload), mockNow);
    expect(result).toEqual({
      guildId: "guild-123",
      resourceId: "resource-abc",
      walletAddress: "0x1234567890123456789012345678901234567890",
      expiresAt: "2026-07-20T00:00:00.000Z",
    });
  });

  it("should parse a valid nonce through to the result", () => {
    const result = parseAccessQrPayload(
      JSON.stringify({ ...basePayload, nonce: "nonce-abc-123" }),
      mockNow,
    );
    expect(result.nonce).toBe("nonce-abc-123");
  });
});