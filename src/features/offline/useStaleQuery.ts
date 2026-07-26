import { useMemo } from "react";
import { useNetworkStatus } from "./useNetworkStatus";
import {
  getStaleQueryState,
  type StaleQueryInput,
  type StaleQueryState,
} from "../../lib/staleQueryState";

export type { StaleQueryInput, StaleQueryState, StaleReason } from "../../lib/staleQueryState";

export function useStaleQuery(query: StaleQueryInput): StaleQueryState {
  const { isOffline } = useNetworkStatus();

  return useMemo(
    () => getStaleQueryState(query, isOffline),
    [query.data, query.dataUpdatedAt, query.isStale, isOffline],
  );
}

export function useCombinedStaleState(queries: StaleQueryInput[]): StaleQueryState {
  const { isOffline } = useNetworkStatus();

  return useMemo(() => {
    const states = queries.map((query) => getStaleQueryState(query, isOffline));
    const staleState = states.find((state) => state.isStale);

    if (staleState) {
      return staleState;
    }

    const latestSyncedAt = states
      .map((state) => state.lastSyncedAt?.getTime() ?? 0)
      .reduce((latest, current) => Math.max(latest, current), 0);

    return {
      isStale: false,
      reason: null,
      lastSyncedAt: latestSyncedAt > 0 ? new Date(latestSyncedAt) : null,
      isOffline,
    };
  }, [queries, isOffline]);
}
