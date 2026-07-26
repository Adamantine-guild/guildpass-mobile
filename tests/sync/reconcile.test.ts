/**
 * Sync engine – pure reconciliation logic (Issue #108)
 *
 * These tests cover conflict detection in isolation: no network, no
 * QueryClient, no UI. The conflict policy is server-authoritative; diffing
 * only decides what the UI must announce, never which value wins.
 */

import { describe, expect, it } from "vitest";
import {
  computeEntityVersion,
  describeSyncableQuery,
  diffEntity,
  entityVersionsDiffer,
} from "../../src/features/sync/reconcile";
import type { SyncEntityDescriptor } from "../../src/features/sync/sync.types";
import {
  MEMBERSHIP_ACTIVE_FIXTURE,
  MEMBERSHIP_INACTIVE_FIXTURE,
  TEST_WALLET_ADDRESS,
  USER_ROLES_FIXTURE,
} from "../fixtures/membership.fixtures";
import {
  GUILD_CONFIG_FIXTURE,
  GUILD_DETAIL_FIXTURE,
  GUILD_DETAIL_INACTIVE_FIXTURE,
} from "../fixtures/guild.fixtures";

const NOW = Date.parse("2026-07-18T12:00:00.000Z");

function descriptor(overrides: Partial<SyncEntityDescriptor> = {}): SyncEntityDescriptor {
  return {
    kind: "membership",
    queryKey: ["membership", TEST_WALLET_ADDRESS, "guild_abc"],
    guildId: "guild_abc",
    walletAddress: TEST_WALLET_ADDRESS,
    ...overrides,
  };
}

describe("describeSyncableQuery", () => {
  it("parses wallet-scoped membership and user-roles keys", () => {
    expect(describeSyncableQuery(["membership", TEST_WALLET_ADDRESS, "guild_abc"])).toStrictEqual({
      kind: "membership",
      queryKey: ["membership", TEST_WALLET_ADDRESS, "guild_abc"],
      guildId: "guild_abc",
      walletAddress: TEST_WALLET_ADDRESS,
    });
    expect(describeSyncableQuery(["user-roles", TEST_WALLET_ADDRESS, "guild_abc"])).toMatchObject({
      kind: "user-roles",
      walletAddress: TEST_WALLET_ADDRESS,
    });
  });

  it("parses guild-scoped keys without a wallet address", () => {
    expect(describeSyncableQuery(["guild", "guild_abc"])).toMatchObject({
      kind: "guild",
      guildId: "guild_abc",
      walletAddress: null,
    });
    expect(describeSyncableQuery(["guild-config", "guild_abc"])).toMatchObject({
      kind: "guild-config",
    });
    expect(describeSyncableQuery(["guild-roles", "guild_abc"])).toMatchObject({
      kind: "guild-roles",
    });
  });

  it("rejects non-reconciled namespaces and malformed keys", () => {
    expect(
      describeSyncableQuery(["access-check", { walletAddress: TEST_WALLET_ADDRESS }]),
    ).toBeNull();
    expect(describeSyncableQuery(["wallet-secret"])).toBeNull();
    expect(describeSyncableQuery(["membership", null, "guild_abc"])).toBeNull();
    expect(describeSyncableQuery(["guild", 42])).toBeNull();
    expect(describeSyncableQuery([Symbol("nope")])).toBeNull();
  });
});

describe("computeEntityVersion", () => {
  it("is stable regardless of object key order", () => {
    const a = { isActive: true, guildId: "guild_abc", walletAddress: TEST_WALLET_ADDRESS };
    const b = { walletAddress: TEST_WALLET_ADDRESS, guildId: "guild_abc", isActive: true };
    expect(computeEntityVersion(a)).toBe(computeEntityVersion(b));
  });

  it("changes when content changes", () => {
    expect(entityVersionsDiffer(MEMBERSHIP_ACTIVE_FIXTURE, MEMBERSHIP_ACTIVE_FIXTURE)).toBe(false);
    expect(
      entityVersionsDiffer(MEMBERSHIP_ACTIVE_FIXTURE, {
        ...MEMBERSHIP_ACTIVE_FIXTURE,
        isActive: false,
      }),
    ).toBe(true);
  });

  it("handles arrays and nested structures", () => {
    expect(entityVersionsDiffer(USER_ROLES_FIXTURE, [...USER_ROLES_FIXTURE])).toBe(false);
    expect(entityVersionsDiffer(USER_ROLES_FIXTURE, USER_ROLES_FIXTURE.slice(0, 1))).toBe(true);
  });
});

describe("diffEntity – membership", () => {
  it("flags a revoked membership as a critical correction", () => {
    const corrections = diffEntity(
      descriptor(),
      MEMBERSHIP_ACTIVE_FIXTURE,
      { ...MEMBERSHIP_ACTIVE_FIXTURE, isActive: false },
      NOW,
    );

    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({
      type: "membership_revoked",
      severity: "critical",
      guildId: "guild_abc",
      walletAddress: TEST_WALLET_ADDRESS,
      detectedAt: new Date(NOW).toISOString(),
    });
  });

  it("flags a restored membership as informational", () => {
    const corrections = diffEntity(
      descriptor(),
      MEMBERSHIP_INACTIVE_FIXTURE,
      { ...MEMBERSHIP_INACTIVE_FIXTURE, isActive: true },
      NOW,
    );

    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({ type: "membership_restored", severity: "info" });
  });

  it("returns no corrections when membership state is unchanged", () => {
    expect(
      diffEntity(descriptor(), MEMBERSHIP_ACTIVE_FIXTURE, MEMBERSHIP_ACTIVE_FIXTURE, NOW),
    ).toStrictEqual([]);
  });

  it("treats a null server membership as revoked when the cache said active", () => {
    const corrections = diffEntity(descriptor(), MEMBERSHIP_ACTIVE_FIXTURE, null, NOW);

    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({ type: "membership_revoked", severity: "critical" });
  });

  it("returns no corrections for malformed data (overwrite still applies upstream)", () => {
    expect(diffEntity(descriptor(), "corrupted", MEMBERSHIP_ACTIVE_FIXTURE, NOW)).toStrictEqual([]);
    expect(
      diffEntity(descriptor(), { isActive: "yes" }, MEMBERSHIP_ACTIVE_FIXTURE, NOW),
    ).toStrictEqual([]);
  });
});

describe("diffEntity – user roles", () => {
  const rolesDescriptor = descriptor({
    kind: "user-roles",
    queryKey: ["user-roles", TEST_WALLET_ADDRESS, "guild_abc"],
  });

  it("flags removed roles as a critical correction naming the roles", () => {
    const corrections = diffEntity(rolesDescriptor, USER_ROLES_FIXTURE, [], NOW);

    expect(corrections).toHaveLength(1);
    expect(corrections[0].type).toBe("roles_removed");
    expect(corrections[0].severity).toBe("critical");
    expect(corrections[0].message).toContain("Member");
    expect(corrections[0].message).toContain("Contributor");
  });

  it("flags added roles as informational", () => {
    const corrections = diffEntity(
      rolesDescriptor,
      USER_ROLES_FIXTURE.slice(0, 1),
      USER_ROLES_FIXTURE,
      NOW,
    );

    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({ type: "roles_added", severity: "info" });
    expect(corrections[0].message).toContain("Contributor");
  });

  it("reports both removals and additions when roles were swapped", () => {
    const corrections = diffEntity(
      rolesDescriptor,
      USER_ROLES_FIXTURE,
      [
        {
          id: "role_9",
          name: "Observer",
          guildId: "guild_abc",
          walletAddress: TEST_WALLET_ADDRESS,
        },
      ],
      NOW,
    );

    expect(corrections.map((c) => c.type).sort()).toStrictEqual(["roles_added", "roles_removed"]);
  });

  it("treats a null server role payload as all roles removed", () => {
    const corrections = diffEntity(rolesDescriptor, USER_ROLES_FIXTURE, null, NOW);

    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({ type: "roles_removed", severity: "critical" });
  });

  it("returns no corrections for unchanged or malformed role lists", () => {
    expect(diffEntity(rolesDescriptor, USER_ROLES_FIXTURE, USER_ROLES_FIXTURE, NOW)).toStrictEqual(
      [],
    );
    expect(diffEntity(rolesDescriptor, { not: "an array" }, USER_ROLES_FIXTURE, NOW)).toStrictEqual(
      [],
    );
    expect(diffEntity(rolesDescriptor, [{ weird: true }], [], NOW)).toStrictEqual([]);
  });
});

describe("diffEntity – guild and guild config", () => {
  it("flags a deactivated guild as critical", () => {
    const corrections = diffEntity(
      descriptor({ kind: "guild", queryKey: ["guild", "guild_abc"], walletAddress: null }),
      GUILD_DETAIL_FIXTURE,
      { ...GUILD_DETAIL_FIXTURE, isActive: false },
      NOW,
    );

    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({ type: "guild_deactivated", severity: "critical" });
  });

  it("does not flag a guild that was already inactive", () => {
    expect(
      diffEntity(
        descriptor({ kind: "guild", queryKey: ["guild", "guild_123"], walletAddress: null }),
        GUILD_DETAIL_INACTIVE_FIXTURE,
        GUILD_DETAIL_INACTIVE_FIXTURE,
        NOW,
      ),
    ).toStrictEqual([]);
  });

  it("flags access policy changes as informational", () => {
    const configDescriptor = descriptor({
      kind: "guild-config",
      queryKey: ["guild-config", "guild_abc"],
      walletAddress: null,
    });

    expect(
      diffEntity(
        configDescriptor,
        GUILD_CONFIG_FIXTURE,
        { ...GUILD_CONFIG_FIXTURE, accessPolicy: "all" },
        NOW,
      ),
    ).toMatchObject([{ type: "access_policy_changed", severity: "info" }]);

    expect(
      diffEntity(
        configDescriptor,
        GUILD_CONFIG_FIXTURE,
        { ...GUILD_CONFIG_FIXTURE, requiredRoles: ["admin"] },
        NOW,
      ),
    ).toMatchObject([{ type: "access_policy_changed" }]);
  });

  it("treats guild-roles catalog changes as silent updates", () => {
    expect(
      diffEntity(
        descriptor({
          kind: "guild-roles",
          queryKey: ["guild-roles", "guild_abc"],
          walletAddress: null,
        }),
        [{ id: "role_1", name: "Member", guildId: "guild_abc" }],
        [],
        NOW,
      ),
    ).toStrictEqual([]);
  });
});

describe("diffEntity – correction identity", () => {
  it("produces a deterministic id so re-detections replace older notices", () => {
    const first = diffEntity(
      descriptor(),
      MEMBERSHIP_ACTIVE_FIXTURE,
      { ...MEMBERSHIP_ACTIVE_FIXTURE, isActive: false },
      NOW,
    );
    const second = diffEntity(
      descriptor(),
      MEMBERSHIP_ACTIVE_FIXTURE,
      { ...MEMBERSHIP_ACTIVE_FIXTURE, isActive: false },
      NOW + 60_000,
    );

    expect(first[0].id).toBe(second[0].id);
    expect(first[0].detectedAt).not.toBe(second[0].detectedAt);
  });
});
