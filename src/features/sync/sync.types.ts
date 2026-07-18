/**
 * Sync engine domain types (Issue #108).
 *
 * The sync engine reconciles locally-cached entities against authoritative
 * server state when connectivity returns. Role/membership data is
 * server-authoritative: the server value always wins, and meaningful
 * divergences are surfaced to the user as "corrections" instead of being
 * silently overwritten.
 */

import type { PersistableQueryKeyRoot } from "../../lib/offlineCache";

/**
 * Entity families the reconciliation pass covers: every persistable query
 * namespace except "access-check", which is a mutation namespace. Derived
 * from the offline-cache allowlist so adding a new persisted namespace
 * forces this module (fetchers, diffing) to handle it at compile time.
 */
export type SyncEntityKind = Exclude<PersistableQueryKeyRoot, "access-check">;

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
  status: "completed" | "completed_with_errors" | "skipped_offline";
  startedAt: number;
  finishedAt: number;
  entitiesChecked: number;
  /** Entities whose server value differed from the cached value. */
  entitiesUpdated: number;
  corrections: SyncCorrection[];
  errors: SyncRunError[];
};
