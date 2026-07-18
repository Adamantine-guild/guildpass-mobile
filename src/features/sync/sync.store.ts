/**
 * Sync store (Issue #108).
 *
 * Holds the sync engine's runtime status plus the two pieces of state that
 * must survive restarts:
 *   - per-entity sync metadata (lastSyncedAt / content version)
 *   - unacknowledged corrections, so a user who reopens the app still sees
 *     that their cached state was corrected while they were offline.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { asyncStorage } from "../../lib/storage";
import type {
  SyncCorrection,
  SyncEntityMeta,
  SyncStatus,
} from "./sync.types";

export const MAX_TRACKED_CORRECTIONS = 20;

export interface SyncStoreState {
  status: SyncStatus;
  lastSyncStartedAt: number | null;
  lastSyncCompletedAt: number | null;
  lastSyncError: string | null;
  /** Keyed by serialized query key (see serializeQueryKey in syncEngine). */
  entityMeta: Record<string, SyncEntityMeta>;
  /** Unacknowledged corrections, newest first. */
  corrections: SyncCorrection[];
  _hasHydrated: boolean;
  setHasHydrated: (hydrated: boolean) => void;
  beginSync: (startedAt: number) => void;
  completeSync: (finishedAt: number) => void;
  failSync: (message: string, finishedAt: number) => void;
  /** Batched so a pass over N entities costs one persisted store write. */
  recordEntityMetaBatch: (entries: Record<string, SyncEntityMeta>) => void;
  addCorrections: (corrections: SyncCorrection[]) => void;
  acknowledgeCorrection: (id: string) => void;
  acknowledgeAllCorrections: () => void;
  clearSyncState: () => void;
}

export const useSyncStore = create<SyncStoreState>()(
  persist(
    (set) => ({
      status: "idle",
      lastSyncStartedAt: null,
      lastSyncCompletedAt: null,
      lastSyncError: null,
      entityMeta: {},
      corrections: [],
      _hasHydrated: false,
      setHasHydrated: (hydrated) => set({ _hasHydrated: hydrated }),
      beginSync: (startedAt) =>
        set({ status: "syncing", lastSyncStartedAt: startedAt, lastSyncError: null }),
      completeSync: (finishedAt) =>
        set({ status: "idle", lastSyncCompletedAt: finishedAt, lastSyncError: null }),
      failSync: (message, finishedAt) =>
        set({ status: "error", lastSyncCompletedAt: finishedAt, lastSyncError: message }),
      recordEntityMetaBatch: (entries) =>
        set((state) => ({ entityMeta: { ...state.entityMeta, ...entries } })),
      addCorrections: (incoming) =>
        set((state) => {
          if (incoming.length === 0) return state;
          const incomingIds = new Set(incoming.map((c) => c.id));
          // Re-detected divergences replace their previous notice instead of
          // stacking duplicates; keep newest first.
          const merged = [
            ...incoming,
            ...state.corrections.filter((c) => !incomingIds.has(c.id)),
          ];
          if (merged.length <= MAX_TRACKED_CORRECTIONS) {
            return { corrections: merged };
          }
          // Over the cap, evict informational notices before critical ones so
          // a burst of info updates can never push out a revoked-access alert.
          const keep = new Set<string>();
          let remaining = MAX_TRACKED_CORRECTIONS;
          for (const correction of merged) {
            if (correction.severity === "critical" && remaining > 0) {
              keep.add(correction.id);
              remaining -= 1;
            }
          }
          for (const correction of merged) {
            if (remaining <= 0) break;
            if (!keep.has(correction.id)) {
              keep.add(correction.id);
              remaining -= 1;
            }
          }
          return { corrections: merged.filter((c) => keep.has(c.id)) };
        }),
      acknowledgeCorrection: (id) =>
        set((state) => ({ corrections: state.corrections.filter((c) => c.id !== id) })),
      acknowledgeAllCorrections: () => set({ corrections: [] }),
      clearSyncState: () =>
        set({
          status: "idle",
          lastSyncStartedAt: null,
          lastSyncCompletedAt: null,
          lastSyncError: null,
          entityMeta: {},
          corrections: [],
        }),
    }),
    {
      name: "sync-storage",
      storage: createJSONStorage(() => asyncStorage),
      partialize: (state) => ({
        entityMeta: state.entityMeta,
        corrections: state.corrections,
        lastSyncCompletedAt: state.lastSyncCompletedAt,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
