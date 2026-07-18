import { useMutation } from "@tanstack/react-query";
import { guildPassClient } from "../../lib/guildpassClient";
import { useSessionStore } from "../session/session.store";

export type AccessCheckParams = {
  /** Optional explicit address. When set, must equal the authenticated session address. */
  walletAddress?: string;
  guildId: string;
  resourceId: string;
};

export type AccessCheckResult = {
  hasAccess: boolean;
  reason?: string;
  matchedRoles: string[];
  requiredRoles: string[];
};

/**
 * Access check bound to the authenticated session.
 *
 * Like the membership hook, the query address is taken from the proven session
 * (see `assertSessionAddress` in useMembership). The bearer token attached by the
 * SDK's fetch wrapper is what authorizes the call server-side. A caller that
 * passes an address not equal to the session address is rejected.
 */
function resolveSessionAddress(requested?: string): string {
  const sessionAddress = useSessionStore.getState().walletAddress;
  if (!sessionAddress) {
    throw new Error("No authenticated session: connect and sign in before checking access.");
  }
  if (requested && requested.toLowerCase() !== sessionAddress.toLowerCase()) {
    throw new Error(
      `Refusing access check for ${requested}: it does not match the authenticated session ${sessionAddress}.`,
    );
  }
  return sessionAddress;
}

export const useAccessCheck = () => {
  return useMutation<AccessCheckResult, Error, AccessCheckParams>({
    mutationKey: ["access-check"],
    mutationFn: (params: AccessCheckParams) => {
      const address = resolveSessionAddress(params.walletAddress);
      return guildPassClient.access.checkAccess({
        walletAddress: address,
        guildId: params.guildId,
        resourceId: params.resourceId,
      }) as Promise<AccessCheckResult>;
    },
    networkMode: "offlineFirst",
  });
};
