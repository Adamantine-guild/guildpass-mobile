import type { QueryClient, QueryKey } from "@tanstack/react-query";

export interface OptimisticCachePatch<TVariables> {
  queryKey: QueryKey;
  updater: (current: unknown, variables: TVariables) => unknown;
}

export interface OptimisticCacheSnapshot {
  queryKey: QueryKey;
  previousData: unknown;
  hadQuery: boolean;
}

export interface OptimisticMutationContext {
  snapshots: OptimisticCacheSnapshot[];
}

export async function applyOptimisticCacheUpdates<TVariables>(
  queryClient: QueryClient,
  variables: TVariables,
  patches: readonly OptimisticCachePatch<TVariables>[],
): Promise<OptimisticMutationContext> {
  const snapshots: OptimisticCacheSnapshot[] = [];

  for (const patch of patches) {
    await queryClient.cancelQueries({ queryKey: patch.queryKey, exact: true });

    snapshots.push({
      queryKey: patch.queryKey,
      previousData: queryClient.getQueryData(patch.queryKey),
      hadQuery: queryClient.getQueryState(patch.queryKey) !== undefined,
    });

    queryClient.setQueryData(patch.queryKey, (current) => patch.updater(current, variables));
  }

  return { snapshots };
}

export function rollbackOptimisticCacheUpdates(
  queryClient: QueryClient,
  context: OptimisticMutationContext | undefined,
): void {
  if (!context) return;

  for (const snapshot of context.snapshots) {
    if (snapshot.hadQuery) {
      queryClient.setQueryData(snapshot.queryKey, snapshot.previousData);
    } else {
      queryClient.removeQueries({ queryKey: snapshot.queryKey, exact: true });
    }
  }
}

export function markOptimisticCacheSynced<TData>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  updater: (current: TData | undefined) => TData,
): TData {
  const next = updater(queryClient.getQueryData<TData>(queryKey));
  queryClient.setQueryData(queryKey, next);
  return next;
}
