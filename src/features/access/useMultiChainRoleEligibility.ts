import { useCallback, useMemo, useState } from "react";
import { guildPassClient } from "../../lib/guildpassClient";
import { getRpcsForChain, rpcConfig } from "../../config/rpcConfig";

import {
  resolveRoleEligibilityForChains,
  type AccessRequirement,
  type PerChainRoleEligibilityResolution,
} from "./roleEligibilityResolver";

export type MultiChainRoleEligibilityStatusState = {
  isResolving: boolean;
  perChain: PerChainRoleEligibilityResolution[];
  error?: string;
};

export const useMultiChainRoleEligibility = () => {
  const [state, setState] = useState<MultiChainRoleEligibilityStatusState>({
    isResolving: false,
    perChain: [],
  });

  const resolve = useCallback(
    async (guildId: string, walletAddress: string) => {
      setState({ isResolving: true, perChain: [] });

      // Start with an eager “shape” check: if there are no RPC endpoints
      // configured at all, avoid making network calls.
      // (We still allow backend-only access checks to succeed.)
      if (Object.keys(rpcConfig.chainRpcUrls ?? {}).length === 0) {
        setState({ isResolving: false, perChain: [] });
        return;
      }





      try {

        // Fetch roles including their on-chain requirements.
        const roles = (await guildPassClient.roles.getRoles({ guildId })) as Array<{
          id?: string;
          name?: string;
          chainId?: number;
          requirements?: AccessRequirement[];
        }>;

        // Build (chainId, requirement) pairs.
        // If role doesn't specify chainId, fall back to the guild's chainId.
        // We don't have guild.chainId here, so we use appConfig default chainIds
        // indirectly via rpcConfig lookups; if the requirement doesn't specify
        // a chainId, we treat it as unknown and skip.
        const pairs: Array<{ chainId: number; requirement: AccessRequirement }> = [];

        for (const role of roles) {
          const chainId = role.chainId;
          if (!chainId) continue;

          const reqs = role.requirements ?? [];
          for (const req of reqs) {
            pairs.push({ chainId, requirement: req });
          }
        }

        if (pairs.length === 0) {
          setState({ isResolving: false, perChain: [] });
          return;
        }

        const rpcsByChain: Record<number, string[]> = {};
        for (const p of pairs) {
          rpcsByChain[p.chainId] = getRpcsForChain(p.chainId);
        }

        const perChain = await resolveRoleEligibilityForChains({
          walletAddress,
          requirements: pairs,
          rpcsByChain,
          timeouts: rpcConfig.timeouts,
        });

        setState({ isResolving: false, perChain });
      } catch (e: any) {
        setState({
          isResolving: false,
          perChain: [],
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [],
  );

  return useMemo(
    () => ({ ...state, resolve }),
    [resolve, state.isResolving, state.perChain, state.error],
  );
};

