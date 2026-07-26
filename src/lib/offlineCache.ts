import { PERSISTABLE_QUERY_ROOTS, isPersistableQuery as _isPersistableQuery } from "./queryKeys";

export const PERSISTED_QUERY_CACHE_KEY = "GUILDPASS_QUERY_CACHE";

export const QUERY_STALE_TIME_MS = 1000 * 60 * 5;
export const QUERY_GC_TIME_MS = 1000 * 60 * 60 * 24 * 7;
export const MAX_CACHE_AGE_MS = 1000 * 60 * 60 * 24 * 7;
export const MAX_CACHE_SIZE_BYTES = 500 * 1024;

export { PERSISTABLE_QUERY_ROOTS as PERSISTABLE_QUERY_KEY_ROOTS };

export type PersistableQueryKeyRoot = (typeof PERSISTABLE_QUERY_ROOTS)[number];

export { _isPersistableQuery as isPersistableQuery };

export function formatLastSyncedAt(timestamp: number | undefined): string | null {
  if (!timestamp) {
    return null;
  }

  return new Date(timestamp).toLocaleString();
}
