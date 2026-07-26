import { useCallback, useMemo, useState } from "react";
import { guildPassClient } from "../../lib/guildpassClient";
import { getRpcsForChain, rpcConfig } from "../../config/rpcConfig";

import { resolveRoleEligibilityForChains } from "./roleEligibilityResolver";
import type {
  AccessRequirement,
  PerChainRoleEligibilityResolution,
  RoleRequirementOnChain,
} from "./roleEligibilityResolver";

export type MultiChainRoleEligibilityStatusState = {
  isResolving: boolean;
  perChain: PerChainRoleEligibilityResolution[];
  error?: string;
};

type GuildRoleWithRequirements = {
  id?: string;
  name?: string;
  chainId?: number | null;
  requirements?: AccessRequirement[];
};

export type RoleEligibilityResolutionPlan = {
  requirements: RoleRequirementOnChain[];
  configurationErrors: PerChainRoleEligibilityResolution[];
};

function describeRole(role: GuildRoleWithRequirements): string {
  const name = role.name?.trim();
  const id = role.id?.trim();

  if (name && id) return `"${name}" (${id})`;
  if (name) return `"${name}"`;
  if (id) return id;
  return "Unnamed role";
}

export function buildRoleEligibilityResolutionPlan(
  roles: GuildRoleWithRequirements[],
): RoleEligibilityResolutionPlan {
  const requirements: RoleRequirementOnChain[] = [];
  const configurationErrors: PerChainRoleEligibilityResolution[] = [];

  for (const role of roles) {
    const roleRequirements = role.requirements ?? [];
    if (roleRequirements.length === 0) continue;

    const chainId = role.chainId;
    if (typeof chainId !== "number" || !Number.isSafeInteger(chainId) || chainId <= 0) {
      configurationErrors.push({
        chainId: -configurationErrors.length - 1,
        status: "error",
        errorMessage: `Role ${describeRole(role)} is missing a valid chain configuration`,
      });
      continue;
    }

    for (const requirement of roleRequirements) {
      requirements.push({ chainId, requirement });
    }
  }

  return { requirements, configurationErrors };
}

export const useMultiChainRoleEligibility = () => {
  const [state, setState] = useState<MultiChainRoleEligibilityStatusState>({
    isResolving: false,
    perChain: [],
  });

  const resolve = useCallback(async (guildId: string, walletAddress: string) => {
    setState({ isResolving: true, perChain: [] });

    try {
      // Fetch roles including their on-chain requirements.
      const roles = (await guildPassClient.roles.getRoles({
        guildId,
      })) as GuildRoleWithRequirements[];
      const plan = buildRoleEligibilityResolutionPlan(roles);

      if (plan.requirements.length === 0) {
        setState({
          isResolving: false,
          perChain: plan.configurationErrors,
        });
        return;
      }

      const rpcsByChain: Record<number, string[]> = {};
      for (const { chainId } of plan.requirements) {
        rpcsByChain[chainId] = getRpcsForChain(chainId);
      }

      const perChain = await resolveRoleEligibilityForChains({
        walletAddress,
        requirements: plan.requirements,
        rpcsByChain,
        timeouts: rpcConfig.timeouts,
      });

      setState({
        isResolving: false,
        perChain: [...plan.configurationErrors, ...perChain],
      });
    } catch (e: any) {
      setState({
        isResolving: false,
        perChain: [],
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  return useMemo(
    () => ({ ...state, resolve }),
    [resolve, state.isResolving, state.perChain, state.error],
  );
};
