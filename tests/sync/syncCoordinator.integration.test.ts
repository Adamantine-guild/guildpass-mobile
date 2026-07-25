/**
 * Sync behaviour under intermittent connectivity (Issue #225).
 *
 * These are integration tests in the sense that matters here: they drive a
 * real QueryClient, the real sync store, the real engine and the real
 * coordinator together, and only the network boundary (SDK fetchers), the
 * clock and the connectivity signal are faked. The acceptance criteria ask
 * for verification under intermittent connectivity, which is exactly the
 * behaviour that unit tests of any single module cannot show: coalescing,
 * rate limiting, backoff, priority under a capped pool, and partial progress
 * when the link dies mid-pass.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { createSyncEngine, serializeQueryKey } from "../../src/features/sync/syncEngine";
import {
  createSyncCoordinator,
  MIN_SYNC_INTERVAL_MS,
} from "../../src/features/sync/syncCoordinator";
import {
  registerForegroundTrigger,
  registerReconnectTrigger,
} from "../../src/features/sync/syncTriggers";
import { useSyncStore } from "../../src/features/sync/sync.store";
import type { SyncEntityFetchers } from "../../src/features/sync/syncEngine";
import type { RetryConfig } from "../../src/features/sync/retryPolicy";
import {
  MEMBERSHIP_ACTIVE_FIXTURE,
  TEST_WALLET_ADDRESS,
  USER_ROLES_FIXTURE,
} from "../fixtures/membership.fixtures";
import { GUILD_DETAIL_FIXTURE } from "../fixtures/guild.fixtures";

// syncTriggers reaches connectivityService, which pulls in NetInfo's native
// module. Same stub the #108 syncManager tests use.
vi.mock("@react-native-community/netinfo", () => ({
  default: {
    addEventListener: vi.fn(() => () => {}),
    fetch: vi.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
  },
}));

const GUILD_ID = "guild_abc";
const MEMBERSHIP_KEY = ["membership", TEST_WALLET_ADDRESS, GUILD_ID];
const USER_ROLES_KEY = ["user-roles", TEST_WALLET_ADDRESS, GUILD_ID];
const GUILD_KEY = ["guild", GUILD_ID];

/** A network that can be switched off, with a scripted per-kind response. */
function makeNetwork() {
  let online = true;
  return {
    isOnline: () => online,
    goOffline: () => {
      online = false;
    },
    goOnline: () => {
      online = true;
    },
  };
}

function makeFetchers(overrides: Partial<SyncEntityFetchers> = {}): SyncEntityFetchers {
  return {
    membership: vi.fn().mockResolvedValue(MEMBERSHIP_ACTIVE_FIXTURE),
    "user-roles": vi.fn().mockResolvedValue(USER_ROLES_FIXTURE),
    guild: vi.fn().mockResolvedValue(GUILD_DETAIL_FIXTURE),
    "guild-config": vi.fn().mockResolvedValue({ guildId: GUILD_ID }),
    "guild-roles": vi.fn().mockResolvedValue([]),
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

/** Deterministic scheduler: records delays and fires them on demand. */
function makeFakeScheduler() {
  const pending: { fn: () => void; delay: number; cancelled: boolean }[] = [];
  return {
    delays: () => pending.filter((p) => !p.cancelled).map((p) => p.delay),
    schedule: (fn: () => void, delay: number) => {
      const entry = { fn, delay, cancelled: false };
      pending.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
    runAll: async () => {
      const due = pending.filter((p) => !p.cancelled);
      pending.length = 0;
      for (const entry of due) entry.fn();
      await flush();
    },
  };
}

async function flush(passes = 30) {
  for (let i = 0; i < passes; i += 1) await Promise.resolve();
}

let queryClient: QueryClient;

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  resetSyncStore();
});

function buildStack(options: {
  network: ReturnType<typeof makeNetwork>;
  fetchers: SyncEntityFetchers;
  scheduler?: ReturnType<typeof makeFakeScheduler>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  retryConfig?: RetryConfig;
}) {
  const engine = createSyncEngine({
    queryClient,
    fetchers: options.fetchers,
    syncStore: useSyncStore,
    isOnline: options.network.isOnline,
    sleep: options.sleep ?? (async () => {}),
    random: () => 0.5, // centre of the jitter band -> deterministic delays
    now: options.now,
    retryConfig: options.retryConfig,
  });

  const coordinator = createSyncCoordinator({
    engine,
    resumePausedMutations: vi.fn().mockResolvedValue([]),
    isOnline: options.network.isOnline,
    now: options.now,
    scheduleTimer: options.scheduler?.schedule,
    random: () => 0.5,
    retryConfig: options.retryConfig,
  });

  return { engine, coordinator };
}

describe("sync under intermittent connectivity", () => {
  it("coalesces a burst of reconnect events into a single pass", async () => {
    const network = makeNetwork();
    const scheduler = makeFakeScheduler();
    const { coordinator } = buildStack({ network, fetchers: makeFetchers() });
    queryClient.setQueryData(MEMBERSHIP_KEY, MEMBERSHIP_ACTIVE_FIXTURE);

    let isOnline = false;
    const listeners: ((state: { isOnline: boolean }) => void)[] = [];
    registerReconnectTrigger({
      coordinator,
      debounceMs: 100,
      scheduleTimer: scheduler.schedule,
      subscribe: (listener) => {
        listeners.push(listener);
        return () => {};
      },
      getInitialOnline: () => isOnline,
    });

    // Three offline -> online flaps inside the debounce window.
    for (let i = 0; i < 3; i += 1) {
      isOnline = false;
      listeners.forEach((l) => l({ isOnline: false }));
      isOnline = true;
      listeners.forEach((l) => l({ isOnline: true }));
    }

    // Only the last scheduled debounce survives; earlier ones were cancelled.
    expect(scheduler.delays()).toStrictEqual([100]);

    await scheduler.runAll();
    expect(useSyncStore.getState().lastSyncCompletedAt).not.toBeNull();
  });

  it("commits entities reconciled before the link dropped and leaves the rest", async () => {
    const network = makeNetwork();
    const membership = vi.fn().mockResolvedValue(MEMBERSHIP_ACTIVE_FIXTURE);
    // The guild fetch is what "notices" the link is gone.
    const guild = vi.fn().mockImplementation(async () => {
      network.goOffline();
      throw new Error("Network request failed");
    });

    const { coordinator } = buildStack({
      network,
      fetchers: makeFetchers({ membership, guild }),
    });

    queryClient.setQueryData(MEMBERSHIP_KEY, MEMBERSHIP_ACTIVE_FIXTURE);
    queryClient.setQueryData(GUILD_KEY, GUILD_DETAIL_FIXTURE);

    const summary = await coordinator.requestSync("reconnect");

    // Membership (tier 1) went first and is committed...
    expect(summary?.status).toBe("interrupted_offline");
    expect(useSyncStore.getState().entityMeta[serializeQueryKey(MEMBERSHIP_KEY)]).toBeDefined();
    // ...the guild is not marked synced, so the next pass revisits it.
    expect(useSyncStore.getState().entityMeta[serializeQueryKey(GUILD_KEY)]).toBeUndefined();
    // Losing the link is not an entity error.
    expect(summary?.errors).toStrictEqual([]);
    expect(useSyncStore.getState().status).toBe("error");
  });

  /**
   * A virtual clock that only advances when the code under test actually waits.
   * Asserting the *timestamps* of each attempt (rather than the numbers handed
   * to sleep) proves both the curve and that the delay is genuinely awaited
   * before the next attempt is made.
   */
  function makeVirtualClock(start = 1_000_000) {
    let clock = start;
    return {
      now: () => clock,
      sleep: async (ms: number) => {
        clock += ms;
      },
    };
  }

  it("retries a transient entity failure on the configured backoff curve", async () => {
    const network = makeNetwork();
    const virtual = makeVirtualClock();
    const attemptTimes: number[] = [];

    const membership = vi.fn().mockImplementation(async () => {
      attemptTimes.push(virtual.now());
      if (attemptTimes.length < 3) throw new Error("timeout");
      return MEMBERSHIP_ACTIVE_FIXTURE;
    });

    const { coordinator } = buildStack({
      network,
      fetchers: makeFetchers({ membership }),
      sleep: virtual.sleep,
      now: virtual.now,
    });

    queryClient.setQueryData(MEMBERSHIP_KEY, MEMBERSHIP_ACTIVE_FIXTURE);
    const summary = await coordinator.requestSync("reconnect");

    expect(membership).toHaveBeenCalledTimes(3);
    // Defaults: base 1000, factor 2, jitter centred by random() === 0.5.
    // Attempt 1 immediately, attempt 2 after 1000ms, attempt 3 a further 2000ms.
    const start = attemptTimes[0];
    expect(attemptTimes.map((t) => t - start)).toStrictEqual([0, 1000, 3000]);
    expect(summary?.status).toBe("completed");
  });

  it("honours a custom retry config rather than hard-coded delays", async () => {
    const network = makeNetwork();
    const virtual = makeVirtualClock();
    const attemptTimes: number[] = [];

    const membership = vi.fn().mockImplementation(async () => {
      attemptTimes.push(virtual.now());
      throw new Error("timeout");
    });

    const { coordinator } = buildStack({
      network,
      fetchers: makeFetchers({ membership }),
      sleep: virtual.sleep,
      now: virtual.now,
      // Deliberately unlike the defaults on every axis, including a cap that
      // has to clamp the fourth attempt.
      retryConfig: {
        maxAttempts: 4,
        baseDelayMs: 100,
        factor: 3,
        maxDelayMs: 500,
        jitterRatio: 0,
      },
    });

    queryClient.setQueryData(MEMBERSHIP_KEY, MEMBERSHIP_ACTIVE_FIXTURE);
    const summary = await coordinator.requestSync("reconnect");

    // 4 attempts, spaced 100, 300, then 900 clamped to the 500ms cap.
    expect(membership).toHaveBeenCalledTimes(4);
    const start = attemptTimes[0];
    expect(attemptTimes.map((t) => t - start)).toStrictEqual([0, 100, 400, 900]);
    expect(summary?.status).toBe("completed_with_errors");
  });

  it("does not fire a scheduled pass-level retry while offline", async () => {
    const network = makeNetwork();
    const scheduler = makeFakeScheduler();
    // Fails for a reason that is not connectivity, so a retry gets scheduled.
    const membership = vi.fn().mockResolvedValue(undefined);

    const { coordinator } = buildStack({
      network,
      fetchers: makeFetchers({ membership }),
      scheduler,
    });

    queryClient.setQueryData(MEMBERSHIP_KEY, MEMBERSHIP_ACTIVE_FIXTURE);
    const summary = await coordinator.requestSync("reconnect");
    expect(summary?.status).toBe("completed_with_errors");

    const callsAfterFirstPass = membership.mock.calls.length;
    expect(scheduler.delays()).toHaveLength(1);

    // The device drops off before the retry timer fires.
    network.goOffline();
    await scheduler.runAll();

    expect(membership.mock.calls.length).toBe(callsAfterFirstPass);
  });

  it("dispatches every access-gating entity before any display entity", async () => {
    const network = makeNetwork();
    const order: string[] = [];
    const inFlight: (() => void)[] = [];

    // Every fetcher parks until released, so with a 5-slot pool we can observe
    // exactly which entities the pool chose to start first.
    const track = (kind: string) =>
      vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            order.push(kind);
            inFlight.push(() => resolve(kind === "user-roles" ? [] : {}));
          }),
      );

    const { coordinator } = buildStack({
      network,
      fetchers: makeFetchers({
        membership: track("membership"),
        "user-roles": track("user-roles"),
        guild: track("guild"),
        "guild-config": track("guild-config"),
        "guild-roles": track("guild-roles"),
      }),
    });

    // 10 entities across 2 guilds: 4 tier-1, 6 tier-2.
    for (const guildId of [GUILD_ID, "guild_def"]) {
      queryClient.setQueryData(["membership", TEST_WALLET_ADDRESS, guildId], {});
      queryClient.setQueryData(["user-roles", TEST_WALLET_ADDRESS, guildId], []);
      queryClient.setQueryData(["guild", guildId], {});
      queryClient.setQueryData(["guild-config", guildId], {});
      queryClient.setQueryData(["guild-roles", guildId], []);
    }

    const pass = coordinator.requestSync("reconnect");
    await flush();

    // The pool is 5 wide, so the first 5 dispatched are all it started.
    const firstWave = order.slice(0, 5);
    const tierOne = firstWave.filter((k) => k === "membership" || k === "user-roles");
    expect(tierOne).toHaveLength(4);

    // Drain: releasing a wave frees pool slots, which starts the next wave.
    for (let i = 0; i < 10 && inFlight.length > 0; i += 1) {
      inFlight.splice(0).forEach((release) => release());
      await flush();
    }
    await pass;

    // And the full order still has every tier-1 entity ahead of every tier-2.
    const lastTierOne = order.findLastIndex(
      (k) => k === "membership" || k === "user-roles",
    );
    const firstTierTwo = order.findIndex(
      (k) => k !== "membership" && k !== "user-roles",
    );
    expect(lastTierOne).toBeLessThan(firstTierTwo);
  });

  it("shares one in-flight pass between the reconnect and foreground triggers", async () => {
    const network = makeNetwork();
    let release: (value: unknown) => void = () => {};
    const membership = vi
      .fn()
      .mockImplementation(() => new Promise((resolve) => (release = resolve)));

    const { coordinator } = buildStack({ network, fetchers: makeFetchers({ membership }) });
    queryClient.setQueryData(MEMBERSHIP_KEY, MEMBERSHIP_ACTIVE_FIXTURE);

    const appStateListeners: ((status: "active") => void)[] = [];
    registerForegroundTrigger({
      coordinator,
      subscribe: (listener) => {
        appStateListeners.push(listener as (status: "active") => void);
        return () => {};
      },
    });

    const first = coordinator.requestSync("reconnect");
    await flush(5);
    // Foreground lands while the reconnect pass is still running.
    appStateListeners.forEach((listener) => listener("active"));
    await flush(5);

    release(MEMBERSHIP_ACTIVE_FIXTURE);
    await first;
    await flush();

    expect(membership).toHaveBeenCalledTimes(1);
  });

  it("rate-limits a foreground sweep that follows a completed pass", async () => {
    const network = makeNetwork();
    let clock = 1_000_000;
    const membership = vi.fn().mockResolvedValue(MEMBERSHIP_ACTIVE_FIXTURE);

    const { coordinator } = buildStack({
      network,
      fetchers: makeFetchers({ membership }),
      now: () => clock,
    });
    queryClient.setQueryData(MEMBERSHIP_KEY, MEMBERSHIP_ACTIVE_FIXTURE);

    await coordinator.requestSync("reconnect");
    expect(membership).toHaveBeenCalledTimes(1);

    // Well inside the window: suppressed.
    clock += MIN_SYNC_INTERVAL_MS - 1;
    expect(await coordinator.requestSync("app-foreground")).toBeNull();
    expect(membership).toHaveBeenCalledTimes(1);

    // A user-initiated retry is exempt — silence would be worse than a fetch.
    expect(await coordinator.requestSync("manual")).not.toBeNull();
    expect(membership).toHaveBeenCalledTimes(2);

    // Past the window, background triggers are allowed again.
    clock += MIN_SYNC_INTERVAL_MS;
    await coordinator.requestSync("app-foreground");
    expect(membership).toHaveBeenCalledTimes(3);
  });

  it("reports status transitions a user can observe, and recovers", async () => {
    const network = makeNetwork();
    const observed: string[] = [];
    const unsubscribe = useSyncStore.subscribe((state) => observed.push(state.status));

    const membership = vi
      .fn()
      .mockResolvedValueOnce(undefined) // pass 1: entity fails
      .mockResolvedValue(MEMBERSHIP_ACTIVE_FIXTURE); // pass 2: recovers

    const { coordinator } = buildStack({ network, fetchers: makeFetchers({ membership }) });
    queryClient.setQueryData(MEMBERSHIP_KEY, MEMBERSHIP_ACTIVE_FIXTURE);

    await coordinator.requestSync("reconnect");
    expect(useSyncStore.getState().status).toBe("error");
    expect(useSyncStore.getState().lastSyncError).toContain("failed to sync");

    await coordinator.requestSync("manual");
    expect(useSyncStore.getState().status).toBe("idle");
    expect(useSyncStore.getState().lastSyncError).toBeNull();

    expect(observed).toContain("syncing");
    expect(observed).toContain("error");
    expect(observed[observed.length - 1]).toBe("idle");
    unsubscribe();
  });

  it("does not fail the pass when an unreconcilable cached entity is present", async () => {
    // Regression: "memberships" (plural) is persisted but has no fetcher. It
    // used to be collected as a descriptor, dispatched as fetchers[kind] ===
    // undefined, and thrown as a TypeError that failed every pass once the
    // guilds or profile screen had populated the cache.
    const network = makeNetwork();
    const { coordinator } = buildStack({ network, fetchers: makeFetchers() });

    queryClient.setQueryData(["memberships", TEST_WALLET_ADDRESS], [{ guildId: GUILD_ID }]);
    queryClient.setQueryData(MEMBERSHIP_KEY, MEMBERSHIP_ACTIVE_FIXTURE);
    queryClient.setQueryData(USER_ROLES_KEY, USER_ROLES_FIXTURE);

    const summary = await coordinator.requestSync("reconnect");

    expect(summary?.status).toBe("completed");
    expect(summary?.errors).toStrictEqual([]);
    // The unreconcilable entry is skipped, not counted and not destroyed.
    expect(summary?.entitiesChecked).toBe(2);
    expect(queryClient.getQueryData(["memberships", TEST_WALLET_ADDRESS])).toStrictEqual([
      { guildId: GUILD_ID },
    ]);
    expect(useSyncStore.getState().status).toBe("idle");
  });
});
