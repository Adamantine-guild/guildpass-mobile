/**
 * Reconciliation Store — Zustand + AsyncStorage persistence
 *
 * Tracks the highest `roleChangeSeq` the client has processed for each
 * (guildId, walletAddress) pair.  The store is the authoritative local
 * source-of-truth against which every reconciliation fetch is compared.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  EntityKey,
  ReconciliationPersistedState,
  ReconciliationResult,
  RoleChangeSnapshot,
} from "./reconciliation.types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "guildpass:reconciliation:v1";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a deterministic composite key from an entity pair. */
export function entityCompositeKey(key: EntityKey): string {
  return `${key.guildId}::${key.walletAddress.toLowerCase()}`;
}

/** Parse a composite key back into its parts (inverse of entityCompositeKey). */
export function parseEntityCompositeKey(composite: string): EntityKey | null {
  const idx = composite.indexOf("::");
  if (idx === -1) return null;
  return {
    guildId: composite.slice(0, idx),
    walletAddress: composite.slice(idx + 2),
  };
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface ReconciliationStore extends ReconciliationPersistedState {
  _hasHydrated: boolean;

  /** Mark hydration complete so consumers can guard against SSR / startup races. */
  setHasHydrated: (state: boolean) => void;

  /**
   * Process a server snapshot and produce a ReconciliationResult.
   *
   * - Updates the stored version ONLY when the fetched seq is newer.
   * - Never regresses the stored version (monotonic guarantee).
   */
  processSnapshot: (snapshot: RoleChangeSnapshot) => ReconciliationResult;

  /**
   * Check whether a given entity has already seen this sequence number
   * (or higher) — used to short-circuit before performing a full fetch.
   */
  isAlreadyProcessed: (key: EntityKey, seq: number) => boolean;

  /** Return the highest seq stored for an entity (0 if never seen). */
  getVersion: (key: EntityKey) => number;

  /** Bulk-load versions (e.g. after a background catch-up fetch). */
  setVersion: (key: EntityKey, seq: number) => void;

  /** Remove all tracked versions for a wallet (e.g. on sign-out). */
  clearWallet: (walletAddress: string) => void;

  /** Remove all tracked versions (e.g. full app reset). */
  clearAll: () => void;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useReconciliationStore = create<ReconciliationStore>()(
  persist(
    (set, get) => ({
      versions: {},
      _hasHydrated: false,

      setHasHydrated: (state) => set({ _hasHydrated: state }),

      processSnapshot: (snapshot) => {
        const key: EntityKey = {
          guildId: snapshot.guildId,
          walletAddress: snapshot.walletAddress,
        };
        const composite = entityCompositeKey(key);
        const previousSeq = get().versions[composite] ?? 0;
        const fetchedSeq = snapshot.roleChangeSeq;

        const isDuplicate = fetchedSeq === previousSeq;
        const isStale = fetchedSeq < previousSeq;
        const isUpdate = fetchedSeq > previousSeq;

        const result: ReconciliationResult = {
          entityKey: key,
          previousSeq,
          fetchedSeq,
          isUpdate,
          isStale,
          isDuplicate,
          snapshot,
        };

        // Only update stored version when we have genuinely newer data.
        // This guarantees monotonicity — we NEVER regress.
        if (isUpdate) {
          set((state) => ({
            versions: { ...state.versions, [composite]: fetchedSeq },
          }));
        }

        return result;
      },

      isAlreadyProcessed: (key, seq) => {
        const composite = entityCompositeKey(key);
        const stored = get().versions[composite] ?? 0;
        return seq <= stored;
      },

      getVersion: (key) => {
        const composite = entityCompositeKey(key);
        return get().versions[composite] ?? 0;
      },

      setVersion: (key, seq) => {
        const composite = entityCompositeKey(key);
        const current = get().versions[composite] ?? 0;
        // Monotonic guard — never decrease
        if (seq > current) {
          set((state) => ({
            versions: { ...state.versions, [composite]: seq },
          }));
        }
      },

      clearWallet: (walletAddress) => {
        const normalized = walletAddress.toLowerCase();
        set((state) => {
          const next: Record<string, number> = {};
          for (const [composite, seq] of Object.entries(state.versions)) {
            if (!composite.endsWith(`::${normalized}`)) {
              next[composite] = seq;
            }
          }
          return { versions: next };
        });
      },

      clearAll: () => set({ versions: {} }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ versions: state.versions }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
