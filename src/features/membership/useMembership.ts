import { useQuery } from "@tanstack/react-query";
import { guildPassClient } from "../../lib/guildpassClient";

export const useMembership = (walletAddress: string | null) => {
  const getMembership = (guildId: string) => {
    return useQuery({
      queryKey: ["membership", walletAddress, guildId],
      queryFn: () =>
        guildPassClient.membership.getMembership({
          walletAddress: walletAddress!,
          guildId,
        }),
      enabled: !!walletAddress && !!guildId,
    });
  };

  const getUserRoles = (guildId: string) => {
    return useQuery({
      queryKey: ["user-roles", walletAddress, guildId],
      queryFn: () =>
        guildPassClient.roles.getUserRoles({
          walletAddress: walletAddress!,
          guildId,
        }),
      enabled: !!walletAddress && !!guildId,
    });
  };

  return {
    getMembership,
    getUserRoles,
  };
};
