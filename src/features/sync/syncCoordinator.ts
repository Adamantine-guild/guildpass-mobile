/**
 * Sync coordinator (Issue #225).
 *
 * Single owner of *when* reconciliation runs. Before this, two independent and
 * mutually unaware background-sync systems existed:
 *
 *   - features/sync/syncManager.ts     — reconnect-driven, React Query cache
 *   - features/notifications/useBackgroundSync.ts — AppState + OS background
 *     fetch, reconciliation-store based
 *
 * They shared no scheduler, no rate limiter and no status, so on a reconnect
 * that coincided with a foreground event they would have raced with two
 * different definitions of "reconciled". (In practice the second never ran —
 * it had zero consumers — and it is deleted in this issue; its useful part,
 * the foreground trigger, is re-expressed here as a trigger source.)
 *
 * Everything that wants a sync now registers a trigger and goes through this
 * module, which is responsible for:
 *   - coalescing concurrent requests into one pass,
 *   - rate-limiting bursts,
 *   - rescheduling failed passes with backoff, and cancelling on offline,
 *   - recording why the current pass is running, for the status UI.
 */

import {
  computeBackoffDelay,
  DEFAULT_RETRY_CONFIG,
  type RetryConfig,
} from "./retryPolicy";
import type { SyncEngine } from "./syncEngine";
import type { SyncRunSummary } from "./sync.types";

/** Why a pass was requested. Surfaced for debugging and the status banner. */
export type SyncTriggerReason =
  | "reconnect"
  | "app-foreground"
  | "cache-hydrated"
  | "manual"
  | "retry";

/**
 * Minimum gap between the start of two passes. A foreground event landing
 * moments after a reconnect should not cause a second full fan-out; the OS
 * fires both on the same "user came back with signal" event.
 */
export const MIN_SYNC_INTERVAL_MS = 30_000;

export type SyncCoordinatorDeps = {
  engine: SyncEngine;
  /** Replays offline-queued mutations before reads are treated as truth. */
  resumePausedMutations: () => Promise<unknown>;
  isOnline: () => boolean;
  /** Awaited before the first pass so corrections survive rehydration. */
  waitForHydration?: () => Promise<void>;
  now?: () => number;
  retryConfig?: RetryConfig;
  /** Injected for tests; returns a cancel handle. */
  scheduleTimer?: (fn: () => void, ms: number) => () => void;
  random?: () => number;
};

export type SyncCoordinator = {
  /**
   * Request a pass. Concurrent callers share the in-flight pass rather than
   * queueing a second one.
   */
  requestSync: (reason: SyncTriggerReason, options?: { force?: boolean }) => Promise<SyncRunSummary | null>;
  /** Reason for the pass currently running, or null when idle. */
  currentReason: () => SyncTriggerReason | null;
  /** Cancels any scheduled retry and clears rate-limit state. */
  reset: () => void;
};

const defaultScheduleTimer = (fn: () => void, ms: number) => {
  const handle = setTimeout(fn, ms);
  return () => clearTimeout(handle);
};

const SKIPPED: SyncRunSummary | null = null;

export function createSyncCoordinator(deps: SyncCoordinatorDeps): SyncCoordinator {
  const { engine, resumePausedMutations, isOnline } = deps;
  const now = deps.now ?? Date.now;
  const retryConfig = deps.retryConfig ?? DEFAULT_RETRY_CONFIG;
  const scheduleTimer = deps.scheduleTimer ?? defaultScheduleTimer;
  const random = deps.random ?? Math.random;

  let inFlight: Promise<SyncRunSummary> | null = null;
  let activeReason: SyncTriggerReason | null = null;
  let lastStartedAt: number | null = null;
  let cancelScheduledRetry: (() => void) | null = null;
  let retryAttempt = 0;
  let hydrated = false;

  function clearScheduledRetry(): void {
    cancelScheduledRetry?.();
    cancelScheduledRetry = null;
  }

  /**
   * A pass that ended with errors is retried on a backoff curve rather than
   * waiting for the next reconnect, which previously could be hours away (or
   * never, if the device stayed online throughout the failure).
   */
  function scheduleRetry(): void {
    if (retryAttempt + 1 >= retryConfig.maxAttempts) {
      retryAttempt = 0;
      return;
    }
    retryAttempt += 1;
    const delay = computeBackoffDelay(retryAttempt + 1, retryConfig, random);

    clearScheduledRetry();
    cancelScheduledRetry = scheduleTimer(() => {
      cancelScheduledRetry = null;
      // Retrying while offline burns the budget for nothing; the reconnect
      // trigger will start a fresh pass with a clean attempt count.
      if (!isOnline()) {
        retryAttempt = 0;
        return;
      }
      void requestSync("retry", { force: true });
    }, delay);
  }

  async function runPass(reason: SyncTriggerReason): Promise<SyncRunSummary> {
    activeReason = reason;
    lastStartedAt = now();

    if (!hydrated && deps.waitForHydration) {
      await deps.waitForHydration();
      hydrated = true;
    }

    try {
      await resumePausedMutations();
    } catch {
      // Failed replays stay in React Query's mutation cache; reconciliation
      // should still run so reads are corrected.
    }

    const summary = await engine.runReconciliation();

    if (summary.status === "completed_with_errors") {
      scheduleRetry();
    } else if (summary.status === "completed") {
      retryAttempt = 0;
    }
    // "interrupted_offline" schedules nothing: the reconnect trigger is a
    // better wake-up than a timer, since it fires exactly when useful.

    return summary;
  }

  async function requestSync(
    reason: SyncTriggerReason,
    options: { force?: boolean } = {},
  ): Promise<SyncRunSummary | null> {
    if (inFlight) return inFlight;
    if (!isOnline()) return SKIPPED;

    // Rate limit, unless this is a retry or an explicit user action — a user
    // pulling to refresh deserves an answer, not silence.
    const isExempt = options.force === true || reason === "manual";
    if (
      !isExempt &&
      lastStartedAt !== null &&
      now() - lastStartedAt < MIN_SYNC_INTERVAL_MS
    ) {
      return SKIPPED;
    }

    inFlight = runPass(reason).finally(() => {
      inFlight = null;
      activeReason = null;
    });
    return inFlight;
  }

  return {
    requestSync,
    currentReason: () => activeReason,
    reset: () => {
      clearScheduledRetry();
      inFlight = null;
      activeReason = null;
      lastStartedAt = null;
      retryAttempt = 0;
      hydrated = false;
    },
  };
}
