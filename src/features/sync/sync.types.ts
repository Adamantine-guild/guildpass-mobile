/**
 * Sync engine domain types (Issue #108).
 *
 * The sync engine reconciles locally-cached entities against authoritative
 * server state when connectivity returns. Role/membership data is
 * server-authoritative: the server value always wins, and meaningful
 * divergences are surfaced to the user as "corrections" instead of being
 * silently overwritten.
 */

/**
 * Entity families the reconciliation pass covers.
 *
 * This list is deliberately NOT derived from the offline-cache allowlist
 * (Issue #225). Being persisted and being reconcilable are different
 * properties, and conflating them was a live defect: `PersistableQueryKeyRoot`
 * also contains "memberships", "profile" and "user-profile", for which no
 * fetcher exists or can exist —
 *
 *   - "memberships" is a client-side aggregate, not a server entity;
 *   - "profile"/"user-profile" have no query key in use anywhere.
 *
 * Because the engine dispatches via `fetchers[descriptor.kind]`, a cached
 * ["memberships", wallet] entry (written by the guilds and profile screens)
 * resolved to `undefined` and threw, failing every pass after those screens
 * were visited. Enumerating the kinds explicitly keeps the fetcher map
 * exhaustive by construction, and leaves the persistence allowlist alone:
 * those three roots are still cached and still persisted, they are simply
 * not reconciled.
 */
export type SyncEntityKind =
  | "membership"
  | "user-roles"
  | "guild"
  | "guild-config"
  | "guild-roles";

/** A single cached entity instance, parsed from its React Query key. */
export type SyncEntityDescriptor = {
  kind: SyncEntityKind;
  queryKey: readonly unknown[];
  guildId: string;
  /** null for guild-scoped entities that are not tied to a wallet. */
  walletAddress: string | null;
};

export type SyncCorrectionType =
  | "membership_revoked"
  | "membership_restored"
  | "roles_removed"
  | "roles_added"
  | "guild_deactivated"
  | "access_policy_changed";

/**
 * critical – local state overstated the user's access (e.g. a cached
 *            "granted"/active status the server has since revoked).
 * info     – local state changed in a way worth mentioning but that does not
 *            risk the user acting on inflated permissions.
 */
export type SyncCorrectionSeverity = "critical" | "info";

export type SyncCorrection = {
  /**
   * Deterministic per entity+type so re-detecting the same divergence
   * replaces the previous notice instead of stacking duplicates.
   */
  id: string;
  type: SyncCorrectionType;
  severity: SyncCorrectionSeverity;
  entityKind: SyncEntityKind;
  guildId: string;
  walletAddress: string | null;
  message: string;
  detectedAt: string; // ISO timestamp
};

/** Per-entity sync metadata, keyed by serialized query key. */
export type SyncEntityMeta = {
  /** Last time this entity was confirmed against the server (epoch ms). */
  lastSyncedAt: number;
  /** Content-derived version of the last server-confirmed value. */
  version: string;
};

export type SyncStatus = "idle" | "syncing" | "error";

export type SyncRunError = {
  queryKey: readonly unknown[];
  message: string;
};

export type SyncRunSummary = {
  /**
   * "interrupted_offline" means connectivity was lost part-way: entities that
   * did reconcile are committed, the rest are simply left for the next pass.
   * Distinct from "completed_with_errors", where the server was reachable and
   * genuinely rejected or failed the request.
   */
  status:
    | "completed"
    | "completed_with_errors"
    | "interrupted_offline"
    | "skipped_offline";
  startedAt: number;
  finishedAt: number;
  entitiesChecked: number;
  /** Entities whose server value differed from the cached value. */
  entitiesUpdated: number;
  corrections: SyncCorrection[];
  errors: SyncRunError[];
};
