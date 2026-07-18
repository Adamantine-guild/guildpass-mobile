/**
 * Sync engine – reconciliation pass (Issue #108)
 *
 * Exercises the engine against a real QueryClient with injected fetchers and
 * the real sync store — no network, NetInfo, or UI involved.
 *
 * The first suite is the issue's acceptance scenario: a device cached
 * "role granted / membership active" while offline, the server has since
 * revoked it, and reconnecting must correct the cache AND surface a visible
 * correction — not silently overwrite.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  createSyncEngine,
  serializeQueryKey,
  type SyncEntityFetchers,
} from "../../src/features/sync/syncEngine";
import { useSyncStore } from "../../src/features/sync/sync.store";
import { computeEntityVersion } from "../../src/features/sync/reconcile";
import {
  MEMBERSHIP_ACTIVE_FIXTURE,
  TEST_WALLET_ADDRESS,
  USER_ROLES_FIXTURE,
} from "../fixtures/membership.fixtures";
import { GUILD_DETAIL_FIXTURE } from "../fixtures/guild.fixtures";

const MEMBERSHIP_KEY = ["membership", TEST_WALLET_ADDRESS, "guild_abc"] as const;
const USER_ROLES_KEY = ["user-roles", TEST_WALLET_ADDRESS, "guild_abc"] as const;
const GUILD_KEY = ["guild", "guild_abc"] as const;

const MEMBERSHIP_REVOKED = { ...MEMBERSHIP_ACTIVE_FIXTURE, isActive: false };

function makeFetchers(overrides: Partial<SyncEntityFetchers> = {}): SyncEntityFetchers {
  return {
    membership: vi.fn().mockRejectedValue(new Error("unexpected membership fetch")),
    "user-roles": vi.fn().mockRejectedValue(new Error("unexpected user-roles fetch")),
    guild: vi.fn().mockRejectedValue(new Error("unexpected guild fetch")),
    "guild-config": vi.fn().mockRejectedValue(new Error("unexpected guild-config fetch")),
    "guild-roles": vi.fn().mockRejectedValue(new Error("unexpected guild-roles fetch")),
    ...overrides,
  };
}

function resetSyncStore() {
  useSyncStore.setState({
    status: "idle",
    lastSyncStartedAt: null,
    lastSyncCompletedAt: null,
    lastSyncError: null,
    entityMeta: {},
    corrections: [],
  });
}

describe("sync engine – acceptance scenario: cached grant revoked server-side", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    resetSyncStore();
    queryClient = new QueryClient();
    queryClient.setQueryData(MEMBERSHIP_KEY, MEMBERSHIP_ACTIVE_FIXTURE);
    queryClient.setQueryData(USER_ROLES_KEY, USER_ROLES_FIXTURE);
  });

  it("corrects the cache to the server value and surfaces corrections instead of silently overwriting", async () => {
    const fetchers = makeFetchers({
      membership: vi.fn().mockResolvedValue(MEMBERSHIP_REVOKED),
      "user-roles": vi.fn().mockResolvedValue([]),
    });
    const engine = createSyncEngine({
      queryClient,
      fetchers,
      syncStore: useSyncStore,
      isOnline: () => true,
    });

    const summary = await engine.runReconciliation();

    // Server-authoritative overwrite of the stale "granted" state.
    expect(queryClient.getQueryData(MEMBERSHIP_KEY)).toStrictEqual(MEMBERSHIP_REVOKED);
    expect(queryClient.getQueryData(USER_ROLES_KEY)).toStrictEqual([]);

    // The divergence is surfaced, not silent: corrections exist in both the
    // run summary and the store the UI banner reads from.
    expect(summary.status).toBe("completed");
    expect(summary.entitiesChecked).toBe(2);
    expect(summary.entitiesUpdated).toBe(2);
    const types = summary.corrections.map((c) => c.type).sort();
    expect(types).toStrictEqual(["membership_revoked", "roles_removed"]);
    expect(summary.corrections.every((c) => c.severity === "critical")).toBe(true);

    const storeCorrections = useSyncStore.getState().corrections;
    expect(storeCorrections.map((c) => c.type).sort()).toStrictEqual([
      "membership_revoked",
      "roles_removed",
    ]);
  });

  it("records per-entity lastSyncedAt and version metadata", async () => {
    const now = Date.parse("2026-07-18T12:00:00.000Z");
    const engine = createSyncEngine({
      queryClient,
      fetchers: makeFetchers({
        membership: vi.fn().mockResolvedValue(MEMBERSHIP_REVOKED),
        "user-roles": vi.fn().mockResolvedValue([]),
      }),
      syncStore: useSyncStore,
      isOnline: () => true,
      now: () => now,
    });

    await engine.runReconciliation();

    const meta = useSyncStore.getState().entityMeta;
    expect(meta[serializeQueryKey(MEMBERSHIP_KEY)]).toStrictEqual({
      lastSyncedAt: now,
      version: computeEntityVersion(MEMBERSHIP_REVOKED),
    });
    expect(meta[serializeQueryKey(USER_ROLES_KEY)]).toStrictEqual({
      lastSyncedAt: now,
      version: computeEntityVersion([]),
    });
    expect(useSyncStore.getState().status).toBe("idle");
    expect(useSyncStore.getState().lastSyncCompletedAt).toBe(now);
  });
});

describe("sync engine – behaviour", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    resetSyncStore();
    queryClient = new QueryClient();
  });

  it("skips the pass entirely while offline", async () => {
    queryClient.setQueryData(MEMBERSHIP_KEY, MEMBERSHIP_ACTIVE_FIXTURE);
    const fetchers = makeFetchers();
    const engine = createSyncEngine({
      queryClient,
      fetchers,
      syncStore: useSyncStore,
      isOnline: () => false,
    });

    const summary = await engine.runReconciliation();

    expect(summary.status).toBe("skipped_offline");
    expect(summary.entitiesChecked).toBe(0);
    expect(fetchers.membership).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(MEMBERSHIP_KEY)).toStrictEqual(MEMBERSHIP_ACTIVE_FIXTURE);
  });

  it("does not emit corrections or count updates when server state matches the cache", async () => {
    queryClient.setQueryData(MEMBERSHIP_KEY, MEMBERSHIP_ACTIVE_FIXTURE);
    const engine = createSyncEngine({
      queryClient,
      fetchers: makeFetchers({
        membership: vi.fn().mockResolvedValue({ ...MEMBERSHIP_ACTIVE_FIXTURE }),
      }),
      syncStore: useSyncStore,
      isOnline: () => true,
    });

    const summary = await engine.runReconciliation();

    expect(summary.corrections).toStrictEqual([]);
    expect(summary.entitiesUpdated).toBe(0);
    expect(useSyncStore.getState().corrections).toStrictEqual([]);
    // Metadata still refreshes: the entity was confirmed against the server.
    expect(
      useSyncStore.getState().entityMeta[serializeQueryKey(MEMBERSHIP_KEY)],
    ).toBeDefined();
  });

  it("continues reconciling other entities when one fetch fails", async () => {
    queryClient.setQueryData(MEMBERSHIP_KEY, MEMBERSHIP_ACTIVE_FIXTURE);
    queryClient.setQueryData(GUILD_KEY, GUILD_DETAIL_FIXTURE);
    const deactivatedGuild = { ...GUILD_DETAIL_FIXTURE, isActive: false };
    const engine = createSyncEngine({
      queryClient,
      fetchers: makeFetchers({
        membership: vi.fn().mockRejectedValue(new Error("Network request failed")),
        guild: vi.fn().mockResolvedValue(deactivatedGuild),
      }),
      syncStore: useSyncStore,
      isOnline: () => true,
    });

    const summary = await engine.runReconciliation();

    expect(summary.status).toBe("completed_with_errors");
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0].queryKey).toStrictEqual(MEMBERSHIP_KEY);
    expect(summary.errors[0].message).toBe("Network request failed");
    // The failed entity keeps its last known value; the other is corrected.
    expect(queryClient.getQueryData(MEMBERSHIP_KEY)).toStrictEqual(MEMBERSHIP_ACTIVE_FIXTURE);
    expect(queryClient.getQueryData(GUILD_KEY)).toStrictEqual(deactivatedGuild);
    expect(summary.corrections.map((c) => c.type)).toStrictEqual(["guild_deactivated"]);
    expect(useSyncStore.getState().status).toBe("error");
    expect(useSyncStore.getState().lastSyncError).toContain("1 of 2");
  });

  it("ignores query namespaces outside the reconciliation allowlist", async () => {
    queryClient.setQueryData(["access-check", { walletAddress: TEST_WALLET_ADDRESS }], {
      hasAccess: true,
    });
    queryClient.setQueryData(["some-other-cache"], { anything: true });
    const fetchers = makeFetchers();
    const engine = createSyncEngine({
      queryClient,
      fetchers,
      syncStore: useSyncStore,
      isOnline: () => true,
    });

    const summary = await engine.runReconciliation();

    expect(summary.entitiesChecked).toBe(0);
    Object.values(fetchers).forEach((fetcher) => expect(fetcher).not.toHaveBeenCalled());
  });

  it("treats an undefined server response as a per-entity error, keeping cached data", async () => {
    queryClient.setQueryData(MEMBERSHIP_KEY, MEMBERSHIP_ACTIVE_FIXTURE);
    const engine = createSyncEngine({
      queryClient,
      fetchers: makeFetchers({ membership: vi.fn().mockResolvedValue(undefined) }),
      syncStore: useSyncStore,
      isOnline: () => true,
    });

    const summary = await engine.runReconciliation();

    expect(summary.status).toBe("completed_with_errors");
    expect(queryClient.getQueryData(MEMBERSHIP_KEY)).toStrictEqual(MEMBERSHIP_ACTIVE_FIXTURE);
  });

  it("does not resurrect an entity that was cleared while its fetch was in flight", async () => {
    queryClient.setQueryData(MEMBERSHIP_KEY, MEMBERSHIP_ACTIVE_FIXTURE);
    const membership = vi.fn().mockImplementation(async () => {
      // Simulate a wallet disconnect / app reset clearing the cache mid-pass.
      queryClient.removeQueries();
      return MEMBERSHIP_REVOKED;
    });
    const engine = createSyncEngine({
      queryClient,
      fetchers: makeFetchers({ membership }),
      syncStore: useSyncStore,
      isOnline: () => true,
    });

    const summary = await engine.runReconciliation();

    expect(queryClient.getQueryData(MEMBERSHIP_KEY)).toBeUndefined();
    expect(summary.corrections).toStrictEqual([]);
    expect(useSyncStore.getState().corrections).toStrictEqual([]);
    expect(useSyncStore.getState().entityMeta).toStrictEqual({});
  });

  it("shares a single in-flight pass between concurrent callers", async () => {
    queryClient.setQueryData(MEMBERSHIP_KEY, MEMBERSHIP_ACTIVE_FIXTURE);
    let resolveFetch: (value: unknown) => void = () => {};
    const membership = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const engine = createSyncEngine({
      queryClient,
      fetchers: makeFetchers({ membership }),
      syncStore: useSyncStore,
      isOnline: () => true,
    });

    const first = engine.runReconciliation();
    const second = engine.runReconciliation();
    resolveFetch(MEMBERSHIP_REVOKED);

    const [firstSummary, secondSummary] = await Promise.all([first, second]);

    expect(membership).toHaveBeenCalledTimes(1);
    expect(firstSummary).toBe(secondSummary);

    // A later call starts a fresh pass.
    const thirdPromise = engine.runReconciliation();
    expect(membership).toHaveBeenCalledTimes(2);
    resolveFetch(MEMBERSHIP_REVOKED);
    const third = await thirdPromise;
    expect(third).not.toBe(firstSummary);
  });
});
