/**
 * Push Notification Reconciliation Protocol — Types
 *
 * Push notifications are treated as best-effort "wake-up hints." The app MUST
 * perform an authoritative reconciliation fetch against the server rather than
 * trusting push payload content directly. A monotonic per-entity sequence number
 * is used to detect and suppress duplicate / out-of-order / stale wake-ups.
 */

// ---------------------------------------------------------------------------
// Core domain types
// ---------------------------------------------------------------------------

/** Uniquely identifies a role-change scope: one wallet inside one guild. */
export interface EntityKey {
  guildId: string;
  walletAddress: string;
}

/**
 * Payload returned by the server when fetching the current role / membership
 * state for a given entity.  The `roleChangeSeq` field is the **monotonic**
 * version that must be compared against the locally-stored value.
 */
export interface RoleChangeSnapshot {
  guildId: string;
  walletAddress: string;
  /** Monotonic sequence number — strictly increases on every role change. */
  roleChangeSeq: number;
  /** Current set of role identifiers for this entity. */
  roles: string[];
  /** Whether the wallet currently holds an active membership in the guild. */
  membershipActive: boolean;
}

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

/** Serializable shape persisted by the reconciliation Zustand store. */
export interface ReconciliationPersistedState {
  /**
   * Map from a composite key `"{guildId}::{walletAddress}"` to the highest
   * `roleChangeSeq` the client has already seen and applied.
   */
  versions: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Reconciliation result
// ---------------------------------------------------------------------------

/**
 * Outcome of a single reconciliation attempt.
 *
 * Consumers (e.g. UI / notification layers) use this to decide whether to
 * show a user-facing alert and / or update displayed data.
 */
export interface ReconciliationResult {
  entityKey: EntityKey;
  /** The sequence number that was stored locally *before* reconciliation. */
  previousSeq: number;
  /** The sequence number returned by the authoritative server fetch. */
  fetchedSeq: number;
  /** True when the fetched data is newer than what we already have. */
  isUpdate: boolean;
  /** True when `fetchedSeq` is strictly less than `previousSeq` (out-of-order). */
  isStale: boolean;
  /** True when `fetchedSeq` equals `previousSeq` (duplicate wake-up). */
  isDuplicate: boolean;
  /** The full snapshot from the server — valid even when isUpdate is false. */
  snapshot: RoleChangeSnapshot | null;
}

// ---------------------------------------------------------------------------
// Push wake-up hint (what the transport delivers)
// ---------------------------------------------------------------------------

/**
 * Minimal payload that arrives via a push notification.  The only fields the
 * client trusts are the entity identifiers — everything else MUST be verified
 * through the authoritative reconciliation fetch.
 */
export interface PushWakeUpHint {
  guildId: string;
  walletAddress: string;
}

// ---------------------------------------------------------------------------
// Event callbacks
// ---------------------------------------------------------------------------

/**
 * Callback invoked when reconciliation detects a genuine, non-stale,
 * non-duplicate role change that the UI / notification layer should surface.
 */
export type OnRoleChangeApplied = (result: ReconciliationResult) => void;
