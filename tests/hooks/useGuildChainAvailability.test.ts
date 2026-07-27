import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGuildChainAvailability } from "../../src/features/guilds/useGuildChainAvailability";

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
      getRoles: vi.fn(),
    },
  },
}));

vi.mock("../../src/config/rpcConfig", () => ({
  getRpcsForChain: rpcConfigMock.getRpcsForChain,
  rpcConfig: {
    timeouts: rpcConfigMock.timeouts,
  },
}));

const roles = [
  {
    id: "role-eth",
    name: "Ethereum Role",
    chainId: 1,
    requirements: [
      {
        type: "ROLE" as const,
        address: "0x1234567890123456789012345678901234567890",
        id: "1",
      },
    ],
  },
  {
    id: "role-optimism",
    name: "Optimism Role",
    chainId: 10,
    requirements: [
      {
        type: "ROLE" as const,
        address: "0x1234567890123456789012345678901234567890",
        id: "2",
      },
    ],
  },
];

const WALLET_ADDRESS = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

type HookResult = ReturnType<typeof useGuildChainAvailability>;

let hookResult: HookResult | undefined;

function HookHarness() {
  hookResult = useGuildChainAvailability({
    guildId: "guild-1",
    walletAddress: WALLET_ADDRESS,
    roles,
  });
  return null;
}

async function renderHook() {
  let renderer: ReactTestRenderer;

  await act(async () => {
    renderer = TestRenderer.create(React.createElement(HookHarness));
    await Promise.resolve();
    await Promise.resolve();
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

describe("useGuildChainAvailability", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hookResult = undefined;
    rpcConfigMock.getRpcsForChain.mockReset();
    Object.assign(rpcConfigMock.timeouts, rpcConfigMock.defaultTimeouts);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("publishes healthy chains while a sibling chain is still waiting on its timeout", async () => {
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

    expect(hook.current.perChain).toContainEqual({
      chainId: 1,
      status: "resolved",
      resolvedRoles: ["1"],
    });
    expect(hook.current.perChain.find((chain) => chain.chainId === 10)).toBeUndefined();
    expect(hook.current.isChecking).toBe(true);
    expect(hook.current.checkingChainIds).toContain(10);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(80);
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
    expect(hook.current.isChecking).toBe(false);
    expect(hook.current.checkingChainIds).toEqual([]);
    const ethereumCall = fetchSpy.mock.calls.find(([rpcUrl]) =>
      String(rpcUrl).includes("ethereum"),
    );
    const ethereumPayload = JSON.parse(String((ethereumCall?.[1] as RequestInit).body));
    expect(ethereumPayload.params[0].data).toContain(
      WALLET_ADDRESS.slice(2).toLowerCase().padStart(64, "0"),
    );

    fetchSpy.mockRestore();
    hook.unmount();
  });
});
