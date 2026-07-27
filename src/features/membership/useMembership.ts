import { onlineManager, useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import { guildPassClient } from "../../lib/guildpassClient";
import { queryKeys } from "../../lib/queryKeys";
import {
  getCachedMembershipSummaries,
  normalizeMembershipForPassSummary,
  type CachedGuildPassSummary,
} from "../passes/passCache";

export type NormalizedMembership = CachedGuildPassSummary;

export type EnrichedMembership = NormalizedMembership & {
  guildName: string;
};

export const useMembership = (walletAddress: string | null) => {
  const queryClient = useQueryClient();

  const useMembershipQuery = (guildId: string) => {
    const queryKey = queryKeys.membership.byWalletAndGuild(walletAddress ?? "", guildId);

    return useQuery<any>({
      queryKey,
      queryFn: async () => {
        const cached = queryClient.getQueryData(queryKey);
        if (!onlineManager.isOnline() && cached !== undefined) {
          return cached as any;
        }

        return guildPassClient.membership.getMembership({
          walletAddress: walletAddress!,
          guildId,
        });
      },
      enabled: !!walletAddress && !!guildId,
      networkMode: "offlineFirst",
      refetchOnReconnect: "always",
    });
  };

  const useUserRoles = (guildId: string) => {
    const queryKey = queryKeys.userRoles.byWalletAndGuild(walletAddress ?? "", guildId);

    return useQuery<any>({
      queryKey,
      queryFn: async () => {
        const cached = queryClient.getQueryData(queryKey);
        if (!onlineManager.isOnline() && cached !== undefined) {
          return cached as any;
        }

        return guildPassClient.roles.getUserRoles({
          walletAddress: walletAddress!,
          guildId,
        });
      },
      enabled: !!walletAddress && !!guildId,
      networkMode: "offlineFirst",
      refetchOnReconnect: "always",
    });
  };

  const useMembershipsQuery = () => {
    const queryKey = queryKeys.memberships.byWallet(walletAddress ?? "");

    return useQuery<NormalizedMembership[]>({
      queryKey,
      queryFn: async () => {
        if (!walletAddress) return [];
        const cached = getCachedMembershipSummaries(queryClient, walletAddress);

        if (!onlineManager.isOnline() && cached !== undefined) {
          return cached;
        }

        try {
          const { getDatabase } = await import("../../database/connection");
          const dal = await import("../../database/dal");
          const db = getDatabase();
          const rows = await dal.getMembershipsByWallet(db, walletAddress);

          if (rows.length > 0) {
            return rows
              .map((row) => {
                const membership = JSON.parse(row.raw_json);
                return normalizeMembershipForPassSummary(membership, {
                  fallbackGuildId: row.guild_id,
                  fallbackRoleCount: membership.roles?.length,
                  lastSyncedAt: new Date(row.updated_at).getTime(),
                });
              })
              .filter((entry): entry is NormalizedMembership => entry !== null);
          }
        } catch (error) {
          // The encrypted TanStack cache is the reliable offline source. The
          // SQLite layer is optional here until a wallet-wide membership API
          // exists and can keep it populated.
          if (cached === undefined) {
            throw error;
          }
        }

        return cached ?? [];
      },
      enabled: !!walletAddress,
      networkMode: "offlineFirst",
      refetchOnReconnect: "always",
    });
  };

  const useEnrichedMemberships = () => {
    const membershipsQuery = useMembershipsQuery();
    const memberships = membershipsQuery.data ?? [];

    const guildNameQueries = useQueries({
      queries: memberships.map((m) => {
        const queryKey = queryKeys.guild.byId(m.guildId);

        return {
          queryKey,
          queryFn: async () => {
            const cached = queryClient.getQueryData(queryKey);
            if (!onlineManager.isOnline() && cached !== undefined) {
              return cached as any;
            }

            return guildPassClient.guilds.getGuild({ guildId: m.guildId });
          },
          enabled: !!m.guildId,
          staleTime: 1000 * 60 * 5,
          networkMode: "offlineFirst" as const,
          refetchOnReconnect: "always" as const,
        };
      }),
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
        status: m.status,
        lastSyncedAt: m.lastSyncedAt,
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
