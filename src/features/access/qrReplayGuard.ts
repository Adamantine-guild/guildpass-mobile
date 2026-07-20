import { QrPayloadError, QR_PAYLOAD_ERROR_CODES } from "./qrPayload";

/**
 * Client-side, in-memory replay guard for QR access-check payloads.
 *
 * A scanned payload's `nonce` is single-use: once accepted, that same nonce
 * is rejected until the payload's own `expiresAt` has passed (after that
 * point the payload is already rejected as expired by `parseAccessQrPayload`,
 * so there is no need to remember the nonce any longer). This mitigates a
 * payload photographed or screen-recorded before expiry being resubmitted by
 * an unauthorized party, without requiring any server changes.
 *
 * The cache is:
 *  - Self-pruning: expired entries are dropped lazily on every check (no
 *    timers/intervals needed).
 *  - Bounded: capped at MAX_TRACKED_NONCES entries, oldest evicted first, so
 *    a burst of scans (or payloads without an `expiresAt`) cannot grow this
 *    unboundedly for the life of the app session.
 *
 * This is defense-in-depth only, scoped to a single app session/device — it
 * cannot detect replay across devices or app reinstalls. True single-use
 * enforcement requires server-side tracking, which is a separate effort to
 * coordinate with the @guildpass/sdk maintainers.
 */

const MAX_TRACKED_NONCES = 500;

// Payloads without a usable expiresAt still need to self-prune eventually;
// fall back to a fixed TTL for those so the cache never holds them forever.
const FALLBACK_TTL_MS = 5 * 60 * 1000;

// nonce -> epoch ms after which the entry is safe to prune.
const seenNonces = new Map<string, number>();

const pruneExpired = (nowMs: number): void => {
  for (const [nonce, expiresAtMs] of seenNonces) {
    if (expiresAtMs <= nowMs) {
      seenNonces.delete(nonce);
    }
  }
};

const evictOldestIfFull = (): void => {
  if (seenNonces.size < MAX_TRACKED_NONCES) {
    return;
  }
  const oldest = seenNonces.keys().next().value;
  if (oldest !== undefined) {
    seenNonces.delete(oldest);
  }
};

/** Test-only: reset the cache between test cases. */
export const clearNonceCache = (): void => {
  seenNonces.clear();
};

/**
 * Check whether `nonce` has already been accepted and, if not, record it.
 *
 * @throws {QrPayloadError} with code ALREADY_USED if `nonce` was already seen
 *         within its validity window.
 */
export const checkAndRecordNonce = (
  nonce: string,
  expiresAt: string | undefined,
  now: Date = new Date(),
): void => {
  const nowMs = now.getTime();
  pruneExpired(nowMs);

  if (seenNonces.has(nonce)) {
    throw new QrPayloadError(
      QR_PAYLOAD_ERROR_CODES.ALREADY_USED,
      "This QR code has already been used.",
    );
  }

  evictOldestIfFull();

  const parsedExpiryMs = expiresAt ? new Date(expiresAt).getTime() : NaN;
  const expiresAtMs = Number.isNaN(parsedExpiryMs) ? nowMs + FALLBACK_TTL_MS : parsedExpiryMs;

  seenNonces.set(nonce, expiresAtMs);
};
