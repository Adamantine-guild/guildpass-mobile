import { useQuery } from "@tanstack/react-query";
import { guildPassClient } from "../../lib/guildpassClient";
import { membershipKeys } from "../../lib/queryKeys";

export function useUserRoles(walletAddress: string | null, guildId: string) {
  return useQuery({
    queryKey: membershipKeys.userRoles(walletAddress, guildId),
    queryFn: () =>
      guildPassClient.roles.getUserRoles({
        walletAddress: walletAddress!,
        guildId,
      }),
    enabled: !!walletAddress && !!guildId,
  });
}
