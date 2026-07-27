import { useCallback, useMemo, useRef, useState } from "react";
import { guildPassClient } from "../../lib/guildpassClient";
import { getRpcsForChain, rpcConfig } from "../../config/rpcConfig";

import { resolveRoleEligibilityForChain } from "./roleEligibilityResolver";
import type {
  AccessRequirement,
  PerChainRoleEligibilityResolution,
  RoleRequirementOnChain,
} from "./roleEligibilityResolver";

export type MultiChainRoleEligibilityStatusState = {
  isResolving: boolean;
  resolvingChainIds: number[];
  perChain: PerChainRoleEligibilityResolution[];
  error?: string;
};

type GuildRoleWithRequirements = {
  id?: string;
  name?: string;
  chainId?: number | null;
  requirements?: AccessRequirement[];
};

type LastResolutionContext = {
  guildId: string;
  walletAddress: string;
  requirementsByChain: Map<number, AccessRequirement[]>;
  rpcsByChain: Record<number, string[]>;
};

export type RoleEligibilityResolutionPlan = {
  requirements: RoleRequirementOnChain[];
  configurationErrors: PerChainRoleEligibilityResolution[];
};

function upsertPerChainResolution(
  current: PerChainRoleEligibilityResolution[],
  next: PerChainRoleEligibilityResolution,
): PerChainRoleEligibilityResolution[] {
  return [...current.filter((item) => item.chainId !== next.chainId), next].sort(
    (left, right) => left.chainId - right.chainId,
  );
}

function addResolvingChain(current: number[], chainId: number): number[] {
  return current.includes(chainId) ? current : [...current, chainId].sort((a, b) => a - b);
}

function removeResolvingChain(current: number[], chainId: number): number[] {
  return current.filter((id) => id !== chainId);
}

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
    resolvingChainIds: [],
    perChain: [],
  });
  const requestIdRef = useRef(0);
  const lastResolutionRef = useRef<LastResolutionContext | null>(null);

  const resolve = useCallback(async (guildId: string, walletAddress: string) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    lastResolutionRef.current = null;
    setState({ isResolving: true, resolvingChainIds: [], perChain: [] });

    try {
      // Fetch roles including their on-chain requirements.
      const roles = (await guildPassClient.roles.getRoles({
        guildId,
      })) as GuildRoleWithRequirements[];
      const plan = buildRoleEligibilityResolutionPlan(roles);

      if (plan.requirements.length === 0) {
        if (requestIdRef.current !== requestId) return;
        setState({
          isResolving: false,
          resolvingChainIds: [],
          perChain: plan.configurationErrors,
        });
        return;
      }

      const rpcsByChain: Record<number, string[]> = {};
      for (const { chainId } of plan.requirements) {
        rpcsByChain[chainId] = getRpcsForChain(chainId);
      }

      const requirementsByChain = groupRequirementsByChain(plan.requirements);
      const chainIds = Array.from(requirementsByChain.keys()).sort((a, b) => a - b);
      lastResolutionRef.current = {
        guildId,
        walletAddress,
        requirementsByChain,
        rpcsByChain,
      };

      if (requestIdRef.current !== requestId) return;
      setState({
        isResolving: true,
        resolvingChainIds: chainIds,
        perChain: plan.configurationErrors,
      });

      await Promise.all(
        chainIds.map(async (chainId) => {
          const result = await resolveRoleEligibilityForChain({
            walletAddress,
            chainId,
            requirements: requirementsByChain.get(chainId) ?? [],
            rpcs: rpcsByChain[chainId],
            timeouts: rpcConfig.timeouts,
          });

          if (requestIdRef.current !== requestId) return;

          setState((current) => {
            const resolvingChainIds = removeResolvingChain(current.resolvingChainIds, chainId);
            return {
              ...current,
              isResolving: resolvingChainIds.length > 0,
              resolvingChainIds,
              perChain: upsertPerChainResolution(current.perChain, result),
            };
          });
        }),
      );
    } catch (e: any) {
      if (requestIdRef.current !== requestId) return;
      setState({
        isResolving: false,
        resolvingChainIds: [],
        perChain: [],
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  const retryChain = useCallback(async (chainId: number) => {
    const context = lastResolutionRef.current;
    const requirements = context?.requirementsByChain.get(chainId);

    if (!context || !requirements) {
      return;
    }

    const requestId = requestIdRef.current;

    setState((current) => ({
      ...current,
      isResolving: true,
      resolvingChainIds: addResolvingChain(current.resolvingChainIds, chainId),
      error: undefined,
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
      const resolvingChainIds = removeResolvingChain(current.resolvingChainIds, chainId);
      return {
        ...current,
        isResolving: resolvingChainIds.length > 0,
        resolvingChainIds,
        perChain: upsertPerChainResolution(current.perChain, result),
      };
    });
  }, []);

  return useMemo(
    () => ({ ...state, resolve, retryChain }),
    [resolve, retryChain, state],
  );
};
