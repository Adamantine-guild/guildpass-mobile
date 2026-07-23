import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildRoleEligibilityResolutionPlan,
  type RoleEligibilityResolutionPlan,
  useMultiChainRoleEligibility,
} from "../../src/features/access/useMultiChainRoleEligibility";

const guildPassClientMock = vi.hoisted(() => ({
  getRoles: vi.fn(),
}));

vi.mock("../../src/lib/guildpassClient", () => ({
  guildPassClient: {
    roles: {
      getRoles: guildPassClientMock.getRoles,
    },
  },
}));

vi.mock("../../src/config/rpcConfig", () => ({
  getRpcsForChain: vi.fn(() => []),
  rpcConfig: {
    timeouts: {},
  },
}));

const ROLE_REQUIREMENT = {
  type: "ROLE" as const,
  address: "0x1234567890123456789012345678901234567890",
  id: "1",
};

type HookResult = ReturnType<typeof useMultiChainRoleEligibility>;

let hookResult: HookResult | undefined;

function HookHarness() {
  hookResult = useMultiChainRoleEligibility();
  return null;
}

async function renderHook() {
  let renderer: ReactTestRenderer;

  await act(async () => {
    renderer = TestRenderer.create(React.createElement(HookHarness));
  });

  return {
    get current() {
      if (!hookResult) throw new Error("Hook did not render");
      return hookResult;
    },
    unmount() {
      renderer.unmount();
    },
  };
}

describe("buildRoleEligibilityResolutionPlan", () => {
  it("reports a required role with no chainId instead of silently dropping it", () => {
    const plan = buildRoleEligibilityResolutionPlan([
      {
        id: "role-treasurer",
        name: "Treasurer",
        requirements: [ROLE_REQUIREMENT],
      },
    ]);

    expect(plan.requirements).toEqual([]);
    expect(plan.configurationErrors).toEqual([
      {
        chainId: -1,
        status: "error",
        errorMessage: 'Role "Treasurer" (role-treasurer) is missing a valid chain configuration',
      },
    ]);
  });

  it("returns an empty plan when the guild has no on-chain requirements", () => {
    const plan = buildRoleEligibilityResolutionPlan([
      {
        id: "role-member",
        name: "Member",
      },
      {
        id: "role-admin",
        name: "Admin",
        requirements: [],
      },
    ]);

    expect(plan).toEqual<RoleEligibilityResolutionPlan>({
      requirements: [],
      configurationErrors: [],
    });
  });

  it("keeps valid requirements while reporting missing and invalid chain IDs", () => {
    const plan = buildRoleEligibilityResolutionPlan([
      {
        id: "role-member",
        chainId: 8453,
        requirements: [ROLE_REQUIREMENT],
      },
      {
        id: "role-moderator",
        name: "Moderator",
        chainId: 0,
        requirements: [ROLE_REQUIREMENT],
      },
      {
        id: "role-owner",
        name: "Owner",
        chainId: Number.NaN,
        requirements: [ROLE_REQUIREMENT],
      },
    ]);

    expect(plan.requirements).toEqual([
      {
        chainId: 8453,
        requirement: ROLE_REQUIREMENT,
      },
    ]);
    expect(plan.configurationErrors).toEqual([
      {
        chainId: -1,
        status: "error",
        errorMessage: 'Role "Moderator" (role-moderator) is missing a valid chain configuration',
      },
      {
        chainId: -2,
        status: "error",
        errorMessage: 'Role "Owner" (role-owner) is missing a valid chain configuration',
      },
    ]);
  });
});

describe("useMultiChainRoleEligibility", () => {
  beforeEach(() => {
    hookResult = undefined;
    guildPassClientMock.getRoles.mockReset();
  });

  it("publishes a missing-chain configuration error through perChain", async () => {
    guildPassClientMock.getRoles.mockResolvedValue([
      {
        id: "role-treasurer",
        name: "Treasurer",
        requirements: [ROLE_REQUIREMENT],
      },
    ]);
    const hook = await renderHook();

    await act(async () => {
      await hook.current.resolve("guild-1", "0x1234");
    });

    expect(hook.current.perChain).toEqual([
      {
        chainId: -1,
        status: "error",
        errorMessage: 'Role "Treasurer" (role-treasurer) is missing a valid chain configuration',
      },
    ]);
    hook.unmount();
  });

  it("keeps perChain empty when no role has an on-chain requirement", async () => {
    guildPassClientMock.getRoles.mockResolvedValue([
      {
        id: "role-member",
        name: "Member",
      },
      {
        id: "role-admin",
        name: "Admin",
        requirements: [],
      },
    ]);
    const hook = await renderHook();

    await act(async () => {
      await hook.current.resolve("guild-1", "0x1234");
    });

    expect(hook.current.perChain).toEqual([]);
    hook.unmount();
  });

  it("surfaces a no-RPC error without making an RPC request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    guildPassClientMock.getRoles.mockResolvedValue([
      {
        id: "role-member",
        chainId: 8453,
        requirements: [ROLE_REQUIREMENT],
      },
    ]);
    const hook = await renderHook();

    await act(async () => {
      await hook.current.resolve("guild-1", "0x1234");
    });

    expect(hook.current.perChain).toEqual([
      {
        chainId: 8453,
        status: "error",
        errorMessage: "No RPC endpoints configured",
      },
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    hook.unmount();
  });
});
