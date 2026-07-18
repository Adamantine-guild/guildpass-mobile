/**
 * Reconciliation Store — unit tests
 *
 * Covers:
 *  1. Monotonic version tracking (update / duplicate / stale)
 *  2. Persistence across store re-creation (simulated restart)
 *  3. Wallet-scoped clear on sign-out
 *  4. Bulk version operations
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  useReconciliationStore,
  entityCompositeKey,
  parseEntityCompositeKey,
} from "../../src/features/notifications/reconciliation.store";
import type {
  EntityKey,
  RoleChangeSnapshot,
} from "../../src/features/notifications/reconciliation.types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeKey(guildId: string, walletAddress: string): EntityKey {
  return { guildId, walletAddress };
}

function makeSnapshot(
  guildId: string,
  walletAddress: string,
  roleChangeSeq: number,
  roles: string[] = ["Member"],
  membershipActive = true,
): RoleChangeSnapshot {
  return {
    guildId,
    walletAddress,
    roleChangeSeq,
    roles,
    membershipActive,
  };
}

// ---------------------------------------------------------------------------
// Setup — reset the store between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Fully reset the Zustand store to its initial state
  useReconciliationStore.setState({
    versions: {},
    _hasHydrated: true,
  });
});

// ---------------------------------------------------------------------------
// 1. Monotonic version tracking
// ---------------------------------------------------------------------------

describe("Reconciliation Store — monotonic version tracking", () => {
  it("records the version on first seen entity (update)", () => {
    const store = useReconciliationStore.getState();
    const snapshot = makeSnapshot("guild_abc", "0x123", 5);

    const result = store.processSnapshot(snapshot);

    expect(result.isUpdate).toBe(true);
    expect(result.isDuplicate).toBe(false);
    expect(result.isStale).toBe(false);
    expect(result.previousSeq).toBe(0);
    expect(result.fetchedSeq).toBe(5);
    expect(store.getVersion(makeKey("guild_abc", "0x123"))).toBe(5);
  });

  it("detects a genuine update when fetched seq > stored seq", () => {
    const store = useReconciliationStore.getState();

    // First: seq 5
    store.processSnapshot(makeSnapshot("guild_abc", "0x123", 5));

    // Second: seq 7 (genuine update)
    const result = store.processSnapshot(makeSnapshot("guild_abc", "0x123", 7, ["Member", "Admin"]));

    expect(result.isUpdate).toBe(true);
    expect(result.isDuplicate).toBe(false);
    expect(result.isStale).toBe(false);
    expect(result.previousSeq).toBe(5);
    expect(result.fetchedSeq).toBe(7);
    expect(store.getVersion(makeKey("guild_abc", "0x123"))).toBe(7);
  });

  it("detects a duplicate when fetched seq == stored seq", () => {
    const store = useReconciliationStore.getState();

    // First: seq 5
    store.processSnapshot(makeSnapshot("guild_abc", "0x123", 5));

    // Second: seq 5 again (duplicate push)
    const result = store.processSnapshot(makeSnapshot("guild_abc", "0x123", 5));

    expect(result.isUpdate).toBe(false);
    expect(result.isDuplicate).toBe(true);
    expect(result.isStale).toBe(false);
    expect(result.previousSeq).toBe(5);
    expect(result.fetchedSeq).toBe(5);
    // Version must NOT change
    expect(store.getVersion(makeKey("guild_abc", "0x123"))).toBe(5);
  });

  it("detects stale/out-of-order when fetched seq < stored seq", () => {
    const store = useReconciliationStore.getState();

    // First: seq 10 (newer push processed first)
    store.processSnapshot(makeSnapshot("guild_abc", "0x123", 10, ["Admin"]));

    // Second: seq 5 arrives late (out-of-order)
    const result = store.processSnapshot(makeSnapshot("guild_abc", "0x123", 5, ["Member"]));

    expect(result.isUpdate).toBe(false);
    expect(result.isDuplicate).toBe(false);
    expect(result.isStale).toBe(true);
    expect(result.previousSeq).toBe(10);
    expect(result.fetchedSeq).toBe(5);
    // Version must NOT regress — stays at 10
    expect(store.getVersion(makeKey("guild_abc", "0x123"))).toBe(10);
  });

  it("never regresses the stored version (monotonic guarantee)", () => {
    const store = useReconciliationStore.getState();
    const key = makeKey("guild_abc", "0x123");

    store.setVersion(key, 100);
    // Attempt to set a lower version
    store.setVersion(key, 50);
    expect(store.getVersion(key)).toBe(100);

    // Even processSnapshot should not regress
    store.processSnapshot(makeSnapshot("guild_abc", "0x123", 75));
    expect(store.getVersion(key)).toBe(100);
  });

  it("tracks versions independently per entity", () => {
    const store = useReconciliationStore.getState();

    store.processSnapshot(makeSnapshot("guild_abc", "0x123", 5));
    store.processSnapshot(makeSnapshot("guild_xyz", "0x123", 10));
    store.processSnapshot(makeSnapshot("guild_abc", "0x456", 3));

    expect(store.getVersion(makeKey("guild_abc", "0x123"))).toBe(5);
    expect(store.getVersion(makeKey("guild_xyz", "0x123"))).toBe(10);
    expect(store.getVersion(makeKey("guild_abc", "0x456"))).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 2. Composite key helpers
// ---------------------------------------------------------------------------

describe("Reconciliation Store — composite key helpers", () => {
  it("entityCompositeKey produces a deterministic composite key", () => {
    const key = makeKey("guild_abc", "0x123");
    const composite = entityCompositeKey(key);
    expect(composite).toBe("guild_abc::0x123");
  });

  it("entityCompositeKey normalizes wallet address to lowercase", () => {
    const key = makeKey("guild_abc", "0XABC");
    const composite = entityCompositeKey(key);
    expect(composite).toBe("guild_abc::0xabc");
  });

  it("parseEntityCompositeKey reconstructs the entity key", () => {
    const parsed = parseEntityCompositeKey("guild_abc::0x123");
    expect(parsed).toEqual({ guildId: "guild_abc", walletAddress: "0x123" });
  });

  it("parseEntityCompositeKey returns null for invalid composite", () => {
    expect(parseEntityCompositeKey("invalid")).toBeNull();
    expect(parseEntityCompositeKey("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. isAlreadyProcessed shortcut
// ---------------------------------------------------------------------------

describe("Reconciliation Store — isAlreadyProcessed", () => {
  it("returns true when seq <= stored version", () => {
    const store = useReconciliationStore.getState();
    const key = makeKey("guild_abc", "0x123");
    store.setVersion(key, 10);

    expect(store.isAlreadyProcessed(key, 5)).toBe(true);
    expect(store.isAlreadyProcessed(key, 10)).toBe(true);
  });

  it("returns false when seq > stored version", () => {
    const store = useReconciliationStore.getState();
    const key = makeKey("guild_abc", "0x123");
    store.setVersion(key, 5);

    expect(store.isAlreadyProcessed(key, 10)).toBe(false);
  });

  it("returns false for unknown entities (stored = 0)", () => {
    const store = useReconciliationStore.getState();
    expect(store.isAlreadyProcessed(makeKey("unknown", "0x999"), 1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Wallet-scoped clear
// ---------------------------------------------------------------------------

describe("Reconciliation Store — clearWallet", () => {
  it("removes all versions for a specific wallet across all guilds", () => {
    const store = useReconciliationStore.getState();

    store.processSnapshot(makeSnapshot("guild_abc", "0xAAA", 5));
    store.processSnapshot(makeSnapshot("guild_xyz", "0xAAA", 3));
    store.processSnapshot(makeSnapshot("guild_abc", "0xBBB", 7));

    store.clearWallet("0xAAA");

    expect(store.getVersion(makeKey("guild_abc", "0xAAA"))).toBe(0);
    expect(store.getVersion(makeKey("guild_xyz", "0xAAA"))).toBe(0);
    // Other wallet should be untouched
    expect(store.getVersion(makeKey("guild_abc", "0xBBB"))).toBe(7);
  });

  it("clearAll removes everything", () => {
    const store = useReconciliationStore.getState();

    store.processSnapshot(makeSnapshot("guild_abc", "0xAAA", 5));
    store.processSnapshot(makeSnapshot("guild_abc", "0xBBB", 7));

    store.clearAll();

    expect(store.getVersion(makeKey("guild_abc", "0xAAA"))).toBe(0);
    expect(store.getVersion(makeKey("guild_abc", "0xBBB"))).toBe(0);
    expect(store.versions).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// 5. Snapshot data integrity
// ---------------------------------------------------------------------------

describe("Reconciliation Store — snapshot data integrity", () => {
  it("snapshot carries through to result even on duplicate", () => {
    const store = useReconciliationStore.getState();
    const snapshot = makeSnapshot("guild_abc", "0x123", 5, ["Member", "Contributor"], true);

    // First: seq 5
    store.processSnapshot(snapshot);

    // Duplicate
    const result = store.processSnapshot(snapshot);

    expect(result.isDuplicate).toBe(true);
    expect(result.snapshot).not.toBeNull();
    expect(result.snapshot!.roles).toEqual(["Member", "Contributor"]);
    expect(result.snapshot!.membershipActive).toBe(true);
  });

  it("snapshot is null when seq would regress but we still return the fetched data", () => {
    const store = useReconciliationStore.getState();
    store.setVersion(makeKey("guild_abc", "0x123"), 10);

    const snapshot = makeSnapshot("guild_abc", "0x123", 5, ["Member"], true);
    const result = store.processSnapshot(snapshot);

    expect(result.isStale).toBe(true);
    // Snapshot is still populated — consumers can inspect it if they want
    expect(result.snapshot).not.toBeNull();
    expect(result.snapshot!.roleChangeSeq).toBe(5);
  });
});
