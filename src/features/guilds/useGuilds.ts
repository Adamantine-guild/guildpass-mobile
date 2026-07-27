import { onlineManager, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { guildPassClient } from "../../lib/guildpassClient";
import { appConfig } from "../../config/appConfig";
import { queryKeys } from "../../lib/queryKeys";
import { getCachedMembershipSummaries, type GuildPassStatus } from "../passes/passCache";

export type GuildListItem = {
  id: string;
  name: string;
  isActive: boolean;
  roleCount?: number;
  status?: GuildPassStatus;
  lastSyncedAt?: number;
};

export class GuildNotFoundError extends Error {
  constructor(guildId: string) {
    super(`Guild not found: ${guildId}`);
    this.name = "GuildNotFoundError";
  }
}

export const walletGuildsQueryKey = (walletAddress: string | null | undefined) =>
  queryKeys.walletGuilds.byWallet(walletAddress ?? "");

export const fetchGuildsByWalletAddress = async (
  walletAddress: string,
): Promise<GuildListItem[]> => {
  const guildsClient = guildPassClient.guilds as typeof guildPassClient.guilds & {
    getGuildsByWalletAddress?: (params: { walletAddress: string }) => Promise<GuildListItem[]>;
  };

  if (guildsClient.getGuildsByWalletAddress) {
    return guildsClient.getGuildsByWalletAddress({ walletAddress });
  }

  const response = await fetch(
    `${appConfig.apiUrl}/guilds?walletAddress=${encodeURIComponent(walletAddress)}`,
  );

  if (!response.ok) {
    throw new Error("Unable to load guilds for this wallet.");
  }

  const data = (await response.json()) as GuildListItem[] | { guilds?: GuildListItem[] };
  return Array.isArray(data) ? data : (data.guilds ?? []);
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cachedGuildName(queryClient: QueryClient, guildId: string): string {
  const guild = queryClient.getQueryData(queryKeys.guild.byId(guildId));
  return isRecord(guild) && typeof guild.name === "string" ? guild.name : guildId;
}

function getCachedWalletGuilds(
  queryClient: QueryClient,
  walletAddress: string,
): GuildListItem[] | undefined {
  const summaries = getCachedMembershipSummaries(queryClient, walletAddress);
  if (!summaries) return undefined;

  return summaries.map((summary) => ({
    id: summary.guildId,
    name: cachedGuildName(queryClient, summary.guildId),
    isActive: summary.isActive,
    roleCount: summary.roleCount,
    status: summary.status,
    lastSyncedAt: summary.lastSyncedAt,
  }));
}

export const useGuilds = () => {
  const queryClient = useQueryClient();

  const useWalletGuilds = (walletAddress: string | null | undefined) => {
    const queryKey = walletGuildsQueryKey(walletAddress);

    return useQuery<GuildListItem[]>({
      queryKey,
      queryFn: async () => {
        if (!walletAddress) return [];

        const cached = queryClient.getQueryData<GuildListItem[]>(queryKey);
        if (!onlineManager.isOnline()) {
          return cached ?? getCachedWalletGuilds(queryClient, walletAddress) ?? [];
        }

        return fetchGuildsByWalletAddress(walletAddress);
      },
      enabled: !!walletAddress,
      networkMode: "offlineFirst",
      refetchOnReconnect: "always",
    });
  };

  const useGuild = (guildId: string) => {
    const queryKey = queryKeys.guild.byId(guildId);

    return useQuery<any>({
      queryKey,
      queryFn: async () => {
        const cached = queryClient.getQueryData(queryKey);
        if (!onlineManager.isOnline() && cached !== undefined) {
          return cached as any;
        }

        try {
          return await guildPassClient.guilds.getGuild({ guildId });
        } catch (error) {
          if (error instanceof Error && /not found/i.test(error.message)) {
            throw new GuildNotFoundError(guildId);
          }
          throw error;
        }
      },
      enabled: !!guildId,
      networkMode: "offlineFirst",
      refetchOnReconnect: "always",
    });
  };

  const useGuildConfig = (guildId: string) => {
    const queryKey = queryKeys.guildConfig.byId(guildId);

    return useQuery<any>({
      queryKey,
      queryFn: async () => {
        const cached = queryClient.getQueryData(queryKey);
        if (!onlineManager.isOnline() && cached !== undefined) {
          return cached as any;
        }

        return guildPassClient.guilds.getGuildConfig({ guildId });
      },
      enabled: !!guildId,
      networkMode: "offlineFirst",
      refetchOnReconnect: "always",
    });
  };

  const useRoles = (guildId: string) => {
    const queryKey = queryKeys.guildRoles.byId(guildId);

    return useQuery<any>({
      queryKey,
      queryFn: async () => {
        const cached = queryClient.getQueryData(queryKey);
        if (!onlineManager.isOnline() && cached !== undefined) {
          return cached as any;
        }

        return guildPassClient.roles.getRoles({ guildId });
      },
      enabled: !!guildId,
      networkMode: "offlineFirst",
      refetchOnReconnect: "always",
    });
  };

  return {
    getGuildsByWalletAddress: useWalletGuilds,
    getGuild: useGuild,
    getGuildConfig: useGuildConfig,
    getRoles: useRoles,
    useWalletGuilds,
    useGuild,
    useGuildConfig,
    useRoles,
  };
};
