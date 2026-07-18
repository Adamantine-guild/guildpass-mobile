import { useQuery } from "@tanstack/react-query";
import { guildPassClient } from "../../lib/guildpassClient";
import { useSessionStore } from "../session/session.store";

/**
 * Security boundary for user-scoped queries.
 *
 * Membership and roles are queried for the PROVEN session address only. A query
 * for an address that differs from the authenticated session is rejected — this
 * is the fix for the original gap where any client could query membership/role
 * data for arbitrary addresses it did not control. The authenticated bearer token
 * (attached by the SDK's fetch wrapper) lets the server authorize from the
 * verified token rather than trusting the request body.
 *
 * @throws if `requested` is provided and differs from the session address.
 */
export function assertSessionAddress(requested: string | null | undefined): string {
  const sessionAddress = useSessionStore.getState().walletAddress;
  if (!sessionAddress) {
    throw new Error("No authenticated session: connect and sign in before querying membership.");
  }
  if (requested && requested.toLowerCase() !== sessionAddress.toLowerCase()) {
    throw new Error(
      `Refusing to query membership for ${requested}: it does not match the authenticated session ${sessionAddress}.`,
    );
  }
  return sessionAddress;
}

export const useMembership = (
  requestedAddress: string | null = null,
  /** When false, the queries are not fetched until explicitly refetched. */
  enabled: boolean = true,
) => {
  const useMembershipQuery = (guildId: string) => {
    return useQuery({
      queryKey: ["membership", requestedAddress, guildId],
      queryFn: () => {
        const address = assertSessionAddress(requestedAddress);
        return guildPassClient.membership.getMembership({
          walletAddress: address,
          guildId,
        });
      },
      enabled: enabled && !!guildId,
      networkMode: "offlineFirst",
    });
  };

  const useUserRoles = (guildId: string) => {
    return useQuery({
      queryKey: ["user-roles", requestedAddress, guildId],
      queryFn: () => {
        const address = assertSessionAddress(requestedAddress);
        return guildPassClient.roles.getUserRoles({
          walletAddress: address,
          guildId,
        });
      },
      enabled: enabled && !!guildId,
      networkMode: "offlineFirst",
    });
  };

  return {
    getMembership: useMembershipQuery,
    getUserRoles: useUserRoles,
    useMembershipQuery,
    useUserRoles,
  };
};
