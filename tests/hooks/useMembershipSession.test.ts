/**
 * useMembership – session binding (security boundary).
 *
 * The membership/roles queries must use the PROVEN session address and reject a
 * query for a different address (the original gap: a malicious client querying
 * arbitrary addresses). The guard lives in `assertSessionAddress` (pure, reads
 * the session store), and `useMembership` forwards its result to the SDK call.
 *
 * We test the guard directly for the rejection cases (deterministic, no React
 * tree needed) and render the hook inside a QueryClient/React tree to confirm
 * the bound address is what reaches the SDK for the happy path.
 */

import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createSdkMock, resetSdkMock } from "../fixtures/sdk.mock";
import {
  MEMBERSHIP_ACTIVE_FIXTURE,
  USER_ROLES_FIXTURE,
  TEST_WALLET_ADDRESS,
} from "../fixtures/membership.fixtures";
import { useSessionStore } from "../../src/features/session/session.store";
import { assertSessionAddress, useMembership } from "../../src/features/membership/useMembership";

vi.mock("@guildpass/sdk", async () => {
  // @ts-expect-error Vitest runs this async mock factory through Vite.
  const { mockSdkModule } = await import("../fixtures/sdk.mock");
  return mockSdkModule();
});
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: "https://api.guildpass.test", chainId: 1 } } },
}));

function setSession(address: string | null) {
  useSessionStore.setState({ walletAddress: address, status: "authenticated" });
}

// Renders useMembership inside a real React/QueryClient tree (useQuery needs a
// context) with fetching disabled, then exposes the membership + roles queries.
function Harness({
  requested,
  capture,
}: {
  requested: string | null;
  capture: (q: {
    membership: ReturnType<ReturnType<typeof useMembership>["useMembershipQuery"]>;
    roles: ReturnType<ReturnType<typeof useMembership>["useUserRoles"]>;
  }) => void;
}) {
  const { useMembershipQuery, useUserRoles } = useMembership(requested, false);
  capture({ membership: useMembershipQuery("guild_abc"), roles: useUserRoles("guild_abc") });
  return null;
}

describe("useMembership – session-binding guard (assertSessionAddress)", () => {
  beforeEach(() => {
    createSdkMock();
  });
  afterEach(() => {
    resetSdkMock();
    vi.clearAllMocks();
    useSessionStore.setState({ walletAddress: null, status: "unauthenticated" });
  });

  it("returns the proven session address when no explicit address is requested", () => {
    setSession(TEST_WALLET_ADDRESS);
    expect(assertSessionAddress(null)).toBe(TEST_WALLET_ADDRESS);
    expect(assertSessionAddress(undefined)).toBe(TEST_WALLET_ADDRESS);
  });

  it("allows an explicit address that matches the session", () => {
    setSession(TEST_WALLET_ADDRESS);
    expect(assertSessionAddress(TEST_WALLET_ADDRESS)).toBe(TEST_WALLET_ADDRESS);
  });

  it("REJECTS an explicit address that differs from the session", () => {
    setSession(TEST_WALLET_ADDRESS);
    expect(() => assertSessionAddress("0x000000000000000000000000000000000000dead")).toThrow(
      /does not match the authenticated session/,
    );
  });

  it("throws when there is no authenticated session", () => {
    setSession(null);
    expect(() => assertSessionAddress(null)).toThrow(/No authenticated session/);
  });
});

describe("useMembership – bound SDK call (rendered hook)", () => {
  let sdk: ReturnType<typeof createSdkMock>;
  let queryClient: QueryClient;
  let renderer: ReactTestRenderer;

  beforeEach(() => {
    sdk = createSdkMock();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    setSession(TEST_WALLET_ADDRESS);
  });

  afterEach(() => {
    resetSdkMock();
    vi.clearAllMocks();
    useSessionStore.setState({ walletAddress: null, status: "unauthenticated" });
    if (renderer) {
      act(() => renderer.unmount());
    }
  });

  function mount(requested: string | null) {
    let captured: any;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(Harness, {
            requested,
            capture: (q: any) => {
              captured = q;
            },
          }),
        ),
      );
    });
    return captured as {
      membership: { refetch: () => Promise<{ data?: unknown }> };
      roles: { refetch: () => Promise<{ data?: unknown }> };
    };
  }

  it("queries membership for the session address (not a raw arg)", async () => {
    const { membership } = mount(null);
    await membership.refetch();

    expect(sdk.membership.getMembership).toHaveBeenCalledWith({
      walletAddress: TEST_WALLET_ADDRESS,
      guildId: "guild_abc",
    });
  });

  it("queries user roles for the session address", async () => {
    const { roles } = mount(null);
    await roles.refetch();

    expect(sdk.roles.getUserRoles).toHaveBeenCalledWith({
      walletAddress: TEST_WALLET_ADDRESS,
      guildId: "guild_abc",
    });
  });

  it("resolves the membership fixture for the session address", async () => {
    const { membership } = mount(null);
    const { data } = await membership.refetch();
    expect(data).toStrictEqual(MEMBERSHIP_ACTIVE_FIXTURE);
  });

  it("resolves user roles for the session address", async () => {
    const { roles } = mount(null);
    const { data } = await roles.refetch();
    expect(data).toStrictEqual(USER_ROLES_FIXTURE);
  });
});
