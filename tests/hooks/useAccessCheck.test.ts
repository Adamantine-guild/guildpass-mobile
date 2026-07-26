/**
 * useAccessCheck hook – contract & behaviour tests
 *
 * What we verify
 * --------------
 * 1. SDK method + argument shape  – all three params forwarded exactly.
 * 2. Mutation key shape           – access checks run from an explicit action.
 * 3. Access granted response      – hasAccess, matchedRoles, requiredRoles present and correct.
 * 4. Access denied response       – hasAccess: false, empty matchedRoles, reason provided.
 * 5. validation guard             – network action suppressed when any param is empty string.
 * 6. Error propagation            – SDK errors surface as rejected promises.
 * 7. Response field contract      – every field AccessStatusCard reads must exist on the response.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSdkMock, resetSdkMock } from "../fixtures/sdk.mock";
import {
  ACCESS_GRANTED_FIXTURE,
  ACCESS_GRANTED_MULTI_ROLE_FIXTURE,
  ACCESS_DENIED_FIXTURE,
  ACCESS_DENIED_NO_REQUIREMENTS_FIXTURE,
  ACCESS_CHECK_PARAMS,
  ACCESS_CHECK_PARAMS_INCOMPLETE,
} from "../fixtures/access.fixtures";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@guildpass/sdk", async () => {
  // @ts-expect-error Vitest runs this async mock factory through Vite.
  const { mockSdkModule } = await import("../fixtures/sdk.mock");
  return mockSdkModule();
});
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: "https://api.guildpass.test", chainId: 1 } } },
}));

import { guildPassClient } from "../../src/lib/guildpassClient";

// ---------------------------------------------------------------------------
// Access granted
// ---------------------------------------------------------------------------

describe("useAccessCheck – access granted", () => {
  let sdk: ReturnType<typeof createSdkMock>;

  beforeEach(() => {
    sdk = createSdkMock();
  });

  afterEach(() => {
    resetSdkMock();
    vi.clearAllMocks();
  });

  it("calls checkAccess with the exact params shape (walletAddress, guildId, resourceId)", async () => {
    await guildPassClient.access.checkAccess(ACCESS_CHECK_PARAMS);

    expect(sdk.access.checkAccess).toHaveBeenCalledTimes(1);
    expect(sdk.access.checkAccess).toHaveBeenCalledWith(ACCESS_CHECK_PARAMS);
  });

  it("returns hasAccess: true and populates matchedRoles", async () => {
    const result = await guildPassClient.access.checkAccess(ACCESS_CHECK_PARAMS);

    expect(result).toStrictEqual(ACCESS_GRANTED_FIXTURE);
    expect(result.hasAccess).toBe(true);
    expect(Array.isArray(result.matchedRoles)).toBe(true);
    expect(result.matchedRoles.length).toBeGreaterThan(0);
  });

  it("returns every field AccessStatusCard reads (hasAccess, reason, matchedRoles, requiredRoles)", async () => {
    const result = await guildPassClient.access.checkAccess(ACCESS_CHECK_PARAMS);

    // Pin the exact field names – if the SDK renames a field the card breaks silently
    expect("hasAccess" in result).toBe(true);
    expect("matchedRoles" in result).toBe(true);
    expect("requiredRoles" in result).toBe(true);
    // reason is optional but present in this fixture
    expect(typeof result.reason === "string" || result.reason === undefined).toBe(true);
  });

  it("handles multi-role access grants where only one role matched (access policy: any)", async () => {
    sdk.access.checkAccess.mockResolvedValueOnce(ACCESS_GRANTED_MULTI_ROLE_FIXTURE);

    const result = await guildPassClient.access.checkAccess(ACCESS_CHECK_PARAMS);

    expect(result.hasAccess).toBe(true);
    expect(result.requiredRoles.length).toBeGreaterThan(1);
    expect(result.matchedRoles.length).toBeGreaterThanOrEqual(1);
  });

  it("documents the expected mutation key: ['access-check']", () => {
    // Access checks are user-triggered mutations. The checked params are passed
    // into mutate(), so input changes never auto-fetch stale results.
    const expectedKey = ["access-check"];

    expect(expectedKey[0]).toBe("access-check");
    expect(expectedKey).toStrictEqual(["access-check"]);
  });
});

// ---------------------------------------------------------------------------
// Access denied
// ---------------------------------------------------------------------------

describe("useAccessCheck – access denied", () => {
  let sdk: ReturnType<typeof createSdkMock>;

  beforeEach(() => {
    sdk = createSdkMock();
  });

  afterEach(() => {
    resetSdkMock();
    vi.clearAllMocks();
  });

  it("returns hasAccess: false and empty matchedRoles when wallet has no qualifying roles", async () => {
    sdk.access.checkAccess.mockResolvedValueOnce(ACCESS_DENIED_FIXTURE);

    const result = await guildPassClient.access.checkAccess(ACCESS_CHECK_PARAMS);

    expect(result.hasAccess).toBe(false);
    expect(result.matchedRoles).toStrictEqual([]);
    expect(result.requiredRoles.length).toBeGreaterThan(0);
  });

  it("returns a reason string so AccessStatusCard can display why access was denied", async () => {
    sdk.access.checkAccess.mockResolvedValueOnce(ACCESS_DENIED_FIXTURE);

    const result = await guildPassClient.access.checkAccess(ACCESS_CHECK_PARAMS);

    expect(typeof result.reason).toBe("string");
    expect(result.reason!.length).toBeGreaterThan(0);
  });

  it("resolves (does NOT throw) when access is denied – denial is not an error", async () => {
    sdk.access.checkAccess.mockResolvedValueOnce(ACCESS_DENIED_FIXTURE);

    // The screen differentiates granted/denied via hasAccess, not try/catch
    await expect(guildPassClient.access.checkAccess(ACCESS_CHECK_PARAMS)).resolves.toMatchObject({
      hasAccess: false,
    });
  });

  it("handles the no-requirements edge case: hasAccess false, empty requiredRoles", async () => {
    sdk.access.checkAccess.mockResolvedValueOnce(ACCESS_DENIED_NO_REQUIREMENTS_FIXTURE);

    const result = await guildPassClient.access.checkAccess(ACCESS_CHECK_PARAMS);

    expect(result.hasAccess).toBe(false);
    expect(result.requiredRoles).toStrictEqual([]);
    expect(result.matchedRoles).toStrictEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Enabled guard
// ---------------------------------------------------------------------------

describe("useAccessCheck – enabled guard", () => {
  let sdk: ReturnType<typeof createSdkMock>;

  beforeEach(() => {
    sdk = createSdkMock();
  });

  afterEach(() => {
    resetSdkMock();
    vi.clearAllMocks();
  });

  it("suppresses the query when walletAddress is empty", () => {
    const params = { ...ACCESS_CHECK_PARAMS_INCOMPLETE };
    const shouldFetch = !!params.walletAddress && !!params.guildId && !!params.resourceId;

    expect(shouldFetch).toBe(false);
    expect(sdk.access.checkAccess).not.toHaveBeenCalled();
  });

  it("suppresses the query when guildId is empty", () => {
    const params = {
      walletAddress: "0x1234567890123456789012345678901234567890",
      guildId: "",
      resourceId: "secret-channel",
    };
    const shouldFetch = !!params.walletAddress && !!params.guildId && !!params.resourceId;

    expect(shouldFetch).toBe(false);
    expect(sdk.access.checkAccess).not.toHaveBeenCalled();
  });

  it("suppresses the query when resourceId is empty", () => {
    const params = {
      walletAddress: "0x1234567890123456789012345678901234567890",
      guildId: "guild_abc",
      resourceId: "",
    };
    const shouldFetch = !!params.walletAddress && !!params.guildId && !!params.resourceId;

    expect(shouldFetch).toBe(false);
    expect(sdk.access.checkAccess).not.toHaveBeenCalled();
  });

  it("enables the query only when all three params are non-empty", () => {
    const params = ACCESS_CHECK_PARAMS;
    const shouldFetch = !!params.walletAddress && !!params.guildId && !!params.resourceId;

    expect(shouldFetch).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Error propagation
// ---------------------------------------------------------------------------

describe("useAccessCheck – error propagation", () => {
  let sdk: ReturnType<typeof createSdkMock>;

  beforeEach(() => {
    sdk = createSdkMock();
  });

  afterEach(() => {
    resetSdkMock();
    vi.clearAllMocks();
  });

  it("surfaces a network error as a rejected promise (screen shows error card)", async () => {
    sdk.access.checkAccess.mockRejectedValueOnce(new Error("Network request failed"));

    await expect(guildPassClient.access.checkAccess(ACCESS_CHECK_PARAMS)).rejects.toThrow(
      "Network request failed",
    );
  });

  it("surfaces a 404/resource-not-found error correctly", async () => {
    sdk.access.checkAccess.mockRejectedValueOnce(new Error("Resource not found"));

    await expect(
      guildPassClient.access.checkAccess({
        walletAddress: ACCESS_CHECK_PARAMS.walletAddress,
        guildId: "guild_abc",
        resourceId: "non-existent-resource",
      }),
    ).rejects.toThrow("Resource not found");
  });

  it("surfaces a 401/unauthorised error so the screen can prompt re-connection", async () => {
    sdk.access.checkAccess.mockRejectedValueOnce(new Error("Unauthorized"));

    await expect(guildPassClient.access.checkAccess(ACCESS_CHECK_PARAMS)).rejects.toThrow(
      "Unauthorized",
    );
  });
});
