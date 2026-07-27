/**
 * Retry / backoff policy for the sync engine (Issue #225).
 *
 * Before this, the engine had no retry at all: `syncEngine.run()` recorded
 * per-entity failures via `failSync()` and stopped, leaving the cache stale
 * until the next reconnect happened to fire. The only retry configured
 * anywhere was React Query's global `retry: 2` (lib/queryClient.ts), which
 * covers component-driven queries — not the sync pass, which calls the SDK
 * directly through `syncFetchers`.
 *
 * Two levels use this module:
 *   - per-entity, inside a pass (a single flaky fetch);
 *   - pass-level, to reschedule a pass that finished with errors.
 *
 * Deliberately feature-scoped rather than in src/lib/. Ad-hoc backoff also
 * exists in keyManager.ts and roleEligibilityResolver.ts, but both sit inside
 * security-sensitive trust windows (key rotation, eligibility staleness) where
 * changing the timing curve is a behaviour change, not a refactor. Until
 * something outside sync adopts this, it is not a cross-feature concern.
 */

export type RetryConfig = {
  /** Total attempts including the first, so 1 disables retrying. */
  maxAttempts: number;
  /** Delay before the second attempt, in ms. */
  baseDelayMs: number;
  /** Multiplier applied per subsequent attempt. */
  factor: number;
  /** Upper bound on any single delay, in ms. */
  maxDelayMs: number;
  /** Fraction of the delay applied as +/- randomisation (0 disables). */
  jitterRatio: number;
};

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  factor: 2,
  maxDelayMs: 30_000,
  jitterRatio: 0.2,
};

/**
 * Delay before `attempt` (1-based: attempt 2 is the first retry).
 * Jitter is applied last so it can never push a delay past maxDelayMs.
 */
export function computeBackoffDelay(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  random: () => number = Math.random,
): number {
  if (attempt <= 1) return 0;

  const raw = config.baseDelayMs * Math.pow(config.factor, attempt - 2);
  const capped = Math.min(raw, config.maxDelayMs);
  if (config.jitterRatio <= 0) return capped;

  // random() in [0,1) maps to a +/- jitterRatio band around the capped delay.
  const spread = capped * config.jitterRatio;
  const jittered = capped + (random() * 2 - 1) * spread;
  return Math.max(0, Math.min(jittered, config.maxDelayMs));
}

export type RetryAbortReason = "offline" | "cancelled";

export class RetryAborted extends Error {
  readonly reason: RetryAbortReason;
  constructor(reason: RetryAbortReason) {
    super(`Sync retry aborted: ${reason}`);
    this.name = "RetryAborted";
    this.reason = reason;
  }
}

export type RetryDeps = {
  config?: RetryConfig;
  /** Injected so tests drive a fake clock instead of real timers. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /**
   * Checked before every attempt and before every backoff wait. Retrying
   * while offline just burns the budget so the pass has none left when
   * connectivity actually returns — so we abort instead and let the next
   * trigger start a fresh pass.
   */
  isOnline?: () => boolean;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs `operation`, retrying transient failures per `config`.
 *
 * Throws `RetryAborted` if connectivity is lost mid-sequence, so callers can
 * distinguish "gave up because the network went away" (not an entity error)
 * from "the server kept rejecting us" (a real error worth surfacing).
 */
export async function runWithRetry<T>(
  operation: (attempt: number) => Promise<T>,
  deps: RetryDeps = {},
): Promise<T> {
  const config = deps.config ?? DEFAULT_RETRY_CONFIG;
  const sleep = deps.sleep ?? defaultSleep;
  const random = deps.random ?? Math.random;
  const isOnline = deps.isOnline ?? (() => true);

  let lastError: unknown;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    if (!isOnline()) throw new RetryAborted("offline");

    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      // An abort from deeper down is terminal — don't re-wrap or retry it.
      if (error instanceof RetryAborted) throw error;
      if (attempt >= config.maxAttempts) break;

      const delay = computeBackoffDelay(attempt + 1, config, random);
      await sleep(delay);
      if (!isOnline()) throw new RetryAborted("offline");
    }
  }

  throw lastError;
}
