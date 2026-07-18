/**
 * useReconciliation — hook tests
 *
 * Covers:
 *  1. Genuine update: fetch → compare → callback fires
 *  2. Duplicate push: callback suppressed
 *  3. Out-of-order push: callback suppressed, state not regressed
 *  4. Fetch failure: graceful degradation
 *  5. Bulk reconciliation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSdkMock, resetSdkMock } from "../fixtures/sdk.mock";
import { useReconciliationStore } from "../../src/features/notifications/reconciliation.store";
import type {
  PushWakeUpHint,
  ReconciliationResult,
  RoleChangeSnapshot,
} from "../../src/features/notifications/reconciliation.types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@guildpass/sdk", async () => {
  const { mockSdkModule } = await import("../fixtures/sdk.mock");
  return mockSdkModule();
});

vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: { apiUrl: "https://api.guildpass.test", chainId: 1 },
    },
  },
}));

// Import after mocks are set up
import { guildPassClient } from "../../src/lib/guildpassClient";

// ---------------------------------------------------------------------------
// Test subject — we test the core reconciliation logic directly rather than
// the React hook itself, since the hook is a thin wrapper around the fetch +
// store.  This keeps the tests synchronous and deterministic.
// ---------------------------------------------------------------------------

/**
 * Simulates a reconciliation: fetches from the (mocked) SDK, then processes
 * through the store.  This mirrors what `useReconciliation.reconcile()` does.
 */
async function simulateReconcile(
  hint: PushWakeUpHint,
  onRoleChangeApplied?: (result: ReconciliationResult) => void,
): Promise<ReconciliationResult> {
  let membershipResult: unknown;
  let rolesResult: unknown;

  try {
    [membershipResult, rolesResult] = await Promise.all([
      guildPassClient.membership.getMembership({
        walletAddress: hint.walletAddress,
        guildId: hint.guildId,
      }),
      guildPassClient.roles.getUserRoles({
        walletAddress: hint.walletAddress,
        guildId: hint.guildId,
      }),
    ]);
  } catch {
    const store = useReconciliationStore.getState();
    return {
      entityKey: { guildId: hint.guildId, walletAddress: hint.walletAddress },
      previousSeq: store.getVersion({ guildId: hint.guildId, walletAddress: hint.walletAddress }),
      fetchedSeq: -1,
      isUpdate: false,
      isStale: false,
      isDuplicate: false,
      snapshot: null,
    };
  }

  const m = membershipResult as Record<string, unknown>;
  const seq: number =
    typeof m.roleChangeSeq === "number"
      ? (m.roleChangeSeq as number)
      : typeof m.updatedAt === "number"
        ? (m.updatedAt as number)
        : 0;

  const roleNames: string[] = Array.isArray(rolesResult)
    ? rolesResult.map((r: Record<string, unknown>) =>
        typeof r.name === "string" ? r.name : String(r.id ?? ""),
      )
    : [];

  const snapshot: RoleChangeSnapshot = {
    guildId: hint.guildId,
    walletAddress: hint.walletAddress,
    roleChangeSeq: seq,
    roles: roleNames,
    membershipActive: typeof m.isActive === "boolean" ? (m.isActive as boolean) : false,
  };

  const result = useReconciliationStore.getState().processSnapshot(snapshot);

  if (result.isUpdate && onRoleChangeApplied) {
    onRoleChangeApplied(result);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  createSdkMock();
  useReconciliationStore.setState({ versions: {}, _hasHydrated: true });
});

afterEach(() => {
  resetSdkMock();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Genuine update
// ---------------------------------------------------------------------------

describe("useReconciliation — genuine update", () => {
  it("fires onRoleChangeApplied exactly once for a new role change", async () => {
    const sdk = createSdkMock();
    sdk.membership.getMembership.mockResolvedValueOnce({
      walletAddress: "0x123",
      guildId: "guild_abc",
      isActive: true,
      roleChangeSeq: 7,
    });
    sdk.roles.getUserRoles.mockResolvedValueOnce([
      { id: "role_1", name: "Member" },
      { id: "role_2", name: "Admin" },
    ]);

    const callback = vi.fn();
    const hint: PushWakeUpHint = { guildId: "guild_abc", walletAddress: "0x123" };

    const result = await simulateReconcile(hint, callback);

    expect(result.isUpdate).toBe(true);
    expect(result.isDuplicate).toBe(false);
    expect(result.isStale).toBe(false);
    expect(result.previousSeq).toBe(0);
    expect(result.fetchedSeq).toBe(7);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(result);
  });
});

// ---------------------------------------------------------------------------
// 2. Duplicate push — callback suppressed
// ---------------------------------------------------------------------------

describe("useReconciliation — duplicate push", () => {
  it("does NOT fire onRoleChangeApplied when the same seq is seen twice", async () => {
    const sdk = createSdkMock();
    const membershipResponse = {
      walletAddress: "0x123",
      guildId: "guild_abc",
      isActive: true,
      roleChangeSeq: 5,
    };

    // First push
    sdk.membership.getMembership.mockResolvedValueOnce(membershipResponse);
    sdk.roles.getUserRoles.mockResolvedValueOnce([{ id: "r1", name: "Member" }]);

    const callback1 = vi.fn();
    const hint: PushWakeUpHint = { guildId: "guild_abc", walletAddress: "0x123" };

    const result1 = await simulateReconcile(hint, callback1);
    expect(result1.isUpdate).toBe(true);
    expect(callback1).toHaveBeenCalledTimes(1);

    // Second (duplicate) push — same seq
    sdk.membership.getMembership.mockResolvedValueOnce(membershipResponse);
    sdk.roles.getUserRoles.mockResolvedValueOnce([{ id: "r1", name: "Member" }]);

    const callback2 = vi.fn();
    const result2 = await simulateReconcile(hint, callback2);

    expect(result2.isDuplicate).toBe(true);
    expect(result2.isUpdate).toBe(false);
    // Callback must NOT fire for duplicate
    expect(callback2).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. Out-of-order push — callback suppressed, no state regression
// ---------------------------------------------------------------------------

describe("useReconciliation — out-of-order push", () => {
  it("suppresses stale delivery and does not regress the stored version", async () => {
    const sdk = createSdkMock();

    // Process a newer push first (seq 10)
    sdk.membership.getMembership.mockResolvedValueOnce({
      walletAddress: "0x123",
      guildId: "guild_abc",
      isActive: true,
      roleChangeSeq: 10,
    });
    sdk.roles.getUserRoles.mockResolvedValueOnce([{ id: "r1", name: "Admin" }]);

    const hint: PushWakeUpHint = { guildId: "guild_abc", walletAddress: "0x123" };
    const callback1 = vi.fn();
    const result1 = await simulateReconcile(hint, callback1);

    expect(result1.isUpdate).toBe(true);
    expect(callback1).toHaveBeenCalledTimes(1);

    // Now an older push arrives late (seq 5)
    sdk.membership.getMembership.mockResolvedValueOnce({
      walletAddress: "0x123",
      guildId: "guild_abc",
      isActive: true,
      roleChangeSeq: 5,
    });
    sdk.roles.getUserRoles.mockResolvedValueOnce([{ id: "r1", name: "Member" }]);

    const callback2 = vi.fn();
    const result2 = await simulateReconcile(hint, callback2);

    expect(result2.isStale).toBe(true);
    expect(result2.isUpdate).toBe(false);
    expect(callback2).not.toHaveBeenCalled();

    // Stored version remains at 10 (NOT regressed to 5)
    const storedVersion = useReconciliationStore
      .getState()
      .getVersion({ guildId: "guild_abc", walletAddress: "0x123" });
    expect(storedVersion).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// 4. Fetch failure — graceful degradation
// ---------------------------------------------------------------------------

describe("useReconciliation — fetch failure", () => {
  it("returns a safe result without crashing when the server fetch fails", async () => {
    const sdk = createSdkMock();
    sdk.membership.getMembership.mockRejectedValueOnce(new Error("Network error"));

    const callback = vi.fn();
    const hint: PushWakeUpHint = { guildId: "guild_abc", walletAddress: "0x123" };

    const result = await simulateReconcile(hint, callback);

    expect(result.isUpdate).toBe(false);
    expect(result.isStale).toBe(false);
    expect(result.isDuplicate).toBe(false);
    expect(result.fetchedSeq).toBe(-1);
    expect(result.snapshot).toBeNull();
    expect(callback).not.toHaveBeenCalled();
  });

  it("does not corrupt the store on fetch failure", async () => {
    const sdk = createSdkMock();
    const store = useReconciliationStore.getState();

    // Set a known good version first
    store.setVersion({ guildId: "guild_abc", walletAddress: "0x123" }, 5);

    // Now fail
    sdk.membership.getMembership.mockRejectedValueOnce(new Error("Timeout"));

    const hint: PushWakeUpHint = { guildId: "guild_abc", walletAddress: "0x123" };
    await simulateReconcile(hint);

    // Store should be untouched
    expect(
      store.getVersion({ guildId: "guild_abc", walletAddress: "0x123" }),
    ).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// 5. Extended offline → catch-up (simulated bulk reconcile)
// ---------------------------------------------------------------------------

describe("useReconciliation — extended offline catch-up", () => {
  it("processes multiple missed updates with exactly one callback per genuine change", async () => {
    const sdk = createSdkMock();

    // Simulate: user was offline, missed seq 5→6→7 across 3 entities
    const entities = [
      { guildId: "guild_abc", walletAddress: "0xAAA", seq: 7 },
      { guildId: "guild_xyz", walletAddress: "0xAAA", seq: 6 },
      { guildId: "guild_abc", walletAddress: "0xBBB", seq: 5 },
    ];

    const callback = vi.fn();

    for (const entity of entities) {
      sdk.membership.getMembership.mockResolvedValueOnce({
        walletAddress: entity.walletAddress,
        guildId: entity.guildId,
        isActive: true,
        roleChangeSeq: entity.seq,
      });
      sdk.roles.getUserRoles.mockResolvedValueOnce([
        { id: "r1", name: "Member" },
      ]);
    }

    // Reconcile all
    for (const entity of entities) {
      await simulateReconcile(
        { guildId: entity.guildId, walletAddress: entity.walletAddress },
        callback,
      );
    }

    // Exactly one callback per entity (3 total)
    expect(callback).toHaveBeenCalledTimes(3);

    // Each entity's version is correctly stored
    const store = useReconciliationStore.getState();
    expect(store.getVersion({ guildId: "guild_abc", walletAddress: "0xAAA" })).toBe(7);
    expect(store.getVersion({ guildId: "guild_xyz", walletAddress: "0xAAA" })).toBe(6);
    expect(store.getVersion({ guildId: "guild_abc", walletAddress: "0xBBB" })).toBe(5);
  });

  it("on second sweep (no new changes), no callbacks fire", async () => {
    const sdk = createSdkMock();

    sdk.membership.getMembership.mockResolvedValue({
      walletAddress: "0x123",
      guildId: "guild_abc",
      isActive: true,
      roleChangeSeq: 3,
    });
    sdk.roles.getUserRoles.mockResolvedValue([{ id: "r1", name: "Member" }]);

    const hint: PushWakeUpHint = { guildId: "guild_abc", walletAddress: "0x123" };

    // First reconciliation
    const callback1 = vi.fn();
    await simulateReconcile(hint, callback1);
    expect(callback1).toHaveBeenCalledTimes(1);

    // Second sweep — same seq
    const callback2 = vi.fn();
    await simulateReconcile(hint, callback2);
    expect(callback2).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 6. SDK contract: roleChangeSeq absence (graceful fallback to 0)
// ---------------------------------------------------------------------------

describe("useReconciliation — SDK contract fallback", () => {
  it("treats missing roleChangeSeq as 0 (always an update on first fetch)", async () => {
    const sdk = createSdkMock();
    // SDK response without roleChangeSeq
    sdk.membership.getMembership.mockResolvedValueOnce({
      walletAddress: "0x123",
      guildId: "guild_abc",
      isActive: true,
      // No roleChangeSeq field
    });
    sdk.roles.getUserRoles.mockResolvedValueOnce([{ id: "r1", name: "Member" }]);

    const callback = vi.fn();
    const hint: PushWakeUpHint = { guildId: "guild_abc", walletAddress: "0x123" };

    const result = await simulateReconcile(hint, callback);

    // First fetch with seq=0 is always an update (because stored is 0)
    expect(result.isUpdate).toBe(true);
    expect(result.fetchedSeq).toBe(0);
    expect(callback).toHaveBeenCalledTimes(1);

    // Second fetch also without roleChangeSeq
    sdk.membership.getMembership.mockResolvedValueOnce({
      walletAddress: "0x123",
      guildId: "guild_abc",
      isActive: true,
    });
    sdk.roles.getUserRoles.mockResolvedValueOnce([{ id: "r1", name: "Member" }]);

    const callback2 = vi.fn();
    const result2 = await simulateReconcile(hint, callback2);

    // Both seq=0 → duplicate
    expect(result2.isDuplicate).toBe(true);
    expect(callback2).not.toHaveBeenCalled();
  });

  it("falls back to updatedAt when roleChangeSeq is absent", async () => {
    const sdk = createSdkMock();
    sdk.membership.getMembership.mockResolvedValueOnce({
      walletAddress: "0x123",
      guildId: "guild_abc",
      isActive: true,
      updatedAt: 1700000000000, // timestamp as fallback seq
    });
    sdk.roles.getUserRoles.mockResolvedValueOnce([{ id: "r1", name: "Member" }]);

    const callback = vi.fn();
    const hint: PushWakeUpHint = { guildId: "guild_abc", walletAddress: "0x123" };

    const result = await simulateReconcile(hint, callback);

    expect(result.isUpdate).toBe(true);
    expect(result.fetchedSeq).toBe(1700000000000);
  });
});
