/**
 * Sync manager – reconnect trigger wiring (Issue #108)
 *
 * Verifies that the offline → online transition (as observed through the
 * network store fed by NetInfo) schedules exactly one debounced
 * reconciliation pass, that queued mutations replay before reads are
 * reconciled, and that the full pipeline (manager → engine → query cache →
 * correction store) delivers the acceptance scenario end-to-end.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNetworkStore } from "../../src/features/network/connectivityService";
import {
  initSyncManager,
  resetSyncManagerForTest,
  triggerSync,
} from "../../src/features/sync/syncManager";
import { useSyncStore } from "../../src/features/sync/sync.store";
import { queryClient as appQueryClient } from "../../src/lib/queryClient";
import {
  MEMBERSHIP_ACTIVE_FIXTURE,
  TEST_WALLET_ADDRESS,
  USER_ROLES_FIXTURE,
} from "../fixtures/membership.fixtures";

vi.mock("@react-native-community/netinfo", () => ({
  default: {
    addEventListener: vi.fn(() => () => {}),
    fetch: vi.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
  },
}));

const sdkMock = vi.hoisted(() => ({
  guilds: { getGuild: vi.fn(), getGuildConfig: vi.fn() },
  roles: { getRoles: vi.fn(), getUserRoles: vi.fn() },
  membership: { getMembership: vi.fn() },
  access: { checkAccess: vi.fn() },
}));

vi.mock("../../src/lib/guildpassClient", () => ({ guildPassClient: sdkMock }));

const DEBOUNCE_MS = 100;

function makeFakeEngine() {
  return {
    runReconciliation: vi.fn().mockResolvedValue({
      status: "completed" as const,
      startedAt: 0,
      finishedAt: 0,
      entitiesChecked: 0,
      entitiesUpdated: 0,
      corrections: [],
      errors: [],
    }),
  };
}

function makeFakeQueryClient() {
  return { resumePausedMutations: vi.fn().mockResolvedValue([]) };
}

async function flushAsync(passes = 10) {
  for (let i = 0; i < passes; i++) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  resetSyncManagerForTest();
  useNetworkStore.setState({ isOnline: true, isOffline: false });
  useSyncStore.setState({
    status: "idle",
    lastSyncStartedAt: null,
    lastSyncCompletedAt: null,
    lastSyncError: null,
    entityMeta: {},
    corrections: [],
  });
  appQueryClient.clear();
});

afterEach(() => {
  resetSyncManagerForTest();
  vi.useRealTimers();
});

describe("sync manager – reconnect trigger", () => {
  it("runs a reconciliation pass after the device comes back online", async () => {
    const engine = makeFakeEngine();
    const fakeQueryClient = makeFakeQueryClient();
    initSyncManager({ engine, queryClient: fakeQueryClient, debounceMs: DEBOUNCE_MS });

    useNetworkStore.getState().setOnline(false);
    useNetworkStore.getState().setOnline(true);

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 1);
    expect(engine.runReconciliation).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await flushAsync();

    expect(engine.runReconciliation).toHaveBeenCalledTimes(1);
  });

  it("replays paused mutations before reconciling reads", async () => {
    const engine = makeFakeEngine();
    const fakeQueryClient = makeFakeQueryClient();
    initSyncManager({ engine, queryClient: fakeQueryClient, debounceMs: DEBOUNCE_MS });

    useNetworkStore.getState().setOnline(false);
    useNetworkStore.getState().setOnline(true);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flushAsync();

    expect(fakeQueryClient.resumePausedMutations).toHaveBeenCalledTimes(1);
    expect(fakeQueryClient.resumePausedMutations.mock.invocationCallOrder[0]).toBeLessThan(
      engine.runReconciliation.mock.invocationCallOrder[0],
    );
  });

  it("still reconciles when mutation replay fails", async () => {
    const engine = makeFakeEngine();
    const fakeQueryClient = {
      resumePausedMutations: vi.fn().mockRejectedValue(new Error("replay failed")),
    };
    initSyncManager({ engine, queryClient: fakeQueryClient, debounceMs: DEBOUNCE_MS });

    await triggerSync();

    expect(engine.runReconciliation).toHaveBeenCalledTimes(1);
  });

  it("debounces connectivity flapping into a single pass", async () => {
    const engine = makeFakeEngine();
    initSyncManager({ engine, queryClient: makeFakeQueryClient(), debounceMs: DEBOUNCE_MS });

    for (let i = 0; i < 3; i++) {
      useNetworkStore.getState().setOnline(false);
      useNetworkStore.getState().setOnline(true);
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS / 2);
    }
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flushAsync();

    expect(engine.runReconciliation).toHaveBeenCalledTimes(1);
  });

  it("does not trigger on going offline or on repeated online updates", async () => {
    const engine = makeFakeEngine();
    initSyncManager({ engine, queryClient: makeFakeQueryClient(), debounceMs: DEBOUNCE_MS });

    useNetworkStore.getState().setOnline(true); // already online
    useNetworkStore.getState().setOnline(false); // going offline
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
    await flushAsync();

    expect(engine.runReconciliation).not.toHaveBeenCalled();
  });
});

describe("sync manager – end-to-end acceptance scenario", () => {
  it("reconnecting corrects a cached grant the server revoked and surfaces the notice state", async () => {
    // Cached while offline: active membership with roles ("granted").
    const membershipKey = ["membership", TEST_WALLET_ADDRESS, "guild_abc"];
    const rolesKey = ["user-roles", TEST_WALLET_ADDRESS, "guild_abc"];
    appQueryClient.setQueryData(membershipKey, MEMBERSHIP_ACTIVE_FIXTURE);
    appQueryClient.setQueryData(rolesKey, USER_ROLES_FIXTURE);

    // Server has since revoked everything.
    sdkMock.membership.getMembership.mockResolvedValue({
      ...MEMBERSHIP_ACTIVE_FIXTURE,
      isActive: false,
    });
    sdkMock.roles.getUserRoles.mockResolvedValue([]);

    initSyncManager({ debounceMs: DEBOUNCE_MS });

    useNetworkStore.getState().setOnline(false);
    useNetworkStore.getState().setOnline(true);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await flushAsync(25);

    expect(sdkMock.membership.getMembership).toHaveBeenCalledWith({
      walletAddress: TEST_WALLET_ADDRESS,
      guildId: "guild_abc",
    });
    expect(appQueryClient.getQueryData(membershipKey)).toMatchObject({ isActive: false });
    expect(appQueryClient.getQueryData(rolesKey)).toStrictEqual([]);

    const corrections = useSyncStore.getState().corrections;
    expect(corrections.map((c) => c.type).sort()).toStrictEqual([
      "membership_revoked",
      "roles_removed",
    ]);
    expect(useSyncStore.getState().status).toBe("idle");
  });
});
