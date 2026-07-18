import { queryOptions } from "@tanstack/react-query";
import { guildPassClient } from "./guildpassClient";
import { QUERY_GC_TIME_MS } from "./offlineCache";

export const GUILD_METADATA_STALE_TIME_MS = 1000 * 60 * 5;
export const GUILD_METADATA_GC_TIME_MS = QUERY_GC_TIME_MS;
export const VOLATILE_QUERY_STALE_TIME_MS = 1000 * 30;
export const VOLATILE_QUERY_GC_TIME_MS = 1000 * 60 * 15;

export const guildQueryKeys = {
  all: ["guild"] as const,
  detail: (guildId: string) => [...guildQueryKeys.all, guildId] as const,
  config: (guildId: string) => ["guild-config", guildId] as const,
  roles: (guildId: string) => ["guild-roles", guildId] as const,
};

export const membershipQueryKeys = {
  all: ["membership"] as const,
  detail: (walletAddress: string, guildId: string) => ["membership", walletAddress, guildId] as const,
  userRoles: (walletAddress: string, guildId: string) => ["user-roles", walletAddress, guildId] as const,
};

export function buildGuildQueryOptions(guildId: string) {
  return queryOptions({
    queryKey: guildQueryKeys.detail(guildId),
    queryFn: () => guildPassClient.guilds.getGuild({ guildId }),
    enabled: !!guildId,
    networkMode: "offlineFirst",
    staleTime: GUILD_METADATA_STALE_TIME_MS,
    gcTime: GUILD_METADATA_GC_TIME_MS,
  });
}

export function buildGuildConfigQueryOptions(guildId: string) {
  return queryOptions({
    queryKey: guildQueryKeys.config(guildId),
    queryFn: () => guildPassClient.guilds.getGuildConfig({ guildId }),
    enabled: !!guildId,
    networkMode: "offlineFirst",
    staleTime: GUILD_METADATA_STALE_TIME_MS,
    gcTime: GUILD_METADATA_GC_TIME_MS,
  });
}

export function buildRolesQueryOptions(guildId: string) {
  return queryOptions({
    queryKey: guildQueryKeys.roles(guildId),
    queryFn: () => guildPassClient.roles.getRoles({ guildId }),
    enabled: !!guildId,
    networkMode: "offlineFirst",
    staleTime: VOLATILE_QUERY_STALE_TIME_MS,
    gcTime: VOLATILE_QUERY_GC_TIME_MS,
  });
}

export function buildMembershipQueryOptions(walletAddress: string | null, guildId: string) {
  return queryOptions({
    queryKey: membershipQueryKeys.detail(walletAddress ?? "", guildId),
    queryFn: () =>
      guildPassClient.membership.getMembership({
        walletAddress: walletAddress!,
        guildId,
      }),
    enabled: !!walletAddress && !!guildId,
    networkMode: "offlineFirst",
    staleTime: VOLATILE_QUERY_STALE_TIME_MS,
    gcTime: VOLATILE_QUERY_GC_TIME_MS,
  });
}

export function buildUserRolesQueryOptions(walletAddress: string | null, guildId: string) {
  return queryOptions({
    queryKey: membershipQueryKeys.userRoles(walletAddress ?? "", guildId),
    queryFn: () =>
      guildPassClient.roles.getUserRoles({
        walletAddress: walletAddress!,
        guildId,
      }),
    enabled: !!walletAddress && !!guildId,
    networkMode: "offlineFirst",
    staleTime: VOLATILE_QUERY_STALE_TIME_MS,
    gcTime: VOLATILE_QUERY_GC_TIME_MS,
  });
}
