import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildRoleEligibilityResolutionPlan,
  type RoleEligibilityResolutionPlan,
  useMultiChainRoleEligibility,
} from "../../src/features/access/useMultiChainRoleEligibility";

const guildPassClientMock = vi.hoisted(() => ({
  getRoles: vi.fn(),
}));

const rpcConfigMock = vi.hoisted(() => {
  const defaultTimeouts = {
    roleResolverPerChainTimeoutMs: 75,
    roleResolverRpcAttemptTimeoutMs: 50,
    roleResolverBackoffBaseDelayMs: 0,
    roleResolverBackoffMaxDelayMs: 0,
    roleResolverMaxAttemptsPerEndpoint: 0,
  };

  return {
    defaultTimeouts,
    getRpcsForChain: vi.fn((_chainId: number) => [] as string[]),
    timeouts: { ...defaultTimeouts },
  };
});

vi.mock("../../src/lib/guildpassClient", () => ({
  guildPassClient: {
    roles: {
      getRoles: guildPassClientMock.getRoles,
    },
  },
}));

vi.mock("../../src/config/rpcConfig", () => ({
  getRpcsForChain: rpcConfigMock.getRpcsForChain,
  rpcConfig: {
    timeouts: rpcConfigMock.timeouts,
  },
}));

const ROLE_REQUIREMENT = {
  type: "ROLE" as const,
  address: "0x1234567890123456789012345678901234567890",
  id: "1",
};

const ROLE_REQUIREMENT_2 = {
  ...ROLE_REQUIREMENT,
  id: "2",
};

const WALLET_ADDRESS = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

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

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

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
    rpcConfigMock.getRpcsForChain.mockReset().mockReturnValue([]);
    Object.assign(rpcConfigMock.timeouts, rpcConfigMock.defaultTimeouts);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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

  it("publishes a successful chain while another chain is still waiting on its timeout", async () => {
    vi.useFakeTimers();
    guildPassClientMock.getRoles.mockResolvedValue([
      {
        id: "role-eth",
        name: "Ethereum Role",
        chainId: 1,
        requirements: [ROLE_REQUIREMENT],
      },
      {
        id: "role-optimism",
        name: "Optimism Role",
        chainId: 10,
        requirements: [ROLE_REQUIREMENT_2],
      },
    ]);
    rpcConfigMock.getRpcsForChain.mockImplementation((chainId: number) =>
      chainId === 1 ? ["https://rpc.ethereum.test"] : ["https://rpc.optimism.test"],
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((rpcUrl) => {
      if (String(rpcUrl).includes("ethereum")) {
        return Promise.resolve({
          json: async () => ({ result: "0x1" }),
        } as Response);
      }

      return new Promise<Response>(() => {});
    });
    const hook = await renderHook();
    let resolution: Promise<void> | undefined;

    await act(async () => {
      resolution = hook.current.resolve(
        "guild-1",
        WALLET_ADDRESS,
      );
      await flushMicrotasks();
    });

    expect(hook.current.perChain).toContainEqual({
      chainId: 1,
      status: "resolved",
      resolvedRoles: ["1"],
    });
    expect(hook.current.perChain.find((chain) => chain.chainId === 10)).toBeUndefined();
    expect(hook.current.isResolving).toBe(true);
    expect(hook.current.resolvingChainIds).toContain(10);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(80);
      await resolution;
    });

    expect(hook.current.perChain).toEqual([
      {
        chainId: 1,
        status: "resolved",
        resolvedRoles: ["1"],
      },
      {
        chainId: 10,
        status: "timed-out",
        errorMessage: "RPC attempt timed out after 50ms",
      },
    ]);
    expect(hook.current.isResolving).toBe(false);
    expect(hook.current.resolvingChainIds).toEqual([]);
    const ethereumCall = fetchSpy.mock.calls.find(([rpcUrl]) =>
      String(rpcUrl).includes("ethereum"),
    );
    const ethereumPayload = JSON.parse(String((ethereumCall?.[1] as RequestInit).body));
    expect(ethereumPayload.params[0].to).toBe(ROLE_REQUIREMENT.address);
    expect(ethereumPayload.params[0].data).toContain(
      WALLET_ADDRESS.slice(2).toLowerCase().padStart(64, "0"),
    );

    fetchSpy.mockRestore();
    hook.unmount();
  });

  it("retries one failed chain without replacing successful sibling results", async () => {
    guildPassClientMock.getRoles.mockResolvedValue([
      {
        id: "role-eth",
        name: "Ethereum Role",
        chainId: 1,
        requirements: [ROLE_REQUIREMENT],
      },
      {
        id: "role-optimism",
        name: "Optimism Role",
        chainId: 10,
        requirements: [ROLE_REQUIREMENT_2],
      },
    ]);
    rpcConfigMock.getRpcsForChain.mockImplementation((chainId: number) =>
      chainId === 1 ? ["https://rpc.ethereum.test"] : ["https://rpc.optimism.test"],
    );
    let optimismAttempts = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((rpcUrl) => {
      if (String(rpcUrl).includes("ethereum")) {
        return Promise.resolve({
          json: async () => ({ result: "0x1" }),
        } as Response);
      }

      optimismAttempts += 1;
      if (optimismAttempts === 1) {
        return Promise.reject(new Error("Optimism RPC provider error"));
      }

      return Promise.resolve({
        json: async () => ({ result: "0x1" }),
      } as Response);
    });
    const hook = await renderHook();

    await act(async () => {
      await hook.current.resolve("guild-1", WALLET_ADDRESS);
    });

    expect(hook.current.perChain).toEqual([
      {
        chainId: 1,
        status: "resolved",
        resolvedRoles: ["1"],
      },
      {
        chainId: 10,
        status: "error",
        errorMessage: "Optimism RPC provider error",
      },
    ]);

    await act(async () => {
      await hook.current.retryChain(10);
    });

    expect(hook.current.perChain).toEqual([
      {
        chainId: 1,
        status: "resolved",
        resolvedRoles: ["1"],
      },
      {
        chainId: 10,
        status: "resolved",
        resolvedRoles: ["2"],
      },
    ]);

    fetchSpy.mockRestore();
    hook.unmount();
  });
});
