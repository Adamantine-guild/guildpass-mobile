export type StaleReason = "offline" | "expired";

export type StaleQueryInput = {
  data?: unknown;
  dataUpdatedAt?: number;
  isStale?: boolean;
};

export type StaleQueryState = {
  isStale: boolean;
  reason: StaleReason | null;
  lastSyncedAt: Date | null;
  isOffline: boolean;
};

export function getStaleQueryState(query: StaleQueryInput, isOffline: boolean): StaleQueryState {
  const hasData = query.data !== undefined && query.data !== null;
  const lastSyncedAt = query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : null;
  const isExpired = query.isStale ?? false;
  const isStale = hasData && (isOffline || isExpired);

  let reason: StaleReason | null = null;
  if (isStale) {
    reason = isOffline ? "offline" : "expired";
  }

  return {
    isStale,
    reason,
    lastSyncedAt,
    isOffline,
  };
}
