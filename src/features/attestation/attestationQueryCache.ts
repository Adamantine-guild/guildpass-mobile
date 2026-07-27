import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { GuildIssuerKey, RoleAttestation } from "./types";

export interface AttestationVerificationCacheResult {
  valid: boolean;
  attestation?: RoleAttestation;
  error?: string;
  validityStatus?: string;
}

export interface AttestationCacheParams {
  walletAddress: string;
  guildId: string;
  roleId: string;
}

export const attestationQueryKeys = {
  verification: (walletAddress: string | null, guildId: string | null, roleId: string | null) =>
    ["attestation", walletAddress, guildId, roleId] as const,
  localVerification: (
    walletAddress: string | null,
    guildId: string | null,
    roleId: string | null,
  ) => ["local-attestation-verification", walletAddress, guildId, roleId] as const,
  cachedExists: (walletAddress: string | null, guildId: string | null, roleId: string | null) =>
    ["cached-attestation-exists", walletAddress, guildId, roleId] as const,
  cachedForGuild: (walletAddress: string | null, guildId: string | null) =>
    ["cached-attestations-guild", walletAddress, guildId] as const,
  issuerKey: (guildId: string) => ["attestation-issuer-key", guildId] as const,
  issuerKeyRefresh: ["attestation-issuer-key-refresh"] as const,
};

function upsertAttestation(
  current: RoleAttestation[] | undefined,
  next: RoleAttestation,
): RoleAttestation[] {
  const existing = current ?? [];
  return [...existing.filter((attestation) => attestation.roleId !== next.roleId), next];
}

function removeAttestation(
  current: RoleAttestation[] | undefined,
  roleId: string,
): RoleAttestation[] {
  return (current ?? []).filter((attestation) => attestation.roleId !== roleId);
}

export function writeVerifiedAttestationToCache(
  queryClient: QueryClient,
  params: AttestationCacheParams,
  result: AttestationVerificationCacheResult,
): void {
  queryClient.setQueryData(
    attestationQueryKeys.verification(params.walletAddress, params.guildId, params.roleId),
    result,
  );
  queryClient.setQueryData(
    attestationQueryKeys.cachedExists(params.walletAddress, params.guildId, params.roleId),
    result.valid && !!result.attestation,
  );
  queryClient.setQueryData<RoleAttestation[]>(
    attestationQueryKeys.cachedForGuild(params.walletAddress, params.guildId),
    (current) =>
      result.valid && result.attestation
        ? upsertAttestation(current, result.attestation)
        : removeAttestation(current, params.roleId),
  );
}

export function writeIssuerKeyToCache(
  queryClient: QueryClient,
  guildId: string,
  issuerAddress: `0x${string}`,
  now: number = Date.now(),
): GuildIssuerKey {
  const issuerKey: GuildIssuerKey = {
    guildId,
    issuerAddress,
    registeredAt: Math.floor(now / 1000),
    cachedAt: now,
  };

  queryClient.setQueryData(attestationQueryKeys.issuerKey(guildId), issuerKey);
  return issuerKey;
}

function isAttestationQueryForGuild(queryKey: QueryKey, guildId: string): boolean {
  const root = queryKey[0];
  return (
    (root === "attestation" ||
      root === "local-attestation-verification" ||
      root === "cached-attestation-exists" ||
      root === "cached-attestations-guild") &&
    queryKey.includes(guildId)
  );
}

export async function invalidateAttestationQueriesForGuild(
  queryClient: QueryClient,
  guildId: string,
): Promise<void> {
  await queryClient.invalidateQueries({
    predicate: (query) => isAttestationQueryForGuild(query.queryKey, guildId),
    refetchType: "active",
  });
}
