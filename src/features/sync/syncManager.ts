/**
 * Sync manager (Issue #108).
 *
 * Wires the sync engine to the app: watches the network store (fed by NetInfo
 * via connectivityService) and, when the device transitions offline → online,
 * first replays any mutations React Query paused while offline, then runs the
 * reconciliation pass. Reconnect events are debounced because NetInfo can
 * flap during connectivity changes.
 */

import { useNetworkStore } from "../network/connectivityService";
import { queryClient as appQueryClient } from "../../lib/queryClient";
import { createSyncEngine, type SyncEngine } from "./syncEngine";
import { defaultSyncFetchers } from "./syncFetchers";
import { useSyncStore } from "./sync.store";

export const SYNC_RECONNECT_DEBOUNCE_MS = 2000;

type SyncManagerOptions = {
  engine?: SyncEngine;
  queryClient?: Pick<typeof appQueryClient, "resumePausedMutations">;
  debounceMs?: number;
};

let isInitialized = false;
let unsubscribe: (() => void) | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let activeEngine: SyncEngine | null = null;
let activeQueryClient: Pick<typeof appQueryClient, "resumePausedMutations"> | null = null;

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
 * Replays offline-queued mutations before reconciling reads, so local writes
 * reach the server before we treat its state as authoritative.
 */
export async function triggerSync(): Promise<void> {
  if (!activeEngine || !activeQueryClient) return;
  await waitForSyncStoreHydration();
  try {
    await activeQueryClient.resumePausedMutations();
  } catch {
    // Failed replays stay in React Query's mutation cache; reconciliation
    // should still run so reads are corrected.
  }
  await activeEngine.runReconciliation();
}

export function initSyncManager(options: SyncManagerOptions = {}): void {
  if (isInitialized) return;
  isInitialized = true;

  activeEngine = options.engine ?? getDefaultEngine();
  activeQueryClient = options.queryClient ?? appQueryClient;
  const debounceMs = options.debounceMs ?? SYNC_RECONNECT_DEBOUNCE_MS;

  let wasOnline = useNetworkStore.getState().isOnline;

  unsubscribe = useNetworkStore.subscribe((state) => {
    const cameBackOnline = state.isOnline && !wasOnline;
    wasOnline = state.isOnline;
    if (!cameBackOnline) return;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void triggerSync();
    }, debounceMs);
  });
}

export function resetSyncManagerForTest(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  unsubscribe?.();
  unsubscribe = null;
  activeEngine = null;
  activeQueryClient = null;
  isInitialized = false;
}
