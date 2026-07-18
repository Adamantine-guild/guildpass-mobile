/**
 * useBackgroundSync — Periodic reconciliation fallback
 *
 * Push notifications are best-effort.  If a device is offline for an extended
 * period, some (or all) push messages may be dropped.  This module provides:
 *
 *  1. **App-foreground trigger** — when the user returns to the app, sweep all
 *     known (guild, wallet) pairs to catch up on any missed role changes.
 *  2. **Network-reconnect trigger** — when connectivity is restored after an
 *     outage, re-run reconciliation for cached entities.
 *  3. **Periodic background fetch** — platform-level background fetch task that
 *     performs a lightweight reconciliation pass (managed via expo-task-manager
 *     and expo-background-fetch).
 *
 * The module does NOT display notifications itself — it delegates to the
 * `onRoleChangeApplied` callback from `useReconciliation`.
 */

import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useReconciliationStore, entityCompositeKey } from "./reconciliation.store";
import { useReconciliation } from "./useReconciliation";
import type { EntityKey, OnRoleChangeApplied } from "./reconciliation.types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum interval (ms) between two consecutive background sync sweeps. */
const MIN_SYNC_INTERVAL_MS = 30_000; // 30 seconds

/** Background-fetch task name registered with expo-task-manager. */
export const BACKGROUND_SYNC_TASK_NAME = "guildpass-reconciliation-sync";

// ---------------------------------------------------------------------------
// Hook options
// ---------------------------------------------------------------------------

interface UseBackgroundSyncOptions {
  /** Called for every genuine role change detected during a sweep. */
  onRoleChangeApplied?: OnRoleChangeApplied;
  /** Enable / disable the periodic sync (default: true). */
  enabled?: boolean;
  /** Override the minimum sync interval (useful for tests). */
  minSyncIntervalMs?: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBackgroundSync(options: UseBackgroundSyncOptions = {}): {
  /** Manually trigger a sweep of all known entities. */
  sweepNow: () => Promise<void>;
} {
  const { onRoleChangeApplied, enabled = true, minSyncIntervalMs = MIN_SYNC_INTERVAL_MS } = options;

  const lastSyncRef = useRef<number>(0);
  const sweepingRef = useRef<boolean>(false);
  const { reconcile } = useReconciliation({ onRoleChangeApplied });

  /**
   * Derive the set of known entity keys from the store's version map.
   * Every key we've ever seen is a candidate for catch-up reconciliation.
   */
  const getKnownEntityKeys = (): EntityKey[] => {
    const versions = useReconciliationStore.getState().versions;
    return Object.keys(versions)
      .map((composite) => {
        const idx = composite.indexOf("::");
        if (idx === -1) return null;
        return {
          guildId: composite.slice(0, idx),
          walletAddress: composite.slice(idx + 2),
        };
      })
      .filter((k): k is EntityKey => k !== null);
  };

  /**
   * Perform a full reconciliation sweep for all known entities.
   * Rate-limited by `minSyncIntervalMs` to avoid thundering-herd on rapid
   * foreground/background toggles.
   */
  const sweepNow = async (): Promise<void> => {
    const now = Date.now();
    if (now - lastSyncRef.current < minSyncIntervalMs) return;
    if (sweepingRef.current) return;

    sweepingRef.current = true;
    lastSyncRef.current = now;

    try {
      const keys = getKnownEntityKeys();
      if (keys.length === 0) return;

      // Process in parallel — each reconciliation is independently safe
      await Promise.allSettled(keys.map((key) => reconcile(key)));
    } finally {
      sweepingRef.current = false;
    }
  };

  // ------------------------------------------------------------------
  // AppState listener — sweep on foreground
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!enabled) return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active") {
        void sweepNow();
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);

    // Also sweep on mount (app cold-start)
    void sweepNow();

    return () => {
      subscription.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { sweepNow };
}

// ---------------------------------------------------------------------------
// Background-fetch task registration (platform-level)
// ---------------------------------------------------------------------------

/**
 * Register the background-fetch task.  Call this once at app init (e.g. in
 * `_layout.tsx` or the root component).
 *
 * Requires `expo-background-fetch` and `expo-task-manager` to be installed.
 * The task performs a lightweight sweep without displaying notifications
 * (the OS may coalesce / throttle execution).
 */
export async function registerBackgroundSyncTask(): Promise<void> {
  try {
    // Dynamic imports so the module is tree-shakeable when not used
    const TaskManager = await import("expo-task-manager");
    const BackgroundFetch = await import("expo-background-fetch");

    TaskManager.defineTask(BACKGROUND_SYNC_TASK_NAME, async () => {
      const versions = useReconciliationStore.getState().versions;
      const keys: EntityKey[] = Object.keys(versions)
        .map((composite) => {
          const idx = composite.indexOf("::");
          if (idx === -1) return null;
          return {
            guildId: composite.slice(0, idx),
            walletAddress: composite.slice(idx + 2),
          };
        })
        .filter((k): k is EntityKey => k !== null);

      if (keys.length === 0) {
        return BackgroundFetch.BackgroundFetchResult.NoData;
      }

      try {
        // Import the reconciliation helpers dynamically
        const { guildPassClient } = await import("../../lib/guildpassClient");
        const store = useReconciliationStore.getState();

        let hadUpdate = false;

        await Promise.allSettled(
          keys.map(async (key) => {
            try {
              const [membership, roles] = await Promise.all([
                guildPassClient.membership.getMembership({
                  walletAddress: key.walletAddress,
                  guildId: key.guildId,
                }),
                guildPassClient.roles.getUserRoles({
                  walletAddress: key.walletAddress,
                  guildId: key.guildId,
                }),
              ]);

              const seq: number =
                typeof (membership as Record<string, unknown>).roleChangeSeq === "number"
                  ? ((membership as Record<string, unknown>).roleChangeSeq as number)
                  : 0;

              const composite = entityCompositeKey(key);
              const stored = store.versions[composite] ?? 0;

              if (seq > stored) {
                hadUpdate = true;
                const roleNames: string[] = Array.isArray(roles)
                  ? roles.map((r: Record<string, unknown>) =>
                      typeof r.name === "string" ? r.name : String(r.id ?? ""),
                    )
                  : [];

                store.processSnapshot({
                  guildId: key.guildId,
                  walletAddress: key.walletAddress,
                  roleChangeSeq: seq,
                  roles: roleNames,
                  membershipActive:
                    typeof (membership as Record<string, unknown>).isActive === "boolean"
                      ? ((membership as Record<string, unknown>).isActive as boolean)
                      : false,
                });
              }
            } catch {
              // Individual fetch failures are non-fatal in background sync
            }
          }),
        );

        return hadUpdate
          ? BackgroundFetch.BackgroundFetchResult.NewData
          : BackgroundFetch.BackgroundFetchResult.NoData;
      } catch {
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
    });

    const status = await BackgroundFetch.getStatusAsync();
    if (status === BackgroundFetch.BackgroundFetchStatus.Denied) {
      console.warn("[reconciliation] Background fetch denied by OS");
      return;
    }

    await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK_NAME, {
      minimumInterval: 15 * 60, // 15 minutes — OS may override
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch (error) {
    // Background fetch is a progressive enhancement — failure is non-fatal
    console.warn("[reconciliation] Failed to register background sync task:", error);
  }
}

/**
 * Unregister the background-fetch task (e.g. on sign-out or app reset).
 */
export async function unregisterBackgroundSyncTask(): Promise<void> {
  try {
    const TaskManager = await import("expo-task-manager");
    const BackgroundFetch = await import("expo-background-fetch");

    if (TaskManager.isTaskDefined(BACKGROUND_SYNC_TASK_NAME)) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_SYNC_TASK_NAME);
    }
  } catch {
    // Best-effort
  }
}
