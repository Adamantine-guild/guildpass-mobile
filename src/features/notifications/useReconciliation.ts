/**
 * useReconciliation — Authoritative reconciliation hook
 *
 * The single entry-point for processing push notification "wake-up hints."
 * Consumers (push handlers, foreground-lifecycle listeners) call `reconcile()`
 * which:
 *
 *  1. Fetches the true current role/membership state from the server.
 *  2. Compares the returned `roleChangeSeq` against the locally-stored value.
 *  3. Returns a ReconciliationResult that signals whether this is a genuine
 *     update, a stale/out-of-order delivery, or a duplicate.
 *
 * Push payload content is NEVER trusted directly — this hook always performs
 * the authoritative server round-trip.
 */

import { useCallback } from "react";
import { guildPassClient } from "../../lib/guildpassClient";
import { useReconciliationStore } from "./reconciliation.store";
import type {
  EntityKey,
  OnRoleChangeApplied,
  PushWakeUpHint,
  ReconciliationResult,
  RoleChangeSnapshot,
} from "./reconciliation.types";

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseReconciliationOptions {
  /** Called when a genuine, non-stale, non-duplicate change is detected. */
  onRoleChangeApplied?: OnRoleChangeApplied;
}

interface UseReconciliationReturn {
  /**
   * Process a push wake-up hint: fetch authoritative state, compare versions,
   * and return a reconciliation result.
   *
   * This is the core protocol method — call it from:
   *  - Push notification handlers (foreground & background)
   *  - App-foreground lifecycle events
   *  - Manual "pull to refresh" / retry flows
   */
  reconcile: (hint: PushWakeUpHint) => Promise<ReconciliationResult>;

  /**
   * Reconcile multiple entities in bulk (e.g. background catch-up sweep).
   * Returns results in the same order as input keys.
   */
  reconcileBulk: (keys: EntityKey[]) => Promise<ReconciliationResult[]>;

  /** Expose the store for direct read access (e.g. UI badge states). */
  store: typeof useReconciliationStore;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Fetch the authoritative role-change snapshot from the server for a single
 * entity.  This is the ONLY place the client fetches role state for
 * reconciliation purposes.
 */
async function fetchRoleSnapshot(key: EntityKey): Promise<RoleChangeSnapshot> {
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

  // Derive roleChangeSeq from the membership object if the SDK provides it;
  // otherwise, fall back to using timestamps or a hash.  The SDK contract
  // should be extended to return this field — for now we defensively extract
  // what we can and default to 0 (which forces the first fetch to always
  // be treated as an update).
  const roleChangeSeq: number =
    typeof (membership as Record<string, unknown>).roleChangeSeq === "number"
      ? ((membership as Record<string, unknown>).roleChangeSeq as number)
      : typeof (membership as Record<string, unknown>).updatedAt === "number"
        ? ((membership as Record<string, unknown>).updatedAt as number)
        : 0;

  const roleNames: string[] = Array.isArray(roles)
    ? roles.map((r: Record<string, unknown>) =>
        typeof r.name === "string" ? r.name : String(r.id ?? ""),
      )
    : [];

  return {
    guildId: key.guildId,
    walletAddress: key.walletAddress,
    roleChangeSeq,
    roles: roleNames,
    membershipActive:
      typeof (membership as Record<string, unknown>).isActive === "boolean"
        ? ((membership as Record<string, unknown>).isActive as boolean)
        : false,
  };
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export function useReconciliation(
  options: UseReconciliationOptions = {},
): UseReconciliationReturn {
  const store = useReconciliationStore;
  const { onRoleChangeApplied } = options;

  const reconcile = useCallback(
    async (hint: PushWakeUpHint): Promise<ReconciliationResult> => {
      const key: EntityKey = {
        guildId: hint.guildId,
        walletAddress: hint.walletAddress,
      };

      // 1. Fetch authoritative state from the server
      let snapshot: RoleChangeSnapshot;
      try {
        snapshot = await fetchRoleSnapshot(key);
      } catch {
        // Fetch failed — return a result indicating no change could be confirmed
        return {
          entityKey: key,
          previousSeq: store.getState().getVersion(key),
          fetchedSeq: -1,
          isUpdate: false,
          isStale: false,
          isDuplicate: false,
          snapshot: null,
        };
      }

      // 2. Process through the store (monotonic comparison + persistence)
      const result = store.getState().processSnapshot(snapshot);

      // 3. Fire callback only for genuine updates
      if (result.isUpdate && onRoleChangeApplied) {
        onRoleChangeApplied(result);
      }

      return result;
    },
    [store, onRoleChangeApplied],
  );

  const reconcileBulk = useCallback(
    async (keys: EntityKey[]): Promise<ReconciliationResult[]> => {
      return Promise.all(keys.map((key) => reconcile(key)));
    },
    [reconcile],
  );

  return {
    reconcile,
    reconcileBulk,
    store,
  };
}
