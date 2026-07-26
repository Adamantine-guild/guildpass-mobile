import { describe, expect, it, beforeEach } from "vitest";
import {
  checkAndRecordNonce,
  clearNonceCache,
  initReplayGuard,
} from "../src/features/access/qrReplayGuard";
import { QrPayloadError, QR_PAYLOAD_ERROR_CODES } from "../src/features/access/qrPayload";
import { createMockDb } from "./database/mock-db";
import { applyMigrations } from "../src/database/migrations";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fresh in-memory DB and wire it to the replay guard. */
async function freshDb() {
  const db = createMockDb();
  await applyMigrations(db as never);
  initReplayGuard(db as never);
  return db;
}

const now = new Date("2026-06-23T12:00:00.000Z");

// ---------------------------------------------------------------------------
// Test lifecycle
// ---------------------------------------------------------------------------

let currentTestDb: ReturnType<typeof createMockDb>;

beforeEach(async () => {
  // Create a brand-new in-memory DB for each test to guarantee full isolation.
  currentTestDb = await freshDb();
  // Pass the db explicitly to also wipe the persisted qr_replay_nonces table.
  await clearNonceCache(currentTestDb as never);
});

// ---------------------------------------------------------------------------
// Core behaviour (all pre-existing semantics, now async)
// ---------------------------------------------------------------------------

describe("checkAndRecordNonce", () => {
  it("accepts a nonce seen for the first time", async () => {
    await expect(
      checkAndRecordNonce("nonce-1", "2026-06-23T12:05:00.000Z", now),
    ).resolves.not.toThrow();
  });

  it("rejects the same nonce reused within its validity window", async () => {
    await checkAndRecordNonce("nonce-1", "2026-06-23T12:05:00.000Z", now);

    try {
      await checkAndRecordNonce("nonce-1", "2026-06-23T12:05:00.000Z", now);
      expect.fail("Should have thrown QrPayloadError");
    } catch (e) {
      expect(e).toBeInstanceOf(QrPayloadError);
      const err = e as QrPayloadError;
      expect(err.code).toBe(QR_PAYLOAD_ERROR_CODES.ALREADY_USED);
      expect(err.message).toBe("This QR code has already been used.");
    }
  });

  it("allows a nonce again once its expiry has passed (self-pruning)", async () => {
    await checkAndRecordNonce("nonce-1", "2026-06-23T12:05:00.000Z", now);

    const afterExpiry = new Date("2026-06-23T12:05:01.000Z");
    await expect(
      checkAndRecordNonce("nonce-1", "2026-06-23T12:10:00.000Z", afterExpiry),
    ).resolves.not.toThrow();
  });

  it("tracks distinct nonces independently", async () => {
    await checkAndRecordNonce("nonce-1", "2026-06-23T12:05:00.000Z", now);
    await expect(
      checkAndRecordNonce("nonce-2", "2026-06-23T12:05:00.000Z", now),
    ).resolves.not.toThrow();
  });

  it("falls back to a fixed TTL when expiresAt is missing, still self-pruning", async () => {
    await checkAndRecordNonce("nonce-1", undefined, now);

    const wayLater = new Date(now.getTime() + 60 * 60 * 1000); // +1h
    await expect(checkAndRecordNonce("nonce-1", undefined, wayLater)).resolves.not.toThrow();
  });

  it("bounds the cache size, evicting the oldest entry once full", async () => {
    const farFuture = "2027-01-01T00:00:00.000Z";
    const MAX_TRACKED_NONCES = 500;

    for (let i = 0; i < MAX_TRACKED_NONCES; i += 1) {
      await checkAndRecordNonce(`nonce-${i}`, farFuture, now);
    }

    // Cache is now full; adding one more evicts nonce-0, which should then
    // be acceptable again instead of being remembered forever.
    await checkAndRecordNonce("nonce-overflow", farFuture, now);

    await expect(checkAndRecordNonce("nonce-0", farFuture, now)).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Persistence across restarts
// ---------------------------------------------------------------------------

describe("persistence across app restarts", () => {
  it("rejects a nonce accepted before a simulated restart", async () => {
    // ── Session 1: user scans a QR code ──
    const db1 = await freshDb();
    await checkAndRecordNonce("persistent-nonce", "2026-06-23T12:05:00.000Z", now, db1 as never);

    // ── Simulated restart: new guard instance, SAME underlying DB ──
    // Re-init the guard with the same DB (same persistent table).
    initReplayGuard(db1 as never);
    // Clear only the in-memory Map, not the persisted table, to simulate a
    // cold-start where the Map is empty but the DB still has the nonce.
    await clearNonceCache(); // no db arg → only in-memory Map is cleared

    // ── Session 2: attacker replays the same (still-valid) QR code ──
    await expect(
      checkAndRecordNonce("persistent-nonce", "2026-06-23T12:05:00.000Z", now, db1 as never),
    ).rejects.toThrow(QrPayloadError);
  });

  it("allows a nonce once its expiry has passed even when persisted", async () => {
    const db1 = await freshDb();
    await checkAndRecordNonce("expiring-nonce", "2026-06-23T12:05:00.000Z", now, db1 as never);

    // Simulate restart (clear in-memory only)
    initReplayGuard(db1 as never);
    await clearNonceCache(); // in-memory only

    // After expiry the DB prune step should remove it and accept a re-use
    const afterExpiry = new Date("2026-06-23T12:05:01.000Z");
    await expect(
      checkAndRecordNonce("expiring-nonce", "2026-06-23T12:10:00.000Z", afterExpiry, db1 as never),
    ).resolves.not.toThrow();
  });

  it("pruning works against the persisted store", async () => {
    const db1 = await freshDb();

    // Insert a nonce that expires 1 ms before `now`
    await checkAndRecordNonce(
      "soon-expired",
      "2026-06-23T11:59:59.999Z", // 1 ms before `now`
      new Date("2026-06-23T11:59:59.000Z"), // recorded while still valid
      db1 as never,
    );

    // Simulate restart
    initReplayGuard(db1 as never);
    await clearNonceCache(); // in-memory only

    // After expiry: pruneExpiredNonces should have removed the row
    // so the same nonce is re-accepted (payload would have been rejected as
    // expired by parseAccessQrPayload anyway, but guard should still prune).
    await expect(
      checkAndRecordNonce(
        "soon-expired",
        "2026-06-23T12:10:00.000Z",
        now, // now = 12:00:00, after the 11:59:59.999 expiry
        db1 as never,
      ),
    ).resolves.not.toThrow();
  });

  it("MAX_TRACKED_NONCES eviction is enforced against the DB", async () => {
    const db1 = await freshDb();
    const farFuture = "2027-01-01T00:00:00.000Z";
    const MAX_TRACKED_NONCES = 500;

    // Fill the DB table to exactly the limit
    for (let i = 0; i < MAX_TRACKED_NONCES; i++) {
      await checkAndRecordNonce(`db-nonce-${i}`, farFuture, now, db1 as never);
    }

    // Simulate restart (clear in-memory only)
    initReplayGuard(db1 as never);
    await clearNonceCache();

    // This should trigger DB eviction of the oldest entry
    await checkAndRecordNonce("db-nonce-overflow", farFuture, now, db1 as never);

    // The oldest nonce (db-nonce-0) should have been evicted from the DB and
    // is now re-acceptable.
    await expect(
      checkAndRecordNonce("db-nonce-0", farFuture, now, db1 as never),
    ).resolves.not.toThrow();
  });
});
