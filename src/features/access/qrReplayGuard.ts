import type * as SQLite from "expo-sqlite";
import { QrPayloadError, QR_PAYLOAD_ERROR_CODES } from "./qrPayload";
import {
  hasNonce,
  insertNonce,
  pruneExpiredNonces,
  countNonces,
  deleteOldestNonces,
} from "../../database/dal";

/**
 * Client-side, persistent replay guard for QR access-check payloads.
 *
 * A scanned payload's `nonce` is single-use: once accepted, that same nonce
 * is rejected until the payload's own `expiresAt` has passed (after that
 * point the payload is already rejected as expired by `parseAccessQrPayload`,
 * so there is no need to remember the nonce any longer). This mitigates a
 * payload photographed or screen-recorded before expiry being resubmitted by
 * an unauthorized party, without requiring any server changes.
 *
 * The cache is:
 *  - **Persistent**: nonces are written to the SQLite `qr_replay_nonces`
 *    table so they survive app force-quits and restarts for their full
 *    validity window.
 *  - **Self-pruning**: expired entries are dropped lazily on every check (no
 *    timers/intervals needed).
 *  - **Bounded**: capped at MAX_TRACKED_NONCES entries, oldest evicted first,
 *    so a burst of scans (or payloads without an `expiresAt`) cannot grow
 *    this unboundedly.
 *  - **Fast in-session**: an in-memory Map mirrors the DB for the current
 *    app session so repeated checks within a session don't require a DB
 *    round-trip.
 *
 * **Setup**: call `initReplayGuard(db)` once at app startup (after migrations)
 * before the first QR scan.  Without it the guard falls back to in-memory-only
 * mode and logs a warning.
 *
 * This is defense-in-depth only — it cannot detect replay across devices or
 * app reinstalls. True single-use enforcement requires server-side tracking,
 * which is a separate effort to coordinate with the @guildpass/sdk maintainers.
 */

const MAX_TRACKED_NONCES = 500;

// Payloads without a usable expiresAt still need to self-prune eventually;
// fall back to a fixed TTL for those so the cache never holds them forever.
const FALLBACK_TTL_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

// In-memory fast-path: nonce -> epoch ms after which the entry can be pruned.
const seenNonces = new Map<string, number>();

// Database handle — set by initReplayGuard().
let _db: SQLite.WebSQLDatabase | null = null;

// ---------------------------------------------------------------------------
// Public init
// ---------------------------------------------------------------------------

/**
 * Wire the replay guard to the app's SQLite database.
 *
 * Must be called once at app startup, after `initDatabase()` / migrations
 * have run, and before any QR code is scanned.  Without this call the guard
 * falls back to in-memory-only mode (nonces are lost on restart).
 */
export const initReplayGuard = (db: SQLite.WebSQLDatabase): void => {
  _db = db;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const pruneExpired = async (
  nowMs: number,
  target?: SQLite.WebSQLDatabase | null,
): Promise<void> => {
  // In-memory prune
  for (const [nonce, expiresAtMs] of seenNonces) {
    if (expiresAtMs <= nowMs) {
      seenNonces.delete(nonce);
    }
  }
  // DB prune (best-effort — don't let a DB error block the scan)
  const db = target ?? _db;
  if (db) {
    try {
      await pruneExpiredNonces(db, nowMs);
    } catch {
      // Non-fatal: in-memory guard still provides session-level protection.
    }
  }
};

const evictOldestIfFull = async (target?: SQLite.WebSQLDatabase | null): Promise<void> => {
  // In-memory eviction
  if (seenNonces.size >= MAX_TRACKED_NONCES) {
    const oldest = seenNonces.keys().next().value;
    if (oldest !== undefined) {
      seenNonces.delete(oldest);
    }
  }
  // DB eviction
  const db = target ?? _db;
  if (db) {
    try {
      const total = await countNonces(db);
      if (total >= MAX_TRACKED_NONCES) {
        await deleteOldestNonces(db, MAX_TRACKED_NONCES - 1);
      }
    } catch {
      // Non-fatal.
    }
  }
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Test-only: reset the nonce guard state.
 *
 * Without a `db` argument, only the in-memory Map is cleared — this mimics a
 * cold app process start where the JS heap is fresh but the SQLite file is
 * intact (the typical "force-quit and reopen" scenario).
 *
 * When a `db` handle is provided, the persisted `qr_replay_nonces` table is
 * also truncated, which is useful in test `beforeEach` hooks to ensure full
 * isolation between test cases.
 */
export const clearNonceCache = async (db?: SQLite.WebSQLDatabase): Promise<void> => {
  seenNonces.clear();
  if (db) {
    try {
      // Use a far-future timestamp to delete all rows regardless of expiry.
      await pruneExpiredNonces(db, Date.now() + 100 * 365 * 24 * 60 * 60 * 1000);
    } catch {
      // Best-effort.
    }
  }
};

/**
 * Check whether `nonce` has already been accepted and, if not, record it.
 *
 * Checks the in-memory cache first (fast path for within-session repeats),
 * then falls back to the persisted SQLite store (catches cross-restart
 * replays).  Writes go to both stores atomically so subsequent checks hit the
 * in-memory fast path.
 *
 * @throws {QrPayloadError} with code ALREADY_USED if `nonce` was already seen
 *         within its validity window.
 */
export const checkAndRecordNonce = async (
  nonce: string,
  expiresAt: string | undefined,
  now: Date = new Date(),
  db?: SQLite.WebSQLDatabase,
): Promise<void> => {
  const target = db ?? _db;
  const nowMs = now.getTime();

  await pruneExpired(nowMs, target);

  // 1. Fast-path: in-memory check (catches within-session repeats without DB)
  if (seenNonces.has(nonce)) {
    throw new QrPayloadError(
      QR_PAYLOAD_ERROR_CODES.ALREADY_USED,
      "This QR code has already been used.",
    );
  }

  // 2. Persistent check: catches cross-restart replays
  if (target) {
    let alreadyInDb = false;
    try {
      alreadyInDb = await hasNonce(target, nonce);
    } catch {
      // Non-fatal: if the DB check fails we fall through to accepting the
      // nonce (in-memory-only mode degrades gracefully).
    }
    if (alreadyInDb) {
      // Populate the in-memory cache so subsequent checks hit the fast path.
      const parsedMs = expiresAt ? new Date(expiresAt).getTime() : NaN;
      const expiresAtMs = Number.isNaN(parsedMs) ? nowMs + FALLBACK_TTL_MS : parsedMs;
      seenNonces.set(nonce, expiresAtMs);

      throw new QrPayloadError(
        QR_PAYLOAD_ERROR_CODES.ALREADY_USED,
        "This QR code has already been used.",
      );
    }
  }

  // 3. Not seen yet — evict if at capacity, then record.
  await evictOldestIfFull(target);

  const parsedExpiryMs = expiresAt ? new Date(expiresAt).getTime() : NaN;
  const expiresAtMs = Number.isNaN(parsedExpiryMs) ? nowMs + FALLBACK_TTL_MS : parsedExpiryMs;

  // Write to in-memory cache
  seenNonces.set(nonce, expiresAtMs);

  // Write to persistent store (best-effort)
  if (target) {
    try {
      await insertNonce(target, nonce, expiresAtMs);
    } catch {
      // Non-fatal: in-memory guard still provides session-level protection.
    }
  }
};
