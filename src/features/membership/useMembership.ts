import { useQuery } from "@tanstack/react-query";
import {
  buildMembershipQueryOptions,
  buildUserRolesQueryOptions,
} from "../../lib/queryPolicies";

export const useMembership = (walletAddress: string | null) => {
  const useMembershipQuery = (guildId: string) => {
    return useQuery(buildMembershipQueryOptions(walletAddress, guildId));
  };

  const useUserRoles = (guildId: string) => {
    return useQuery(buildUserRolesQueryOptions(walletAddress, guildId));
  };

  return {
    getMembership: useMembershipQuery,
    getUserRoles: useUserRoles,
    useMembershipQuery,
    useUserRoles,
  };
};
