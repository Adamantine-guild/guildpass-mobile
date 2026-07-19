import { useQuery } from "@tanstack/react-query";
import { guildPassClient } from "../../lib/guildpassClient";

export const useMembership = (walletAddress: string | null) => {
  const useMembershipQuery = (guildId: string) => {
    return useQuery({
      queryKey: ["membership", walletAddress, guildId],
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
      queryKey: ["user-roles", walletAddress, guildId],
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
      queryKey: ["memberships", walletAddress],
      queryFn: async () => {
        if (!walletAddress) return [];
        const { getDatabase } = await import("../../database/connection");
        const dal = await import("../../database/dal");
        const db = getDatabase();
        const rows = await dal.getMembershipsByWallet(db, walletAddress);

        const membershipsWithGuildInfo = await Promise.all(
          rows.map(async (row) => {
            const membership = JSON.parse(row.raw_json);
            const guildRow = await dal.getGuildById(db, row.guild_id);
            let guildName = "Unknown Guild";
            if (guildRow) {
              const guildObj = JSON.parse(guildRow.raw_json);
              guildName = guildObj.name || guildName;
            }
            return {
              id: row.guild_id,
              name: guildName,
              isActive: row.status === "active",
              roleCount: membership.roles?.length || 0,
            };
          })
        );
        return membershipsWithGuildInfo;
      },
      enabled: !!walletAddress,
      networkMode: "offlineFirst",
    });
  };

  return {
    getMembership: useMembershipQuery,
    getUserRoles: useUserRoles,
    useMembershipQuery,
    useUserRoles,
    useMembershipsQuery,
  };
};
