/**
 * Sync manager — app wiring for the sync coordinator (Issues #108, #225).
 *
 * Originally (#108) this owned the reconnect listener, the debounce and the
 * sync call directly. Under #225 all scheduling policy moved to
 * syncCoordinator, and this module is reduced to composition: build the
 * engine, build the coordinator, register the trigger sources, and expose the
 * same `initSyncManager` / `triggerSync` surface app/_layout.tsx already uses.
 */

import { useNetworkStore } from "../network/connectivityService";
import { queryClient as appQueryClient } from "../../lib/queryClient";
import { createSyncEngine, type SyncEngine } from "./syncEngine";
import { createSyncCoordinator, type SyncCoordinator } from "./syncCoordinator";
import { registerForegroundTrigger, registerReconnectTrigger, type TriggerHandle } from "./syncTriggers";
import { defaultSyncFetchers } from "./syncFetchers";
import { useSyncStore } from "./sync.store";

export { SYNC_RECONNECT_DEBOUNCE_MS } from "./syncTriggers";

type SyncManagerOptions = {
  engine?: SyncEngine;
  coordinator?: SyncCoordinator;
  queryClient?: Pick<typeof appQueryClient, "resumePausedMutations">;
  debounceMs?: number;
};

let isInitialized = false;
let activeCoordinator: SyncCoordinator | null = null;
let triggerHandles: TriggerHandle[] = [];

function getDefaultEngine(): SyncEngine {
  return createSyncEngine({
    queryClient: appQueryClient,
    fetchers: defaultSyncFetchers,
    syncStore: useSyncStore,
    isOnline: () => useNetworkStore.getState().isOnline,
  });
}

/**
 * Zustand persist rehydration replaces the persisted keys (corrections,
 * entityMeta) wholesale when it completes, so corrections written before
 * hydration finishes would be silently dropped. Never sync ahead of it.
 */
async function waitForSyncStoreHydration(): Promise<void> {
  if (useSyncStore.persist.hasHydrated()) return;
  // Re-running hydration (rather than waiting on onFinishHydration) resolves
  // even when the storage read fails — a broken read must not disable the
  // sync engine forever.
  await useSyncStore.persist.rehydrate();
}

/**
 * Requests a reconciliation pass. Retained for app/_layout.tsx, which calls it
 * once the persisted cache has been restored.
 */
export async function triggerSync(): Promise<void> {
  if (!activeCoordinator) return;
  await activeCoordinator.requestSync("cache-hydrated", { force: true });
}

export function initSyncManager(options: SyncManagerOptions = {}): void {
  if (isInitialized) return;
  isInitialized = true;

  const queryClient = options.queryClient ?? appQueryClient;
  const coordinator =
    options.coordinator ??
    createSyncCoordinator({
      engine: options.engine ?? getDefaultEngine(),
      resumePausedMutations: () => queryClient.resumePausedMutations(),
      isOnline: () => useNetworkStore.getState().isOnline,
      waitForHydration: waitForSyncStoreHydration,
    });

  activeCoordinator = coordinator;
  triggerHandles = [
    registerReconnectTrigger({ coordinator, debounceMs: options.debounceMs }),
    registerForegroundTrigger({ coordinator }),
  ];
}

export function getSyncCoordinator(): SyncCoordinator | null {
  return activeCoordinator;
}

export function resetSyncManagerForTest(): void {
  triggerHandles.forEach((release) => release());
  triggerHandles = [];
  activeCoordinator?.reset();
  activeCoordinator = null;
  isInitialized = false;
}
