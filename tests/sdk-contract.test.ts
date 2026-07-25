/**
 * sdk-contract.test.ts
 *
 * This file is the single source of truth for the GuildPass SDK surface that
 * the mobile app depends on.  It is intentionally documentation-first: every
 * test name describes a contract requirement, not an implementation detail.
 *
 * If the SDK team renames a method, changes an argument shape, or removes a
 * field from a response, exactly one (or more) of these tests will fail – making
 * the breaking change visible before it silently corrupts a screen at runtime.
 *
 * Structure
 * ---------
 *   1. GuildPassClient instantiation contract
 *   2. guilds namespace contract
 *   3. roles namespace contract
 *   4. membership namespace contract
 *   5. access namespace contract
 *   6. Cross-cutting: response shape completeness
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSdkMock, resetSdkMock } from "./fixtures/sdk.mock";
import type { SdkMock } from "./fixtures/sdk.mock";
import {
  GUILD_DETAIL_FIXTURE,
  GUILD_CONFIG_FIXTURE,
  ROLES_LIST_FIXTURE,
  ROLES_EMPTY_FIXTURE,
} from "./fixtures/guild.fixtures";
import {
  MEMBERSHIP_ACTIVE_FIXTURE,
  MEMBERSHIP_INACTIVE_FIXTURE,
  USER_ROLES_FIXTURE,
  USER_ROLES_EMPTY_FIXTURE,
  TEST_WALLET_ADDRESS,
  NON_MEMBER_WALLET_ADDRESS,
} from "./fixtures/membership.fixtures";
import {
  ACCESS_GRANTED_FIXTURE,
  ACCESS_DENIED_FIXTURE,
  ACCESS_CHECK_PARAMS,
} from "./fixtures/access.fixtures";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@guildpass/sdk", async () => {
  // @ts-expect-error Vitest runs this async mock factory through Vite.
  const { mockSdkModule } = await import("./fixtures/sdk.mock");
  return mockSdkModule();
});
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: "https://api.guildpass.test", chainId: 1 } } },
}));

import { guildPassClient } from "../src/lib/guildpassClient";
import { GuildPassClient } from "@guildpass/sdk";

// ---------------------------------------------------------------------------
// 1. GuildPassClient instantiation contract
// ---------------------------------------------------------------------------

describe("SDK Contract – GuildPassClient instantiation", () => {
  it("GuildPassClient is exported as a named export from @guildpass/sdk", () => {
    expect(GuildPassClient).toBeDefined();
    expect(typeof GuildPassClient).toBe("function");
  });

  it("accepts { apiUrl, chainId } as constructor options", () => {
    // The constructor is called with these options in src/lib/guildpassClient.ts
    expect(GuildPassClient).toHaveBeenCalledWith(
      expect.objectContaining({
        apiUrl: expect.any(String),
        chainId: expect.any(Number),
      }),
    );
  });

  it("guildPassClient singleton exposes all required namespaces", () => {
    expect(guildPassClient).toHaveProperty("guilds");
    expect(guildPassClient).toHaveProperty("roles");
    expect(guildPassClient).toHaveProperty("membership");
    expect(guildPassClient).toHaveProperty("access");
  });
});

// ---------------------------------------------------------------------------
// 2. guilds namespace contract
// ---------------------------------------------------------------------------

describe("SDK Contract – guilds namespace", () => {
  let sdk: SdkMock;

  beforeEach(() => {
    sdk = createSdkMock();
  });

  afterEach(() => {
    resetSdkMock();
    vi.clearAllMocks();
  });

  // ── Method existence ──────────────────────────────────────────────────────

  it("exposes client.guilds.getGuild as a function", () => {
    expect(typeof guildPassClient.guilds.getGuild).toBe("function");
  });

  it("exposes client.guilds.getGuildConfig as a function", () => {
    expect(typeof guildPassClient.guilds.getGuildConfig).toBe("function");
  });

  // ── getGuild argument contract ────────────────────────────────────────────

  it("getGuild accepts { guildId: string } and resolves", async () => {
    await expect(guildPassClient.guilds.getGuild({ guildId: "guild_abc" })).resolves.toBeDefined();

    expect(sdk.guilds.getGuild).toHaveBeenCalledWith({ guildId: "guild_abc" });
  });

  // ── getGuild response contract ────────────────────────────────────────────

  it("getGuild response includes id (string)", async () => {
    const result = await guildPassClient.guilds.getGuild({ guildId: "guild_abc" });
    expect(typeof result.id).toBe("string");
  });

  it("getGuild response includes name (string)", async () => {
    const result = await guildPassClient.guilds.getGuild({ guildId: "guild_abc" });
    expect(typeof result.name).toBe("string");
  });

  it("getGuild response includes ownerAddress (string)", async () => {
    const result = await guildPassClient.guilds.getGuild({ guildId: "guild_abc" });
    expect(typeof result.ownerAddress).toBe("string");
    // GuildDetail screen truncates this – must be at least 42 chars (EVM address)
    expect(result.ownerAddress.length).toBeGreaterThanOrEqual(42);
  });

  it("getGuild response includes chainId (number)", async () => {
    const result = await guildPassClient.guilds.getGuild({ guildId: "guild_abc" });
    expect(typeof result.chainId).toBe("number");
  });

  it("getGuild response includes isActive (boolean)", async () => {
    const result = await guildPassClient.guilds.getGuild({ guildId: "guild_abc" });
    expect(typeof result.isActive).toBe("boolean");
  });

  it("getGuild response includes description (string, may be empty)", async () => {
    const result = await guildPassClient.guilds.getGuild({ guildId: "guild_abc" });
    // Screen falls back to "No description provided." when falsy – so undefined is also acceptable
    expect(typeof result.description === "string" || result.description == null).toBe(true);
  });

  // ── getGuildConfig response contract ─────────────────────────────────────

  it("getGuildConfig response includes guildId, requiredRoles (array), and accessPolicy", async () => {
    const result = await guildPassClient.guilds.getGuildConfig({ guildId: "guild_abc" });

    expect(result).toStrictEqual(GUILD_CONFIG_FIXTURE);
    expect(typeof result.guildId).toBe("string");
    expect(Array.isArray(result.requiredRoles)).toBe(true);
    expect(["any", "all"]).toContain(result.accessPolicy);
  });
});

// ---------------------------------------------------------------------------
// 3. roles namespace contract
// ---------------------------------------------------------------------------

describe("SDK Contract – roles namespace", () => {
  let sdk: SdkMock;

  beforeEach(() => {
    sdk = createSdkMock();
  });

  afterEach(() => {
    resetSdkMock();
    vi.clearAllMocks();
  });

  it("exposes client.roles.getRoles as a function", () => {
    expect(typeof guildPassClient.roles.getRoles).toBe("function");
  });

  it("exposes client.roles.getUserRoles as a function", () => {
    expect(typeof guildPassClient.roles.getUserRoles).toBe("function");
  });

  // ── getRoles argument + response contract ─────────────────────────────────

  it("getRoles accepts { guildId: string } and resolves to an array", async () => {
    const result = await guildPassClient.roles.getRoles({ guildId: "guild_abc" });

    expect(sdk.roles.getRoles).toHaveBeenCalledWith({ guildId: "guild_abc" });
    expect(Array.isArray(result)).toBe(true);
  });

  it("each role in getRoles response has id (string), name (string), guildId (string)", async () => {
    const result = await guildPassClient.roles.getRoles({ guildId: "guild_abc" });

    expect(result.length).toBeGreaterThan(0);
    result.forEach((role: { id: string; name: string; guildId: string }) => {
      expect(typeof role.id).toBe("string");
      expect(typeof role.name).toBe("string");
      expect(typeof role.guildId).toBe("string");
    });
  });

  it("getRoles resolves to empty array (not null/undefined) when no roles exist", async () => {
    sdk.roles.getRoles.mockResolvedValueOnce(ROLES_EMPTY_FIXTURE);
    const result = await guildPassClient.roles.getRoles({ guildId: "guild_xyz" });

    expect(Array.isArray(result)).toBe(true);
    expect(result).toStrictEqual([]);
  });

  // ── getUserRoles argument + response contract ─────────────────────────────

  it("getUserRoles accepts { walletAddress: string, guildId: string } and resolves to an array", async () => {
    const params = { walletAddress: TEST_WALLET_ADDRESS, guildId: "guild_abc" };
    const result = await guildPassClient.roles.getUserRoles(params);

    expect(sdk.roles.getUserRoles).toHaveBeenCalledWith(params);
    expect(Array.isArray(result)).toBe(true);
  });

  it("each role in getUserRoles response has walletAddress matching the query", async () => {
    const result = await guildPassClient.roles.getUserRoles({
      walletAddress: TEST_WALLET_ADDRESS,
      guildId: "guild_abc",
    });

    result.forEach((role: { walletAddress: string }) => {
      expect(role.walletAddress).toBe(TEST_WALLET_ADDRESS);
    });
  });

  it("getUserRoles resolves to empty array for a wallet with no roles in that guild", async () => {
    sdk.roles.getUserRoles.mockResolvedValueOnce(USER_ROLES_EMPTY_FIXTURE);

    const result = await guildPassClient.roles.getUserRoles({
      walletAddress: NON_MEMBER_WALLET_ADDRESS,
      guildId: "guild_abc",
    });

    expect(result).toStrictEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. membership namespace contract
// ---------------------------------------------------------------------------

describe("SDK Contract – membership namespace", () => {
  let sdk: SdkMock;

  beforeEach(() => {
    sdk = createSdkMock();
  });

  afterEach(() => {
    resetSdkMock();
    vi.clearAllMocks();
  });

  it("exposes client.membership.getMembership as a function", () => {
    expect(typeof guildPassClient.membership.getMembership).toBe("function");
  });

  it("getMembership accepts { walletAddress: string, guildId: string }", async () => {
    const params = { walletAddress: TEST_WALLET_ADDRESS, guildId: "guild_abc" };
    await guildPassClient.membership.getMembership(params);
    expect(sdk.membership.getMembership).toHaveBeenCalledWith(params);
  });

  it("getMembership response includes isActive (boolean) – the primary field the screen reads", async () => {
    const result = await guildPassClient.membership.getMembership({
      walletAddress: TEST_WALLET_ADDRESS,
      guildId: "guild_abc",
    });
    expect(typeof result.isActive).toBe("boolean");
  });

  it("getMembership returns isActive: true for an active member", async () => {
    const result = await guildPassClient.membership.getMembership({
      walletAddress: TEST_WALLET_ADDRESS,
      guildId: "guild_abc",
    });
    expect(result.isActive).toBe(true);
  });

  it("getMembership returns isActive: false for a non-member (resolves, does not throw)", async () => {
    sdk.membership.getMembership.mockResolvedValueOnce(MEMBERSHIP_INACTIVE_FIXTURE);

    await expect(
      guildPassClient.membership.getMembership({
        walletAddress: NON_MEMBER_WALLET_ADDRESS,
        guildId: "guild_abc",
      }),
    ).resolves.toMatchObject({ isActive: false });
  });

  it("getMembership response includes walletAddress and guildId for cache-key validation", async () => {
    const result = await guildPassClient.membership.getMembership({
      walletAddress: TEST_WALLET_ADDRESS,
      guildId: "guild_abc",
    });

    expect(result.walletAddress).toBe(TEST_WALLET_ADDRESS);
    expect(result.guildId).toBe("guild_abc");
  });
});

// ---------------------------------------------------------------------------
// 5. access namespace contract
// ---------------------------------------------------------------------------

describe("SDK Contract – access namespace", () => {
  let sdk: SdkMock;

  beforeEach(() => {
    sdk = createSdkMock();
  });

  afterEach(() => {
    resetSdkMock();
    vi.clearAllMocks();
  });

  it("exposes client.access.checkAccess as a function", () => {
    expect(typeof guildPassClient.access.checkAccess).toBe("function");
  });

  it("checkAccess accepts { walletAddress, guildId, resourceId } – all three required", async () => {
    await guildPassClient.access.checkAccess(ACCESS_CHECK_PARAMS);
    expect(sdk.access.checkAccess).toHaveBeenCalledWith(ACCESS_CHECK_PARAMS);
  });

  it("checkAccess response includes hasAccess (boolean)", async () => {
    const result = await guildPassClient.access.checkAccess(ACCESS_CHECK_PARAMS);
    expect(typeof result.hasAccess).toBe("boolean");
  });

  it("checkAccess response includes matchedRoles (string[])", async () => {
    const result = await guildPassClient.access.checkAccess(ACCESS_CHECK_PARAMS);
    expect(Array.isArray(result.matchedRoles)).toBe(true);
    result.matchedRoles.forEach((r: unknown) => expect(typeof r).toBe("string"));
  });

  it("checkAccess response includes requiredRoles (string[])", async () => {
    const result = await guildPassClient.access.checkAccess(ACCESS_CHECK_PARAMS);
    expect(Array.isArray(result.requiredRoles)).toBe(true);
  });

  it("checkAccess granted: hasAccess true, matchedRoles non-empty", async () => {
    const result = await guildPassClient.access.checkAccess(ACCESS_CHECK_PARAMS);

    expect(result).toStrictEqual(ACCESS_GRANTED_FIXTURE);
    expect(result.hasAccess).toBe(true);
    expect(result.matchedRoles.length).toBeGreaterThan(0);
  });

  it("checkAccess denied: hasAccess false, matchedRoles empty (resolves, does not throw)", async () => {
    sdk.access.checkAccess.mockResolvedValueOnce(ACCESS_DENIED_FIXTURE);

    const result = await guildPassClient.access.checkAccess(ACCESS_CHECK_PARAMS);

    expect(result.hasAccess).toBe(false);
    expect(result.matchedRoles).toStrictEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 6. Cross-cutting: response shape completeness
// ---------------------------------------------------------------------------

describe("SDK Contract – response shape completeness (all fields screen components need)", () => {
  let sdk: SdkMock;

  beforeEach(() => {
    sdk = createSdkMock();
  });

  afterEach(() => {
    resetSdkMock();
    vi.clearAllMocks();
  });

  it("GuildDetail screen fields: guild.name, description, ownerAddress, chainId", async () => {
    const guild = await guildPassClient.guilds.getGuild({ guildId: "guild_abc" });

    // These exact field names are read by app/guilds/[guildId].tsx
    expect(guild.name).toBeDefined();
    expect(typeof guild.description === "string" || guild.description == null).toBe(true);
    expect(guild.ownerAddress).toBeDefined();
    expect(guild.chainId).toBeDefined();
  });

  it("GuildCard fields: guild.id, name, isActive, (roleCount is derived from roles query, not guild)", async () => {
    const guild = await guildPassClient.guilds.getGuild({ guildId: "guild_abc" });

    expect(guild.id).toBeDefined();
    expect(guild.name).toBeDefined();
    expect(typeof guild.isActive).toBe("boolean");
  });

  it("RoleBadge fields: role.id (key), role.name (displayed label)", async () => {
    const roles = await guildPassClient.roles.getRoles({ guildId: "guild_abc" });

    roles.forEach((role: { id: string; name: string }) => {
      expect(role.id).toBeDefined(); // used as React key
      expect(role.name).toBeDefined(); // displayed text in RoleBadge
    });
  });

  it("AccessStatusCard fields: hasAccess, reason, matchedRoles, requiredRoles", async () => {
    const granted = await guildPassClient.access.checkAccess(ACCESS_CHECK_PARAMS);

    // Every prop AccessStatusCard accepts must exist on the response
    expect("hasAccess" in granted).toBe(true);
    expect("matchedRoles" in granted).toBe(true);
    expect("requiredRoles" in granted).toBe(true);

    sdk.access.checkAccess.mockResolvedValueOnce(ACCESS_DENIED_FIXTURE);
    const denied = await guildPassClient.access.checkAccess(ACCESS_CHECK_PARAMS);

    expect("hasAccess" in denied).toBe(true);
    expect("reason" in denied).toBe(true);
    expect("matchedRoles" in denied).toBe(true);
    expect("requiredRoles" in denied).toBe(true);
  });

  it("Membership card fields: membership.isActive", async () => {
    const membership = await guildPassClient.membership.getMembership({
      walletAddress: TEST_WALLET_ADDRESS,
      guildId: "guild_abc",
    });

    // app/guilds/[guildId].tsx reads membership?.isActive
    expect("isActive" in membership).toBe(true);
  });
});
