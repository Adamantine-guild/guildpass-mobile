export const PERSISTED_QUERY_CACHE_KEY = "GUILDPASS_QUERY_CACHE";

export const QUERY_STALE_TIME_MS = 1000 * 60 * 5;
export const QUERY_GC_TIME_MS = 1000 * 60 * 60 * 24 * 7;
export const MAX_CACHE_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days max age
export const MAX_CACHE_SIZE_BYTES = 500 * 1024; // 500 KB max size

export const PERSISTABLE_QUERY_KEY_ROOTS = [
  "membership",
  "memberships",
  "user-roles",
  "guild",
  "guild-config",
  "guild-roles",
  "access-check",
  "profile",
  "user-profile",
] as const;

export type PersistableQueryKeyRoot = (typeof PERSISTABLE_QUERY_KEY_ROOTS)[number];

export function isPersistableQuery(queryKey: readonly unknown[]): boolean {
  const root = queryKey[0];
  return (
    typeof root === "string" &&
    PERSISTABLE_QUERY_KEY_ROOTS.includes(root as PersistableQueryKeyRoot)
  );
}

export function formatLastSyncedAt(timestamp: number | undefined): string | null {
  if (!timestamp) {
    return null;
  }

  return new Date(timestamp).toLocaleString();
}

