import { describe, expect, it } from "vitest";
import {
  buildSigningMessage,
  QrSignatureError,
  QR_SIGNATURE_ERROR_CODES,
  verifyQrSignature,
} from "../src/features/access/qrSignature";
import {
  signQrPayload,
  TEST_ISSUER_PUBLIC_KEY,
} from "./fixtures/qrSignature.fixtures";

const fields = {
  guildId: "guild_abc",
  resourceId: "vip-door",
  walletAddress: "0x1234567890123456789012345678901234567890",
  expiresAt: "2026-06-23T12:05:00.000Z",
};

describe("buildSigningMessage", () => {
  it("canonicalizes fields in a fixed order with empty strings for absent ones", () => {
    // type + version are pinned to the canonical constants by the scheme.
    expect(buildSigningMessage({ guildId: "g", resourceId: "r" })).toBe(
      ["guildpass.access-check", "1", "g", "r", "", ""].join("\n"),
    );
  });

  it("does not trim field values (signer/verifier must agree byte-for-byte)", () => {
    const msg = buildSigningMessage({ guildId: "  guild  ", resourceId: "r" });
    expect(msg).toContain("  guild  ");
  });
});

describe("verifyQrSignature", () => {
  it("accepts a payload signed with the matching issuer key", () => {
    const signature = signQrPayload(fields);
    expect(() => verifyQrSignature(fields, signature, TEST_ISSUER_PUBLIC_KEY)).not.toThrow();
  });

  it("throws MISSING_SIGNATURE when no signature is supplied", () => {
    let caught: unknown;
    try {
      verifyQrSignature(fields, "", TEST_ISSUER_PUBLIC_KEY);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(QrSignatureError);
    expect((caught as QrSignatureError).code).toBe(QR_SIGNATURE_ERROR_CODES.MISSING_SIGNATURE);
  });

  it("rejects a tampered payload (same fields, invalid signature) with VERIFICATION_FAILED", () => {
    // Valid signature for the original fields, but we verify against changed fields.
    const signature = signQrPayload(fields);
    let caught: unknown;
    try {
      verifyQrSignature({ ...fields, resourceId: "tampered-door" }, signature, TEST_ISSUER_PUBLIC_KEY);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(QrSignatureError);
    expect((caught as QrSignatureError).code).toBe(QR_SIGNATURE_ERROR_CODES.VERIFICATION_FAILED);
  });

  it("rejects a random (non-derived) signature with VERIFICATION_FAILED", () => {
    const randomSig =
      "304402204f4c2f9a1b3c5d6e7f8091a2b3c4d5e6f70819a2b3c4d5e6f70819a2b3c4d5e6022033445566778899aabbccddeeff00112233445566778899aabbccddeeff001122";
    let caught: unknown;
    try {
      verifyQrSignature(fields, randomSig, TEST_ISSUER_PUBLIC_KEY);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(QrSignatureError);
    expect((caught as QrSignatureError).code).toBe(QR_SIGNATURE_ERROR_CODES.VERIFICATION_FAILED);
  });

  it("rejects a non-hex signature with INVALID_SIGNATURE_FORMAT", () => {
    let caught: unknown;
    try {
      verifyQrSignature(fields, "not-hex!!!", TEST_ISSUER_PUBLIC_KEY);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(QrSignatureError);
    expect((caught as QrSignatureError).code).toBe(QR_SIGNATURE_ERROR_CODES.INVALID_SIGNATURE_FORMAT);
  });

  it("rejects an invalid public key with PUBLIC_KEY_UNAVAILABLE", () => {
    const signature = signQrPayload(fields);
    let caught: unknown;
    try {
      verifyQrSignature(fields, signature, "deadbeef");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(QrSignatureError);
    expect((caught as QrSignatureError).code).toBe(QR_SIGNATURE_ERROR_CODES.PUBLIC_KEY_UNAVAILABLE);
  });

  it("accepts a 0x-prefixed signature and public key", () => {
    const signature = signQrPayload(fields);
    expect(() =>
      verifyQrSignature(fields, `0x${signature}`, `0x${TEST_ISSUER_PUBLIC_KEY}`),
    ).not.toThrow();
  });
});
