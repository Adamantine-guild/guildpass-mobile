/**
 * Sync store – status transitions, correction lifecycle, entity metadata
 * (Issue #108)
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_TRACKED_CORRECTIONS,
  useSyncStore,
} from "../../src/features/sync/sync.store";
import type { SyncCorrection } from "../../src/features/sync/sync.types";

function makeCorrection(overrides: Partial<SyncCorrection> = {}): SyncCorrection {
  return {
    id: "membership_revoked:membership:guild_abc:0xabc",
    type: "membership_revoked",
    severity: "critical",
    entityKind: "membership",
    guildId: "guild_abc",
    walletAddress: "0xabc",
    message: "Membership revoked.",
    detectedAt: "2026-07-18T12:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  useSyncStore.setState({
    status: "idle",
    lastSyncStartedAt: null,
    lastSyncCompletedAt: null,
    lastSyncError: null,
    entityMeta: {},
    corrections: [],
  });
});

describe("sync store – status transitions", () => {
  it("tracks begin → complete", () => {
    useSyncStore.getState().beginSync(1000);
    expect(useSyncStore.getState().status).toBe("syncing");
    expect(useSyncStore.getState().lastSyncStartedAt).toBe(1000);

    useSyncStore.getState().completeSync(2000);
    expect(useSyncStore.getState().status).toBe("idle");
    expect(useSyncStore.getState().lastSyncCompletedAt).toBe(2000);
    expect(useSyncStore.getState().lastSyncError).toBeNull();
  });

  it("tracks begin → fail and clears the error on the next begin", () => {
    useSyncStore.getState().beginSync(1000);
    useSyncStore.getState().failSync("2 of 3 entities failed to sync", 2000);
    expect(useSyncStore.getState().status).toBe("error");
    expect(useSyncStore.getState().lastSyncError).toBe("2 of 3 entities failed to sync");

    useSyncStore.getState().beginSync(3000);
    expect(useSyncStore.getState().lastSyncError).toBeNull();
  });
});

describe("sync store – corrections", () => {
  it("adds corrections newest first and acknowledges individually", () => {
    const revoked = makeCorrection();
    const rolesRemoved = makeCorrection({
      id: "roles_removed:user-roles:guild_abc:0xabc",
      type: "roles_removed",
      entityKind: "user-roles",
    });

    useSyncStore.getState().addCorrections([revoked]);
    useSyncStore.getState().addCorrections([rolesRemoved]);
    expect(useSyncStore.getState().corrections.map((c) => c.type)).toStrictEqual([
      "roles_removed",
      "membership_revoked",
    ]);

    useSyncStore.getState().acknowledgeCorrection(revoked.id);
    expect(useSyncStore.getState().corrections.map((c) => c.id)).toStrictEqual([
      rolesRemoved.id,
    ]);

    useSyncStore.getState().acknowledgeAllCorrections();
    expect(useSyncStore.getState().corrections).toStrictEqual([]);
  });

  it("replaces a re-detected correction instead of duplicating it", () => {
    useSyncStore.getState().addCorrections([makeCorrection()]);
    useSyncStore
      .getState()
      .addCorrections([makeCorrection({ detectedAt: "2026-07-18T13:00:00.000Z" })]);

    const corrections = useSyncStore.getState().corrections;
    expect(corrections).toHaveLength(1);
    expect(corrections[0].detectedAt).toBe("2026-07-18T13:00:00.000Z");
  });

  it("caps the correction backlog", () => {
    const flood = Array.from({ length: MAX_TRACKED_CORRECTIONS + 5 }, (_, i) =>
      makeCorrection({ id: `correction-${i}` }),
    );
    useSyncStore.getState().addCorrections(flood);
    expect(useSyncStore.getState().corrections).toHaveLength(MAX_TRACKED_CORRECTIONS);
  });

  it("evicts informational corrections before critical ones when over the cap", () => {
    const infoFlood = Array.from({ length: MAX_TRACKED_CORRECTIONS }, (_, i) =>
      makeCorrection({ id: `info-${i}`, type: "roles_added", severity: "info" }),
    );
    // The critical correction arrives last in the incoming batch — recency
    // alone would evict it.
    useSyncStore
      .getState()
      .addCorrections([...infoFlood, makeCorrection({ id: "critical-1" })]);

    const corrections = useSyncStore.getState().corrections;
    expect(corrections).toHaveLength(MAX_TRACKED_CORRECTIONS);
    expect(corrections.some((c) => c.id === "critical-1")).toBe(true);
  });
});

describe("sync store – entity metadata and reset", () => {
  it("records per-entity metadata in batches, merging with existing entries", () => {
    useSyncStore.getState().recordEntityMetaBatch({
      '["membership","0xabc","guild_abc"]': { lastSyncedAt: 1000, version: "0a1b2c3d" },
    });
    useSyncStore.getState().recordEntityMetaBatch({
      '["guild","guild_abc"]': { lastSyncedAt: 2000, version: "9f8e7d6c" },
    });

    expect(useSyncStore.getState().entityMeta).toStrictEqual({
      '["membership","0xabc","guild_abc"]': { lastSyncedAt: 1000, version: "0a1b2c3d" },
      '["guild","guild_abc"]': { lastSyncedAt: 2000, version: "9f8e7d6c" },
    });
  });

  it("clearSyncState wipes metadata, corrections, and status", () => {
    useSyncStore.getState().beginSync(1000);
    useSyncStore.getState().addCorrections([makeCorrection()]);
    useSyncStore.getState().recordEntityMetaBatch({ key: { lastSyncedAt: 1, version: "v" } });

    useSyncStore.getState().clearSyncState();

    const state = useSyncStore.getState();
    expect(state.status).toBe("idle");
    expect(state.corrections).toStrictEqual([]);
    expect(state.entityMeta).toStrictEqual({});
    expect(state.lastSyncCompletedAt).toBeNull();
  });
});
