import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getRpcsForChain, rpcConfig } from "../../config/rpcConfig";
import { resolveRoleEligibilityForChain } from "../access/roleEligibilityResolver";
import type {
  AccessRequirement,
  PerChainRoleEligibilityResolution,
  RoleRequirementOnChain,
} from "../access/roleEligibilityResolver";
import { buildRoleEligibilityResolutionPlan } from "../access/useMultiChainRoleEligibility";

type GuildRoleWithRequirements = {
  id?: string;
  name?: string;
  chainId?: number | null;
  requirements?: AccessRequirement[];
};

type LastAvailabilityContext = {
  walletAddress: string;
  requirementsByChain: Map<number, AccessRequirement[]>;
  rpcsByChain: Record<number, string[]>;
};

export type GuildChainAvailabilityState = {
  isChecking: boolean;
  checkingChainIds: number[];
  perChain: PerChainRoleEligibilityResolution[];
  retryChain: (chainId: number) => Promise<void>;
};

function groupRequirementsByChain(
  requirements: RoleRequirementOnChain[],
): Map<number, AccessRequirement[]> {
  const byChain = new Map<number, AccessRequirement[]>();

  for (const { chainId, requirement } of requirements) {
    const chainRequirements = byChain.get(chainId) ?? [];
    chainRequirements.push(requirement);
    byChain.set(chainId, chainRequirements);
  }

  return byChain;
}

function upsertPerChainResolution(
  current: PerChainRoleEligibilityResolution[],
  next: PerChainRoleEligibilityResolution,
): PerChainRoleEligibilityResolution[] {
  return [...current.filter((item) => item.chainId !== next.chainId), next].sort(
    (left, right) => left.chainId - right.chainId,
  );
}

function addCheckingChain(current: number[], chainId: number): number[] {
  return current.includes(chainId) ? current : [...current, chainId].sort((a, b) => a - b);
}

function removeCheckingChain(current: number[], chainId: number): number[] {
  return current.filter((id) => id !== chainId);
}

export function useGuildChainAvailability({
  guildId,
  walletAddress,
  roles,
  enabled = true,
}: {
  guildId: string;
  walletAddress?: string | null;
  roles?: GuildRoleWithRequirements[];
  enabled?: boolean;
}): GuildChainAvailabilityState {
  const [state, setState] = useState<Omit<GuildChainAvailabilityState, "retryChain">>({
    isChecking: false,
    checkingChainIds: [],
    perChain: [],
  });
  const requestIdRef = useRef(0);
  const lastAvailabilityRef = useRef<LastAvailabilityContext | null>(null);

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    lastAvailabilityRef.current = null;

    if (!enabled || !walletAddress || !roles) {
      setState({ isChecking: false, checkingChainIds: [], perChain: [] });
      return;
    }

    const plan = buildRoleEligibilityResolutionPlan(roles);
    if (plan.requirements.length === 0) {
      setState({
        isChecking: false,
        checkingChainIds: [],
        perChain: plan.configurationErrors,
      });
      return;
    }

    const requirementsByChain = groupRequirementsByChain(plan.requirements);
    const chainIds = Array.from(requirementsByChain.keys()).sort((a, b) => a - b);
    const rpcsByChain: Record<number, string[]> = {};
    for (const chainId of chainIds) {
      rpcsByChain[chainId] = getRpcsForChain(chainId);
    }

    lastAvailabilityRef.current = {
      walletAddress,
      requirementsByChain,
      rpcsByChain,
    };

    setState({
      isChecking: true,
      checkingChainIds: chainIds,
      perChain: plan.configurationErrors,
    });

    for (const chainId of chainIds) {
      void resolveRoleEligibilityForChain({
        walletAddress,
        chainId,
        requirements: requirementsByChain.get(chainId) ?? [],
        rpcs: rpcsByChain[chainId],
        timeouts: rpcConfig.timeouts,
      }).then((result) => {
        if (requestIdRef.current !== requestId) return;

        setState((current) => {
          const checkingChainIds = removeCheckingChain(current.checkingChainIds, chainId);
          return {
            isChecking: checkingChainIds.length > 0,
            checkingChainIds,
            perChain: upsertPerChainResolution(current.perChain, result),
          };
        });
      });
    }
  }, [enabled, guildId, roles, walletAddress]);

  const retryChain = useCallback(async (chainId: number) => {
    const context = lastAvailabilityRef.current;
    const requirements = context?.requirementsByChain.get(chainId);

    if (!context || !requirements) {
      return;
    }

    const requestId = requestIdRef.current;

    setState((current) => ({
      ...current,
      isChecking: true,
      checkingChainIds: addCheckingChain(current.checkingChainIds, chainId),
    }));

    const result = await resolveRoleEligibilityForChain({
      walletAddress: context.walletAddress,
      chainId,
      requirements,
      rpcs: context.rpcsByChain[chainId],
      timeouts: rpcConfig.timeouts,
    });

    if (requestIdRef.current !== requestId) return;

    setState((current) => {
      const checkingChainIds = removeCheckingChain(current.checkingChainIds, chainId);
      return {
        isChecking: checkingChainIds.length > 0,
        checkingChainIds,
        perChain: upsertPerChainResolution(current.perChain, result),
      };
    });
  }, []);

  return useMemo(
    () => ({ ...state, retryChain }),
    [retryChain, state],
  );
}
