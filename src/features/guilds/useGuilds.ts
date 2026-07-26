import { useQuery } from "@tanstack/react-query";
import { guildPassClient } from "../../lib/guildpassClient";
import { appConfig } from "../../config/appConfig";

export type GuildListItem = {
  id: string;
  name: string;
  isActive: boolean;
  roleCount?: number;
};

export const walletGuildsQueryKey = (walletAddress: string | null | undefined) => [
  "wallet-guilds",
  walletAddress ?? "",
];

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
  return Array.isArray(data) ? data : data.guilds ?? [];
};

export const useGuilds = () => {
  const useWalletGuilds = (walletAddress: string | null | undefined) => {
    return useQuery({
      queryKey: walletGuildsQueryKey(walletAddress),
      queryFn: () => fetchGuildsByWalletAddress(walletAddress ?? ""),
      enabled: !!walletAddress,
      networkMode: "offlineFirst",
    });
  };

  const useGuild = (guildId: string) => {
    return useQuery({
      queryKey: ["guild", guildId],
      queryFn: () => guildPassClient.guilds.getGuild({ guildId }),
      enabled: !!guildId,
      networkMode: "offlineFirst",
    });
  };

  const useGuildConfig = (guildId: string) => {
    return useQuery({
      queryKey: ["guild-config", guildId],
      queryFn: () => guildPassClient.guilds.getGuildConfig({ guildId }),
      enabled: !!guildId,
      networkMode: "offlineFirst",
    });
  };

  const useRoles = (guildId: string) => {
    return useQuery({
      queryKey: ["guild-roles", guildId],
      queryFn: () => guildPassClient.roles.getRoles({ guildId }),
      enabled: !!guildId,
      networkMode: "offlineFirst",
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
