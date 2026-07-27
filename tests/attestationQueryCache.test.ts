import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  attestationQueryKeys,
  writeIssuerKeyToCache,
  writeVerifiedAttestationToCache,
} from "../src/features/attestation/attestationQueryCache";
import type { RoleAttestation } from "../src/features/attestation/types";

const walletAddress = "0x1234567890123456789012345678901234567890";
const guildId = "guild-alpha";

function attestation(roleId: string, expiresAt = 2_000_000_000): RoleAttestation {
  return {
    guildId,
    roleId,
    wallet: walletAddress,
    issuedAt: 1_700_000_000,
    expiresAt,
    signature: ("0x" + "a".repeat(130)) as `0x${string}`,
  };
}

describe("attestation query cache synchronization", () => {
  it("writes a verified attestation to exact and aggregate cache entries", () => {
    const queryClient = new QueryClient();
    const roleAttestation = attestation("member");

    writeVerifiedAttestationToCache(
      queryClient,
      { walletAddress, guildId, roleId: "member" },
      { valid: true, attestation: roleAttestation, validityStatus: "Valid" },
    );

    expect(
      queryClient.getQueryData(attestationQueryKeys.verification(walletAddress, guildId, "member")),
    ).toStrictEqual({
      valid: true,
      attestation: roleAttestation,
      validityStatus: "Valid",
    });
    expect(
      queryClient.getQueryData(attestationQueryKeys.cachedExists(walletAddress, guildId, "member")),
    ).toBe(true);
    expect(
      queryClient.getQueryData(attestationQueryKeys.cachedForGuild(walletAddress, guildId)),
    ).toStrictEqual([roleAttestation]);
  });

  it("deduplicates role attestations when refreshed data arrives", () => {
    const queryClient = new QueryClient();
    const older = attestation("member", 2_000_000_000);
    const newer = attestation("member", 2_100_000_000);

    queryClient.setQueryData(attestationQueryKeys.cachedForGuild(walletAddress, guildId), [older]);

    writeVerifiedAttestationToCache(
      queryClient,
      { walletAddress, guildId, roleId: "member" },
      { valid: true, attestation: newer },
    );

    expect(
      queryClient.getQueryData(attestationQueryKeys.cachedForGuild(walletAddress, guildId)),
    ).toStrictEqual([newer]);
  });

  it("removes a stale aggregate entry when the authoritative result is invalid", () => {
    const queryClient = new QueryClient();
    const stale = attestation("member");

    queryClient.setQueryData(attestationQueryKeys.cachedForGuild(walletAddress, guildId), [stale]);

    writeVerifiedAttestationToCache(
      queryClient,
      { walletAddress, guildId, roleId: "member" },
      { valid: false, error: "Attestation revoked" },
    );

    expect(
      queryClient.getQueryData(attestationQueryKeys.cachedExists(walletAddress, guildId, "member")),
    ).toBe(false);
    expect(
      queryClient.getQueryData(attestationQueryKeys.cachedForGuild(walletAddress, guildId)),
    ).toStrictEqual([]);
  });

  it("writes refreshed issuer keys to a targeted guild cache entry", () => {
    const queryClient = new QueryClient();
    const issuerAddress = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";

    const issuerKey = writeIssuerKeyToCache(queryClient, guildId, issuerAddress, 1_700_000_000_000);

    expect(issuerKey).toStrictEqual({
      guildId,
      issuerAddress,
      registeredAt: 1_700_000_000,
      cachedAt: 1_700_000_000_000,
    });
    expect(queryClient.getQueryData(attestationQueryKeys.issuerKey(guildId))).toStrictEqual(
      issuerKey,
    );
  });
});
