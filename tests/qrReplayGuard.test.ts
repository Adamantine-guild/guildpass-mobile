import { describe, expect, it, beforeEach } from "vitest";
import { checkAndRecordNonce, clearNonceCache } from "../src/features/access/qrReplayGuard";
import { QrPayloadError, QR_PAYLOAD_ERROR_CODES } from "../src/features/access/qrPayload";

const now = new Date("2026-06-23T12:00:00.000Z");

beforeEach(() => {
  clearNonceCache();
});

describe("checkAndRecordNonce", () => {
  it("accepts a nonce seen for the first time", () => {
    expect(() =>
      checkAndRecordNonce("nonce-1", "2026-06-23T12:05:00.000Z", now),
    ).not.toThrow();
  });

  it("rejects the same nonce reused within its validity window", () => {
    checkAndRecordNonce("nonce-1", "2026-06-23T12:05:00.000Z", now);

    try {
      checkAndRecordNonce("nonce-1", "2026-06-23T12:05:00.000Z", now);
      expect.fail("Should have thrown QrPayloadError");
    } catch (e) {
      expect(e).toBeInstanceOf(QrPayloadError);
      const err = e as QrPayloadError;
      expect(err.code).toBe(QR_PAYLOAD_ERROR_CODES.ALREADY_USED);
      expect(err.message).toBe("This QR code has already been used.");
    }
  });

  it("allows a nonce again once its expiry has passed (self-pruning)", () => {
    checkAndRecordNonce("nonce-1", "2026-06-23T12:05:00.000Z", now);

    const afterExpiry = new Date("2026-06-23T12:05:01.000Z");
    expect(() => checkAndRecordNonce("nonce-1", "2026-06-23T12:10:00.000Z", afterExpiry)).not.toThrow();
  });

  it("tracks distinct nonces independently", () => {
    checkAndRecordNonce("nonce-1", "2026-06-23T12:05:00.000Z", now);
    expect(() =>
      checkAndRecordNonce("nonce-2", "2026-06-23T12:05:00.000Z", now),
    ).not.toThrow();
  });

  it("falls back to a fixed TTL when expiresAt is missing, still self-pruning", () => {
    checkAndRecordNonce("nonce-1", undefined, now);

    const wayLater = new Date(now.getTime() + 60 * 60 * 1000); // +1h
    expect(() => checkAndRecordNonce("nonce-1", undefined, wayLater)).not.toThrow();
  });

  it("bounds the cache size, evicting the oldest entry once full", () => {
    const farFuture = "2027-01-01T00:00:00.000Z";
    const MAX_TRACKED_NONCES = 500;

    for (let i = 0; i < MAX_TRACKED_NONCES; i += 1) {
      checkAndRecordNonce(`nonce-${i}`, farFuture, now);
    }

    // Cache is now full; adding one more evicts nonce-0, which should then
    // be acceptable again instead of being remembered forever.
    checkAndRecordNonce("nonce-overflow", farFuture, now);

    expect(() => checkAndRecordNonce("nonce-0", farFuture, now)).not.toThrow();
  });
});
