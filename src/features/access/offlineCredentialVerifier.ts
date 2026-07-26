import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/queryKeys";
import type { CachedAttestation } from "../attestation/types";
import { getAttestationsForGuild } from "../attestation/attestationStorage";
import {
  getCachedIssuerKey,
  getTrustedAttestationRevocationRegistryMetadata,
} from "../attestation/issuerKeyRegistry";
import { validateAttestation } from "../attestation/verifySignature";
import { appConfig } from "../../config/appConfig";

export type OfflineAccessPolicy = {
  requiredRoles: string[];
  accessPolicy: "any" | "all";
  source: "resource" | "guild" | "resource-attestation";
};

export type OfflineCredentialVerificationResult = {
  valid: boolean;
  hasAccess: boolean;
  availability: "verified" | "unavailable" | "invalid" | "unsatisfied";
  matchedRoles: string[];
  requiredRoles: string[];
  accessPolicy: "any" | "all";
  reason: string;
  policySource: OfflineAccessPolicy["source"];
  checkedAt: string;
  credentialExpiresAt?: string;
  lastSyncedAt?: string;
  revocationSyncedAt?: string;
};

export type OfflineCredentialVerificationParams = {
  walletAddress: string;
  guildId: string;
  resourceId: string;
  chainId?: number;
  guildConfig?: unknown;
  guildRoles?: unknown;
  now?: Date;
};

type RoleCatalogEntry = {
  id?: string;
  name?: string;
};

const DIRECT_RESOURCE_ROLE_PREFIX = "access-";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeRole(value: string): string {
  return value.trim().toLowerCase();
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(cleanString).filter((role): role is string => role !== null);
}

function requirementArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const roles: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      const role = cleanString(entry);
      if (role) roles.push(role);
      continue;
    }

    if (!isRecord(entry)) continue;
    const role =
      cleanString(entry.roleId) ??
      cleanString(entry.role) ??
      cleanString(entry.id) ??
      cleanString(entry.name);
    if (role) roles.push(role);
  }
  return roles;
}

function accessPolicy(value: unknown): "any" | "all" {
  return value === "all" ? "all" : "any";
}

function extractRolesFromPolicyRecord(record: Record<string, unknown>): string[] {
  return (
    stringArray(record.requiredRoles).length > 0
      ? stringArray(record.requiredRoles)
      : stringArray(record.roleIds).length > 0
        ? stringArray(record.roleIds)
        : stringArray(record.roles).length > 0
          ? stringArray(record.roles)
          : requirementArray(record.requirements)
  );
}

function policyFromRecord(
  record: Record<string, unknown>,
  source: OfflineAccessPolicy["source"],
): OfflineAccessPolicy | null {
  const requiredRoles = extractRolesFromPolicyRecord(record);

  if (requiredRoles.length === 0) {
    return null;
  }

  return {
    requiredRoles,
    accessPolicy: accessPolicy(record.accessPolicy ?? record.policy),
    source,
  };
}

function findResourcePolicy(config: Record<string, unknown>, resourceId: string): OfflineAccessPolicy | null {
  const containers = [
    config.resources,
    config.accessResources,
    config.resourcePolicies,
    isRecord(config.access) ? config.access.resources : undefined,
    isRecord(config.access) ? config.access.resourcePolicies : undefined,
  ];

  for (const container of containers) {
    if (Array.isArray(container)) {
      for (const entry of container) {
        if (!isRecord(entry)) continue;
        const id =
          cleanString(entry.resourceId) ??
          cleanString(entry.id) ??
          cleanString(entry.key) ??
          cleanString(entry.name);
        if (id !== resourceId) continue;

        const policy = policyFromRecord(entry, "resource");
        if (policy) return policy;
      }
      continue;
    }

    if (!isRecord(container)) continue;

    const rawPolicy = container[resourceId];
    if (Array.isArray(rawPolicy)) {
      const requiredRoles = stringArray(rawPolicy);
      if (requiredRoles.length > 0) {
        return { requiredRoles, accessPolicy: "any", source: "resource" };
      }
    }

    if (isRecord(rawPolicy)) {
      const policy = policyFromRecord(rawPolicy, "resource");
      if (policy) return policy;
    }
  }

  return null;
}

export function resolveOfflineAccessPolicy(
  guildConfig: unknown,
  resourceId: string,
): OfflineAccessPolicy | null {
  if (isRecord(guildConfig)) {
    const resourcePolicy = findResourcePolicy(guildConfig, resourceId);
    if (resourcePolicy) return resourcePolicy;

    const guildPolicy = policyFromRecord(guildConfig, "guild");
    if (guildPolicy) return guildPolicy;
  }

  return {
    requiredRoles: [`${DIRECT_RESOURCE_ROLE_PREFIX}${resourceId}`],
    accessPolicy: "any",
    source: "resource-attestation",
  };
}

function roleCatalogEntries(guildRoles: unknown): RoleCatalogEntry[] {
  if (!Array.isArray(guildRoles)) return [];

  return guildRoles
    .filter(isRecord)
    .map((role) => ({
      id: cleanString(role.id) ?? undefined,
      name: cleanString(role.name) ?? undefined,
    }))
    .filter((role) => role.id || role.name);
}

function buildRoleAliasSets(
  requiredRoles: string[],
  guildRoles: unknown,
): Map<string, Set<string>> {
  const catalog = roleCatalogEntries(guildRoles);
  const aliases = new Map<string, Set<string>>();

  for (const requiredRole of requiredRoles) {
    const normalizedRequired = normalizeRole(requiredRole);
    const set = new Set([normalizedRequired]);

    for (const role of catalog) {
      const normalizedId = role.id ? normalizeRole(role.id) : null;
      const normalizedName = role.name ? normalizeRole(role.name) : null;

      if (normalizedId === normalizedRequired || normalizedName === normalizedRequired) {
        if (normalizedId) set.add(normalizedId);
        if (normalizedName) set.add(normalizedName);
      }
    }

    aliases.set(requiredRole, set);
  }

  return aliases;
}

function credentialRoleMatches(
  credentialRoleId: string,
  aliasesByRequiredRole: Map<string, Set<string>>,
): string | null {
  const normalizedCredentialRole = normalizeRole(credentialRoleId);

  for (const [requiredRole, aliases] of aliasesByRequiredRole.entries()) {
    if (aliases.has(normalizedCredentialRole)) {
      return requiredRole;
    }
  }

  return null;
}

function walletMatches(attestation: CachedAttestation, walletAddress: string): boolean {
  return attestation.wallet.toLowerCase() === walletAddress.toLowerCase();
}

function minimumTimestamp(timestamps: number[]): string | undefined {
  const finite = timestamps.filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0);
  if (finite.length === 0) return undefined;
  return new Date(Math.min(...finite)).toISOString();
}

function earliestExpiry(attestations: CachedAttestation[], matchedRoles: string[]): string | undefined {
  const matched = new Set(matchedRoles.map(normalizeRole));
  const expiries = attestations
    .filter((attestation) => matched.has(normalizeRole(attestation.roleId)))
    .map((attestation) => attestation.expiresAt)
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0);

  if (expiries.length === 0) return undefined;
  return new Date(Math.min(...expiries) * 1000).toISOString();
}

export async function verifyOfflineCredentialAccess(
  params: OfflineCredentialVerificationParams,
): Promise<OfflineCredentialVerificationResult> {
  const now = params.now ?? new Date();
  const checkedAt = now.toISOString();
  const chainId = params.chainId ?? appConfig.chainId;
  const policy = resolveOfflineAccessPolicy(params.guildConfig, params.resourceId);

  if (!policy || policy.requiredRoles.length === 0) {
    return {
      valid: false,
      hasAccess: false,
      availability: "unavailable",
      matchedRoles: [],
      requiredRoles: [],
      accessPolicy: "any",
      reason: "Offline verification requires a cached access policy or resource credential.",
      policySource: "resource-attestation",
      checkedAt,
    };
  }

  const issuerKey = await getCachedIssuerKey(params.guildId);
  if (!issuerKey) {
    return {
      valid: false,
      hasAccess: false,
      availability: "unavailable",
      matchedRoles: [],
      requiredRoles: policy.requiredRoles,
      accessPolicy: policy.accessPolicy,
      reason: "Offline verification requires a cached issuer key. Reconnect to sync credentials.",
      policySource: policy.source,
      checkedAt,
    };
  }

  const [revocationMetadata, cachedAttestations] = await Promise.all([
    getTrustedAttestationRevocationRegistryMetadata(params.guildId, now),
    getAttestationsForGuild(params.walletAddress, params.guildId),
  ]);

  if (cachedAttestations.length === 0) {
    return {
      valid: false,
      hasAccess: false,
      availability: "unavailable",
      matchedRoles: [],
      requiredRoles: policy.requiredRoles,
      accessPolicy: policy.accessPolicy,
      reason: "No cached credential was found for offline verification.",
      policySource: policy.source,
      checkedAt,
      lastSyncedAt: minimumTimestamp([issuerKey.cachedAt, revocationMetadata?.fetchedAt ?? 0]),
      revocationSyncedAt: revocationMetadata
        ? new Date(revocationMetadata.fetchedAt).toISOString()
        : undefined,
    };
  }

  const aliasesByRequiredRole = buildRoleAliasSets(policy.requiredRoles, params.guildRoles);
  const matchedRoles = new Set<string>();
  const matchedAttestations: CachedAttestation[] = [];
  const validationErrors: string[] = [];
  let relevantAttestationCount = 0;

  for (const attestation of cachedAttestations) {
    if (!walletMatches(attestation, params.walletAddress)) {
      continue;
    }

    const requiredRole = credentialRoleMatches(attestation.roleId, aliasesByRequiredRole);
    if (!requiredRole) {
      continue;
    }
    relevantAttestationCount += 1;

    const validation = await validateAttestation(attestation, issuerKey.issuerAddress, chainId);
    if (validation.valid) {
      matchedRoles.add(requiredRole);
      matchedAttestations.push(attestation);
      continue;
    }

    if (validation.reason) {
      validationErrors.push(`${attestation.roleId}: ${validation.reason}`);
    }
  }

  const matchedRoleList = Array.from(matchedRoles);
  const hasAccess =
    policy.accessPolicy === "all"
      ? policy.requiredRoles.every((requiredRole) => matchedRoles.has(requiredRole))
      : matchedRoles.size > 0;
  const lastSyncedAt = minimumTimestamp([
    issuerKey.cachedAt,
    revocationMetadata?.fetchedAt ?? 0,
    ...matchedAttestations.map((attestation) => attestation.cachedAt),
  ]);

  if (!hasAccess) {
    const missingRoles = policy.requiredRoles.filter((role) => !matchedRoles.has(role));
    return {
      valid: false,
      hasAccess: false,
      availability:
        validationErrors.length > 0
          ? "invalid"
          : relevantAttestationCount > 0
            ? "unsatisfied"
            : "unavailable",
      matchedRoles: matchedRoleList,
      requiredRoles: policy.requiredRoles,
      accessPolicy: policy.accessPolicy,
      reason:
        validationErrors[0] ??
        `Cached credentials do not satisfy offline access requirements (${missingRoles.join(", ")}).`,
      policySource: policy.source,
      checkedAt,
      credentialExpiresAt: earliestExpiry(matchedAttestations, matchedRoleList),
      lastSyncedAt,
      revocationSyncedAt: revocationMetadata
        ? new Date(revocationMetadata.fetchedAt).toISOString()
        : undefined,
    };
  }

  return {
    valid: true,
    hasAccess: true,
    availability: "verified",
    matchedRoles: matchedRoleList,
    requiredRoles: policy.requiredRoles,
    accessPolicy: policy.accessPolicy,
    reason: "Verified using cached cryptographic credential.",
    policySource: policy.source,
    checkedAt,
    credentialExpiresAt: earliestExpiry(matchedAttestations, matchedRoleList),
    lastSyncedAt,
    revocationSyncedAt: revocationMetadata
      ? new Date(revocationMetadata.fetchedAt).toISOString()
      : undefined,
  };
}

export function getCachedOfflineVerificationInputs(
  queryClient: QueryClient,
  guildId: string,
): Pick<OfflineCredentialVerificationParams, "guildConfig" | "guildRoles"> {
  return {
    guildConfig: queryClient.getQueryData(queryKeys.guildConfig.byId(guildId)),
    guildRoles: queryClient.getQueryData(queryKeys.guildRoles.byId(guildId)),
  };
}
