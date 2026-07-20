import { getChainDisplayName, isKnownChainId } from "../../lib/chainRegistry";

export type GuildRequirement = {
  id: string;
  name: string;
  chainId: number;
};

export type GuildConfigRequirement = {
  id: string;
  name?: string;
  chainId: number;
};

export type GroupedGuildRequirement = {
  chainId: number;
  label: string;
  requirements: GuildRequirement[];
};

export function normalizeRoleRequirements(
  roles: Array<{ id: string; name: string; chainId?: number }> | undefined,
  guildConfigRequirements: GuildConfigRequirement[] | undefined,
  fallbackChainId: number,
): GuildRequirement[] {
  return (roles ?? []).map((role) => {
    const configRequirement = guildConfigRequirements?.find(
      (requirement) => requirement.id === role.id || requirement.name === role.name,
    );

    return {
      id: role.id,
      name: role.name,
      chainId: Number.isFinite(role.chainId) ? role.chainId! : configRequirement?.chainId ?? fallbackChainId,
    };
  });
}

export function groupRoleRequirementsByChain(
  requirements: GuildRequirement[] | undefined,
  fallbackChainId: number,
): GroupedGuildRequirement[] {
  const normalized = (requirements ?? []).map((requirement) => ({
    ...requirement,
    chainId: Number.isFinite(requirement.chainId) ? requirement.chainId : fallbackChainId,
  }));

  const grouped = new Map<number, GuildRequirement[]>();

  for (const requirement of normalized) {
    const bucket = grouped.get(requirement.chainId) ?? [];
    bucket.push(requirement);
    grouped.set(requirement.chainId, bucket);
  }

  return Array.from(grouped.entries())
    .map(([chainId, items]) => ({
      chainId,
      label: isKnownChainId(chainId)
        ? `${getChainDisplayName(chainId)} (${chainId})`
        : `Unsupported network (${chainId})`,
      requirements: items,
    }))
    .sort((left, right) => left.chainId - right.chainId);
}
