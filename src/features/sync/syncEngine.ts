/**
 * Sync engine core (Issue #108).
 *
 * On demand (typically right after connectivity returns), the engine walks
 * every reconcilable entity in the React Query cache, refetches it from the
 * server, and applies a server-authoritative merge:
 *
 *   1. The fresh server value always replaces the cached value.
 *   2. Meaningful divergences (revoked membership, removed roles, …) are
 *      recorded as corrections so the UI can tell the user their cached
 *      state was wrong — never a silent overwrite.
 *   3. Per-entity metadata (lastSyncedAt + content version) is updated in the
 *      sync store.
 *
 * All collaborators are injected so the engine can be unit-tested without a
 * network, NetInfo, or any UI.
 */

import { hashKey } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { computeEntityVersion, describeSyncableQuery, diffEntity } from "./reconcile";
import { prioritizeDescriptors } from "./syncPriority";
import { rebuildMembershipsAggregateFromCache } from "../passes/passCache";
import { DEFAULT_RETRY_CONFIG, RetryAborted, runWithRetry, type RetryConfig } from "./retryPolicy";
import type {
  SyncCorrection,
  SyncEntityDescriptor,
  SyncEntityKind,
  SyncEntityMeta,
  SyncRunError,
  SyncRunSummary,
} from "./sync.types";
import type { SyncStoreState } from "./sync.store";

export type SyncEntityFetcher = (descriptor: SyncEntityDescriptor) => Promise<unknown>;
export type SyncEntityFetchers = Partial<Record<SyncEntityKind, SyncEntityFetcher>>;

/** Minimal store surface the engine needs; satisfied by useSyncStore. */
export type SyncStoreLike = {
  getState: () => Pick<
    SyncStoreState,
    | "beginSync"
    | "completeSync"
    | "failSync"
    | "recordEntityMetaBatch"
    | "addCorrections"
    // Read for staleness-ordering within a priority tier.
    | "entityMeta"
  >;
};

export type SyncEngineDeps = {
  queryClient: QueryClient;
  fetchers: SyncEntityFetchers;
  syncStore: SyncStoreLike;
  isOnline: () => boolean;
  now?: () => number;
  /** Per-entity retry behaviour; defaults to DEFAULT_RETRY_CONFIG. */
  retryConfig?: RetryConfig;
  /** Injected so tests can drive backoff on a fake clock. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

export type SyncEngine = {
  runReconciliation: () => Promise<SyncRunSummary>;
};

/** Uses React Query's own stable (key-order-independent) serializer. */
export function serializeQueryKey(queryKey: readonly unknown[]): string {
  return hashKey(queryKey);
}

/** Reconnect happens on a just-recovered mobile radio; keep the fan-out sane. */
const MAX_CONCURRENT_FETCHES = 5;

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = { status: "fulfilled", value: await fn(items[index]) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

export function createSyncEngine(deps: SyncEngineDeps): SyncEngine {
  const { queryClient, fetchers, syncStore, isOnline } = deps;
  const now = deps.now ?? Date.now;
  const retryConfig = deps.retryConfig ?? DEFAULT_RETRY_CONFIG;
  const sleep = deps.sleep;
  const random = deps.random;

  let inFlight: Promise<SyncRunSummary> | null = null;

  function collectDescriptors(): SyncEntityDescriptor[] {
    return queryClient
      .getQueryCache()
      .getAll()
      .filter((query) => query.state.data !== undefined)
      .map((query) => describeSyncableQuery(query.queryKey))
      .filter((descriptor): descriptor is SyncEntityDescriptor => descriptor !== null);
  }

  type EntityOutcome = {
    corrections: SyncCorrection[];
    updated: boolean;
    metaKey: string;
    meta: SyncEntityMeta;
  } | null;

  async function reconcileEntity(
    descriptor: SyncEntityDescriptor,
    detectedAtMs: number,
  ): Promise<EntityOutcome> {
    const fetcher = fetchers[descriptor.kind];
    if (!fetcher) {
      // No fetcher registered for this entity kind — skip silently.
      return null;
    }
    const fresh = await runWithRetry(() => fetcher(descriptor), {
      config: retryConfig,
      sleep,
      random,
      isOnline,
    });
    if (fresh === undefined) {
      throw new Error(`Server returned no data for ${descriptor.kind}`);
    }

    const cached = queryClient.getQueryData(descriptor.queryKey);
    if (cached === undefined) {
      // The entity was removed while the fetch was in flight (wallet
      // disconnect or app reset cleared the cache) — do not resurrect it.
      return null;
    }

    const corrections = diffEntity(descriptor, cached, fresh, detectedAtMs);
    const freshVersion = computeEntityVersion(fresh);
    const updated = freshVersion !== computeEntityVersion(cached);

    // Server-authoritative: always adopt the server value. This also bumps
    // dataUpdatedAt, so the stale-data banners reflect the reconciliation.
    queryClient.setQueryData(descriptor.queryKey, fresh);

    return {
      corrections,
      updated,
      metaKey: serializeQueryKey(descriptor.queryKey),
      meta: { lastSyncedAt: now(), version: freshVersion },
    };
  }

  async function run(): Promise<SyncRunSummary> {
    const startedAt = now();

    if (!isOnline()) {
      return {
        status: "skipped_offline",
        startedAt,
        finishedAt: startedAt,
        entitiesChecked: 0,
        entitiesUpdated: 0,
        corrections: [],
        errors: [],
      };
    }

    syncStore.getState().beginSync(startedAt);

    // Access-gating entities first, most-stale-first within a tier, so a
    // capped pool spends its slots on the entities that can be unsafe.
    const descriptors = prioritizeDescriptors(collectDescriptors(), {
      entityMeta: syncStore.getState().entityMeta,
      serializeQueryKey,
    });
    const detectedAtMs = startedAt;
    const results = await mapWithConcurrency(descriptors, MAX_CONCURRENT_FETCHES, (descriptor) =>
      reconcileEntity(descriptor, detectedAtMs),
    );

    const corrections: SyncCorrection[] = [];
    const errors: SyncRunError[] = [];
    const metaEntries: Record<string, SyncEntityMeta> = {};
    const walletsToRefresh = new Set<string>();
    let entitiesUpdated = 0;
    let abortedOffline = false;

    results.forEach((result, index) => {
      const descriptor = descriptors[index];
      if (result.status === "fulfilled") {
        if (result.value === null) return; // entity vanished mid-pass
        corrections.push(...result.value.corrections);
        metaEntries[result.value.metaKey] = result.value.meta;
        if (result.value.updated) entitiesUpdated += 1;
        if (
          descriptor.walletAddress &&
          (descriptor.kind === "membership" || descriptor.kind === "user-roles")
        ) {
          walletsToRefresh.add(descriptor.walletAddress);
        }
      } else if (result.reason instanceof RetryAborted) {
        // Connectivity vanished mid-pass. Not an entity error: the entity was
        // never disproven, so it keeps its existing meta and is left for the
        // next pass rather than being recorded as a failure.
        abortedOffline = true;
      } else {
        errors.push({
          queryKey: descriptors[index].queryKey,
          message: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    });

    // Partial success: entities that did reconcile keep their confirmed meta
    // and corrections even when siblings failed, so a flaky pass still makes
    // forward progress instead of being discarded wholesale.
    syncStore.getState().recordEntityMetaBatch(metaEntries);
    syncStore.getState().addCorrections(corrections);
    walletsToRefresh.forEach((walletAddress) => {
      rebuildMembershipsAggregateFromCache(queryClient, walletAddress);
    });

    const finishedAt = now();
    if (errors.length > 0) {
      syncStore
        .getState()
        .failSync(`${errors.length} of ${descriptors.length} entities failed to sync`, finishedAt);
    } else if (abortedOffline) {
      syncStore.getState().failSync("Sync interrupted — connection lost", finishedAt);
    } else {
      syncStore.getState().completeSync(finishedAt);
    }

    const status: SyncRunSummary["status"] =
      errors.length > 0
        ? "completed_with_errors"
        : abortedOffline
          ? "interrupted_offline"
          : "completed";

    return {
      status,
      startedAt,
      finishedAt,
      entitiesChecked: descriptors.length,
      entitiesUpdated,
      corrections,
      errors,
    };
  }

  return {
    runReconciliation: () => {
      // A reconnect burst must not start overlapping passes; callers joining
      // mid-run share the in-flight result.
      if (inFlight) return inFlight;
      inFlight = run().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
  };
}
