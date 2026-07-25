import { describe, it, expect } from "vitest";
import { parseAccessQrPayload, ACCESS_QR_TYPE, ACCESS_QR_VERSION, QrPayloadError } from "./qrPayload";

describe("parseAccessQrPayload edge cases", () => {
  const basePayload = {
    type: ACCESS_QR_TYPE,
    version: 2,
    guildId: "guild-123",
    resourceId: "resource-abc",
    walletAddress: "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
    expiresAt: "2026-07-20T00:00:00.000Z",
    kid: "key_1",
    signature: "3045022100e...",
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
      name: "Unsupported version (legacy V1 rejected)",
      input: JSON.stringify({ ...basePayload, version: 1 }),
      expectedError: "QR code payload version is not supported.",
    },
    {
      name: "Unsupported version (future version rejected)",
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
      name: "Missing required fields (kid)",
      input: JSON.stringify({ ...basePayload, kid: undefined }),
      expectedError: "QR code contains an invalid or missing key ID.",
    },
    {
      name: "Missing required fields (signature)",
      input: JSON.stringify({ ...basePayload, signature: undefined }),
      expectedError: "QR code contains an invalid or missing signature.",
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
      walletAddress: "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
      expiresAt: "2026-07-20T00:00:00.000Z",
      kid: "key_1",
    });
  });

  it("should parse a valid nonce through to the result", () => {
    const result = parseAccessQrPayload(
      JSON.stringify({ ...basePayload, nonce: "nonce-abc-123" }),
      mockNow,
    );
    expect(result.nonce).toBe("nonce-abc-123");
  });

  describe("wallet address checksum validation", () => {
    it("accepts a correctly EIP-55 checksummed address", () => {
      const result = parseAccessQrPayload(
        JSON.stringify({
          ...basePayload,
          walletAddress: "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
        }),
        mockNow,
      );
      expect(result.walletAddress).toBe("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed");
    });

    it("accepts a valid all-lowercase address (checksum-agnostic per EIP-55)", () => {
      const result = parseAccessQrPayload(
        JSON.stringify({
          ...basePayload,
          walletAddress: "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed",
        }),
        mockNow,
      );
      expect(result.walletAddress).toBe("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed");
    });

    it("rejects a mixed-case address with an incorrect checksum, distinct from the format error", () => {
      // Same address as the valid checksummed case above, with one letter's
      // case flipped (5aAeb -> 5AAeb) — still correct 0x + 40 hex format,
      // so the regex check alone would let this through.
      const invalidChecksumAddress = "0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
      expect(() =>
        parseAccessQrPayload(
          JSON.stringify({ ...basePayload, walletAddress: invalidChecksumAddress }),
          mockNow,
        ),
      ).toThrowError(
        "QR code contains a wallet address with an invalid checksum. Please rescan the code or contact the guild issuer.",
      );
    });

    it("surfaces a distinct error code for checksum failures vs. malformed-format failures", () => {
      const invalidChecksumAddress = "0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
      try {
        parseAccessQrPayload(
          JSON.stringify({ ...basePayload, walletAddress: invalidChecksumAddress }),
          mockNow,
        );
        expect.unreachable("expected parseAccessQrPayload to throw");
      } catch (err) {
        expect(err).toBeInstanceOf(QrPayloadError);
        expect((err as QrPayloadError).code).toBe("QR_PAYLOAD_INVALID_WALLET_CHECKSUM");
      }

      try {
        parseAccessQrPayload(
          JSON.stringify({ ...basePayload, walletAddress: "0xInvalidAddress" }),
          mockNow,
        );
        expect.unreachable("expected parseAccessQrPayload to throw");
      } catch (err) {
        expect(err).toBeInstanceOf(QrPayloadError);
        expect((err as QrPayloadError).code).toBe("QR_PAYLOAD_INVALID_WALLET_ADDRESS");
      }
    });
  });
});