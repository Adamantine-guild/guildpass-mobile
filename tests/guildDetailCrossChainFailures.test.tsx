import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GuildDetail from "../app/guilds/[guildId]";

const routerMocks = vi.hoisted(() => ({
  back: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));

const searchParams = vi.hoisted(() => ({
  guildId: "guild-alpha",
}));

const walletState = vi.hoisted(() => ({
  walletAddress: "0x1234567890123456789012345678901234567890",
  isConnected: true,
  isHydrated: true,
}));

const screenData = vi.hoisted(() => ({
  guild: {
    id: "guild-alpha",
    name: "Guild Alpha",
    description: "Cross-chain guild",
    ownerAddress: "0xOwnerAddress1234567890123456789012345678",
    chainId: 1,
    isActive: true,
  },
  guildConfig: {
    guildId: "guild-alpha",
    requiredRoles: ["member", "optimism"],
    accessPolicy: "any" as const,
    requirements: [
      { id: "role-eth", name: "Ethereum Role", chainId: 1 },
      { id: "role-optimism", name: "Optimism Role", chainId: 10 },
    ],
  },
  membership: {
    guildId: "guild-alpha",
    isActive: true,
    roles: ["member"],
  },
  roles: [
    {
      id: "role-eth",
      name: "Ethereum Role",
      guildId: "guild-alpha",
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
      guildId: "guild-alpha",
      chainId: 10,
      requirements: [
        {
          type: "ROLE" as const,
          address: "0x1234567890123456789012345678901234567890",
          id: "2",
        },
      ],
    },
  ],
}));

const availabilityState = vi.hoisted(() => ({
  isChecking: false,
  checkingChainIds: [] as number[],
  perChain: [] as {
    chainId: number;
    status: "resolved" | "timed-out" | "error";
    resolvedRoles?: string[];
    errorMessage?: string;
  }[],
  retryChain: vi.fn(async () => undefined),
}));

const queryHelpers = vi.hoisted(() => ({
  makeQuery: (data: unknown) => ({
    data,
    isLoading: false,
    isPending: false,
    isFetching: false,
    isStale: false,
    dataUpdatedAt: 1,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("expo-router", () => ({
  useLocalSearchParams: () => searchParams,
  useRouter: () => routerMocks,
}));

vi.mock("../src/features/wallet/useWallet", () => ({
  useWallet: () => walletState,
}));

vi.mock("../src/features/guilds/useGuilds", () => ({
  GuildNotFoundError: class GuildNotFoundError extends Error {},
  useGuilds: () => ({
    useGuild: () => queryHelpers.makeQuery(screenData.guild),
    useGuildConfig: () => queryHelpers.makeQuery(screenData.guildConfig),
    useRoles: () => queryHelpers.makeQuery(screenData.roles),
  }),
}));

vi.mock("../src/features/membership/useMembership", () => ({
  useMembership: () => ({
    useMembershipQuery: () => queryHelpers.makeQuery(screenData.membership),
  }),
}));

vi.mock("../src/features/offline/useStaleQuery", () => ({
  useCombinedStaleState: () => ({
    isOffline: false,
    isStale: false,
    reason: null,
    lastSyncedAt: null,
  }),
}));

vi.mock("../src/features/guilds/useGuildChainAvailability", () => ({
  useGuildChainAvailability: () => availabilityState,
}));

vi.mock("../src/components/WalletAddress", () => ({
  WalletAddress: () => null,
}));

let renderedScreens: ReactTestRenderer[] = [];
let queryClients: QueryClient[] = [];

const renderScreen = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  queryClients.push(queryClient);

  const screen = TestRenderer.create(
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(GuildDetail),
    ),
  );
  renderedScreens.push(screen);
  return screen;
};

const outputText = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());

describe("GuildDetail cross-chain availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    availabilityState.isChecking = false;
    availabilityState.checkingChainIds = [];
    availabilityState.perChain = [];
    availabilityState.retryChain.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    for (const screen of renderedScreens) {
      screen.unmount();
    }
    for (const queryClient of queryClients) {
      queryClient.clear();
    }
    renderedScreens = [];
    queryClients = [];
  });

  it("renders healthy chain roles while a sibling chain shows a timed-out retry state", async () => {
    availabilityState.perChain = [
      { chainId: 1, status: "resolved", resolvedRoles: ["1"] },
      {
        chainId: 10,
        status: "timed-out",
        errorMessage: "RPC attempt timed out after 50ms",
      },
    ];

    let screen!: ReactTestRenderer;

    await act(async () => {
      screen = renderScreen();
    });

    const screenText = outputText(screen!);
    expect(screen.root.findByProps({ testID: "guild-roles-list-1" })).toBeDefined();
    expect(screenText).toContain("Ethereum Role");
    expect(screen.root.findByProps({ testID: "guild-chain-unavailable-10" })).toBeDefined();
    expect(screenText).toContain("Network check timed out");
    expect(screenText).toContain("RPC attempt timed out after 50ms");
    expect(screen.root.findByProps({ testID: "guild-chain-retry-10" })).toBeDefined();
  });

  it("renders a retryable unavailable state for a failed chain without hiding other chains", async () => {
    availabilityState.perChain = [
      { chainId: 1, status: "resolved", resolvedRoles: ["1"] },
      {
        chainId: 10,
        status: "error",
        errorMessage: "Optimism RPC provider error",
      },
    ];

    let screen!: ReactTestRenderer;

    await act(async () => {
      screen = renderScreen();
    });

    expect(screen.root.findByProps({ testID: "guild-roles-list-1" })).toBeDefined();
    expect(screen.root.findByProps({ testID: "guild-chain-unavailable-10" })).toBeDefined();
    expect(outputText(screen!)).toContain("Network unavailable");

    await act(async () => {
      screen.root.findByProps({ testID: "guild-chain-retry-10" }).props.onPress();
    });

    expect(availabilityState.retryChain).toHaveBeenCalledTimes(1);
    expect(availabilityState.retryChain).toHaveBeenCalledWith(10);
  });
});
