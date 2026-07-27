import type { QueryClient } from "@tanstack/react-query";
import { queryKeys, QUERY_ROOTS } from "../../lib/queryKeys";

export type GuildPassStatus = "active" | "inactive" | "expired" | "revoked" | "unknown";

export type CachedGuildPassSummary = {
  guildId: string;
  isActive: boolean;
  roleCount: number;
  status: GuildPassStatus;
  lastSyncedAt?: number;
};

export const GUILD_PASS_QUERY_ROOTS = [
  QUERY_ROOTS.MEMBERSHIP,
  QUERY_ROOTS.MEMBERSHIPS,
  QUERY_ROOTS.WALLET_GUILDS,
  QUERY_ROOTS.USER_ROLES,
  QUERY_ROOTS.GUILD,
  QUERY_ROOTS.GUILD_CONFIG,
  QUERY_ROOTS.GUILD_ROLES,
] as const;

export function isGuildPassQuery(queryKey: readonly unknown[]): boolean {
  const root = queryKey[0];
  return typeof root === "string" && (GUILD_PASS_QUERY_ROOTS as readonly string[]).includes(root);
}

export function getGuildPassStatusLabel(status: GuildPassStatus): string {
  switch (status) {
    case "active":
      return "Active Member";
    case "expired":
      return "Expired";
    case "revoked":
      return "Revoked";
    case "inactive":
      return "Not a Member";
    case "unknown":
    default:
      return "Unknown";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return undefined;
}

function isExpiredTimestamp(value: string | undefined, now: number): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time <= now;
}

export function resolveGuildPassStatus(
  membership: unknown,
  now: number = Date.now(),
): GuildPassStatus {
  if (!isRecord(membership)) {
    return "unknown";
  }

  const explicitStatus = readString(membership, [
    "status",
    "membershipStatus",
    "state",
  ])?.toLowerCase();

  if (
    explicitStatus === "active" ||
    explicitStatus === "inactive" ||
    explicitStatus === "expired" ||
    explicitStatus === "revoked"
  ) {
    return explicitStatus;
  }

  if (readString(membership, ["revokedAt", "revocationDate"])) {
    return "revoked";
  }

  if (isExpiredTimestamp(readString(membership, ["expiresAt", "expiredAt", "validUntil"]), now)) {
    return "expired";
  }

  if (typeof membership.isActive === "boolean") {
    return membership.isActive ? "active" : "inactive";
  }

  return "unknown";
}

function isActiveStatus(status: GuildPassStatus): boolean {
  return status === "active";
}

function roleCountFromMembership(membership: Record<string, unknown>): number | undefined {
  const roles = membership.roles;
  if (Array.isArray(roles)) {
    return roles.length;
  }

  const roleCount = membership.roleCount;
  if (typeof roleCount === "number" && Number.isFinite(roleCount)) {
    return roleCount;
  }

  return undefined;
}

function roleCountFromQuery(
  queryClient: Pick<QueryClient, "getQueryData">,
  walletAddress: string,
  guildId: string,
): number | undefined {
  const roles = queryClient.getQueryData(
    queryKeys.userRoles.byWalletAndGuild(walletAddress, guildId),
  );
  return Array.isArray(roles) ? roles.length : undefined;
}

export function normalizeMembershipForPassSummary(
  membership: unknown,
  options: {
    fallbackGuildId?: string;
    fallbackRoleCount?: number;
    lastSyncedAt?: number;
    now?: number;
  } = {},
): CachedGuildPassSummary | null {
  if (!isRecord(membership)) {
    return null;
  }

  const guildId = readString(membership, ["guildId", "guild_id", "id"]) ?? options.fallbackGuildId;

  if (!guildId) {
    return null;
  }

  const status = resolveGuildPassStatus(membership, options.now);
  const roleCount = roleCountFromMembership(membership) ?? options.fallbackRoleCount ?? 0;

  return {
    guildId,
    isActive: isActiveStatus(status),
    roleCount,
    status,
    lastSyncedAt: options.lastSyncedAt,
  };
}

function getQueryUpdatedAt(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
): number | undefined {
  return queryClient.getQueryCache().find({ queryKey })?.state.dataUpdatedAt;
}

function normalizeAggregateData(
  queryClient: QueryClient,
  walletAddress: string,
): CachedGuildPassSummary[] | undefined {
  const aggregate = queryClient.getQueryData(queryKeys.memberships.byWallet(walletAddress));
  if (!Array.isArray(aggregate)) {
    return undefined;
  }

  const lastSyncedAt = getQueryUpdatedAt(
    queryClient,
    queryKeys.memberships.byWallet(walletAddress),
  );
  return aggregate
    .map((entry) =>
      normalizeMembershipForPassSummary(entry, {
        lastSyncedAt,
      }),
    )
    .filter((entry): entry is CachedGuildPassSummary => entry !== null);
}

function deriveMembershipSummariesFromEntities(
  queryClient: QueryClient,
  walletAddress: string,
): CachedGuildPassSummary[] {
  const walletKey = walletAddress.toLowerCase();
  const summaries = new Map<string, CachedGuildPassSummary>();

  queryClient
    .getQueryCache()
    .getAll()
    .forEach((query) => {
      const [root, queryWalletAddress, guildId] = query.queryKey;
      if (
        root !== QUERY_ROOTS.MEMBERSHIP ||
        typeof queryWalletAddress !== "string" ||
        queryWalletAddress.toLowerCase() !== walletKey ||
        typeof guildId !== "string"
      ) {
        return;
      }

      const summary = normalizeMembershipForPassSummary(query.state.data, {
        fallbackGuildId: guildId,
        fallbackRoleCount: roleCountFromQuery(queryClient, queryWalletAddress, guildId),
        lastSyncedAt: query.state.dataUpdatedAt,
      });

      if (summary) {
        summaries.set(summary.guildId, summary);
      }
    });

  return [...summaries.values()].sort((a, b) => a.guildId.localeCompare(b.guildId));
}

export function getCachedMembershipSummaries(
  queryClient: QueryClient,
  walletAddress: string,
): CachedGuildPassSummary[] | undefined {
  const derived = deriveMembershipSummariesFromEntities(queryClient, walletAddress);
  if (derived.length > 0) {
    return derived;
  }

  return normalizeAggregateData(queryClient, walletAddress);
}

export function rebuildMembershipsAggregateFromCache(
  queryClient: QueryClient,
  walletAddress: string,
): CachedGuildPassSummary[] | undefined {
  const summaries = deriveMembershipSummariesFromEntities(queryClient, walletAddress);
  if (summaries.length === 0) {
    return normalizeAggregateData(queryClient, walletAddress);
  }

  queryClient.setQueryData(queryKeys.memberships.byWallet(walletAddress), summaries);
  return summaries;
}
