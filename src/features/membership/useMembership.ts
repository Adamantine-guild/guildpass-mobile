import { useQuery, useQueries } from "@tanstack/react-query";
import { guildPassClient } from "../../lib/guildpassClient";
import { queryKeys } from "../../lib/queryKeys";

export type NormalizedMembership = {
  guildId: string;
  isActive: boolean;
  roleCount: number;
};

export type EnrichedMembership = NormalizedMembership & {
  guildName: string;
};

export const useMembership = (walletAddress: string | null) => {
  const useMembershipQuery = (guildId: string) => {
    return useQuery({
      queryKey: queryKeys.membership.byWalletAndGuild(walletAddress ?? "", guildId),
      queryFn: () =>
        guildPassClient.membership.getMembership({
          walletAddress: walletAddress!,
          guildId,
        }),
      enabled: !!walletAddress && !!guildId,
      networkMode: "offlineFirst",
    });
  };

  const useUserRoles = (guildId: string) => {
    return useQuery({
      queryKey: queryKeys.userRoles.byWalletAndGuild(walletAddress ?? "", guildId),
      queryFn: () =>
        guildPassClient.roles.getUserRoles({
          walletAddress: walletAddress!,
          guildId,
        }),
      enabled: !!walletAddress && !!guildId,
      networkMode: "offlineFirst",
    });
  };

  const useMembershipsQuery = () => {
    return useQuery({
      queryKey: queryKeys.memberships.byWallet(walletAddress ?? ""),
      queryFn: async () => {
        if (!walletAddress) return [];
        const { getDatabase } = await import("../../database/connection");
        const dal = await import("../../database/dal");
        const db = getDatabase();
        const rows = await dal.getMembershipsByWallet(db, walletAddress);

        return rows.map((row) => {
          const membership = JSON.parse(row.raw_json);
          return {
            guildId: row.guild_id,
            isActive: row.status === "active",
            roleCount: membership.roles?.length || 0,
          } satisfies NormalizedMembership;
        });
      },
      enabled: !!walletAddress,
      networkMode: "offlineFirst",
    });
  };

  const useEnrichedMemberships = () => {
    const membershipsQuery = useMembershipsQuery();
    const memberships = membershipsQuery.data ?? [];

    const guildNameQueries = useQueries({
      queries: memberships.map((m) => ({
        queryKey: queryKeys.guild.byId(m.guildId),
        queryFn: () => guildPassClient.guilds.getGuild({ guildId: m.guildId }),
        enabled: !!m.guildId,
        staleTime: 1000 * 60 * 5,
        networkMode: "offlineFirst" as const,
      })),
    });

    const enriched = memberships.map((m, i) => {
      const guildData = guildNameQueries[i]?.data;
      return {
        guildId: m.guildId,
        guildName:
          (guildData && typeof guildData === "object" && "name" in guildData
            ? (guildData as { name: string }).name
            : undefined) ?? m.guildId,
        isActive: m.isActive,
        roleCount: m.roleCount,
      } satisfies EnrichedMembership;
    });

    return {
      ...membershipsQuery,
      data: enriched,
    };
  };

  return {
    getMembership: useMembershipQuery,
    getUserRoles: useUserRoles,
    useMembershipQuery,
    useUserRoles,
    useMembershipsQuery,
    useEnrichedMemberships,
  };
};
