/**
 * Scheduling policy for the reconciliation pass (Issue #225).
 *
 * Before this, `collectDescriptors()` handed the concurrency pool whatever
 * order `queryCache.getAll()` happened to yield — effectively FIFO over cache
 * insertion order. With a 5-slot pool and a slow link, that meant a guild
 * banner could occupy a slot while a revoked membership waited behind it.
 *
 * Ordering here is a security property, not a nicety: `membership` and
 * `user-roles` are what the access-gating paths read, so a correction to them
 * (revoked access, removed role) must land before cosmetic guild metadata is
 * refreshed. Within a tier we go most-stale-first, using the lastSyncedAt
 * already persisted in sync.store — an entity confirmed 8 hours ago is more
 * likely to be wrong than one confirmed 30 seconds ago.
 */

import type { SyncEntityDescriptor, SyncEntityKind, SyncEntityMeta } from "./sync.types";

/** Lower number = dispatched first. */
export type SyncPriorityTier = 1 | 2;

const PRIORITY_BY_KIND: Record<SyncEntityKind, SyncPriorityTier> = {
  // Tier 1 — gates access. A stale value here overstates the user's rights.
  membership: 1,
  "user-roles": 1,
  // Tier 2 — display metadata. Wrong is untidy, not unsafe.
  guild: 2,
  "guild-config": 2,
  "guild-roles": 2,
};

export function priorityOf(kind: SyncEntityKind): SyncPriorityTier {
  return PRIORITY_BY_KIND[kind];
}

export type PrioritizeDeps = {
  /** Keyed by serialized query key, as stored in sync.store. */
  entityMeta: Record<string, SyncEntityMeta>;
  serializeQueryKey: (queryKey: readonly unknown[]) => string;
};

/**
 * Returns a new array ordered by (tier asc, lastSyncedAt asc). Entities never
 * synced before sort first within their tier — they have no confirmed value
 * at all. Stable for equal keys, so ordering is deterministic in tests.
 */
export function prioritizeDescriptors(
  descriptors: readonly SyncEntityDescriptor[],
  deps: PrioritizeDeps,
): SyncEntityDescriptor[] {
  const { entityMeta, serializeQueryKey } = deps;

  const lastSyncedAt = (descriptor: SyncEntityDescriptor): number => {
    const meta = entityMeta[serializeQueryKey(descriptor.queryKey)];
    return meta ? meta.lastSyncedAt : Number.NEGATIVE_INFINITY;
  };

  return descriptors
    .map((descriptor, index) => ({ descriptor, index }))
    .sort((a, b) => {
      const tierDelta = priorityOf(a.descriptor.kind) - priorityOf(b.descriptor.kind);
      if (tierDelta !== 0) return tierDelta;

      const stalenessDelta = lastSyncedAt(a.descriptor) - lastSyncedAt(b.descriptor);
      if (stalenessDelta !== 0) return stalenessDelta;

      return a.index - b.index;
    })
    .map((entry) => entry.descriptor);
}
