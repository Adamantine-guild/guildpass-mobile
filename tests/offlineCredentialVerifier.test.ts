import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CachedAttestation } from "../src/features/attestation/types";
import {
  resolveOfflineAccessPolicy,
  verifyOfflineCredentialAccess,
} from "../src/features/access/offlineCredentialVerifier";

const state = vi.hoisted(() => ({
  attestations: [] as CachedAttestation[],
  issuerKey: {
    guildId: "guild-alpha",
    issuerAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as `0x${string}`,
    registeredAt: 1_700_000_000,
    cachedAt: Date.parse("2026-07-25T10:00:00.000Z"),
  } as null | {
    guildId: string;
    issuerAddress: `0x${string}`;
    registeredAt: number;
    cachedAt: number;
  },
  revocationMetadata: {
    guildId: "guild-alpha",
    fetchedAt: Date.parse("2026-07-25T10:05:00.000Z"),
    revokedAddressCount: 0,
  } as null | {
    guildId: string;
    fetchedAt: number;
    revokedAddressCount: number;
  },
  validationByRole: new Map<string, { valid: boolean; reason?: string }>(),
}));

vi.mock("../src/features/attestation/attestationStorage", () => ({
  getAttestationsForGuild: vi.fn(async () => state.attestations),
}));

vi.mock("../src/features/attestation/issuerKeyRegistry", () => ({
  getCachedIssuerKey: vi.fn(async () => state.issuerKey),
  getTrustedAttestationRevocationRegistryMetadata: vi.fn(async () => state.revocationMetadata),
}));

vi.mock("../src/features/attestation/verifySignature", () => ({
  validateAttestation: vi.fn(async (attestation: CachedAttestation) => {
    return state.validationByRole.get(attestation.roleId) ?? { valid: true };
  }),
}));

vi.mock("../src/config/appConfig", () => ({
  appConfig: { chainId: 1 },
}));

const walletAddress = "0x1234567890123456789012345678901234567890" as const;
const now = new Date("2026-07-26T12:00:00.000Z");

function attestation(roleId: string, overrides: Partial<CachedAttestation> = {}): CachedAttestation {
  return {
    guildId: "guild-alpha",
    roleId,
    wallet: walletAddress,
    issuedAt: 1_700_000_000,
    expiresAt: Math.floor(Date.parse("2026-07-27T12:00:00.000Z") / 1000),
    signature: `0x${"a".repeat(130)}` as `0x${string}`,
    cachedAt: Date.parse("2026-07-25T10:10:00.000Z"),
    ...overrides,
  };
}

describe("offline credential verifier", () => {
  beforeEach(() => {
    state.attestations = [];
    state.issuerKey = {
      guildId: "guild-alpha",
      issuerAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      registeredAt: 1_700_000_000,
      cachedAt: Date.parse("2026-07-25T10:00:00.000Z"),
    };
    state.revocationMetadata = {
      guildId: "guild-alpha",
      fetchedAt: Date.parse("2026-07-25T10:05:00.000Z"),
      revokedAddressCount: 0,
    };
    state.validationByRole.clear();
  });

  it("resolves resource-specific policy from cached guild config", () => {
    const policy = resolveOfflineAccessPolicy(
      {
        guildId: "guild-alpha",
        resources: [{ resourceId: "vip-door", requiredRoles: ["member"], accessPolicy: "all" }],
      },
      "vip-door",
    );

    expect(policy).toEqual({
      requiredRoles: ["member"],
      accessPolicy: "all",
      source: "resource",
    });
  });

  it("grants access from a cached signed role attestation without network", async () => {
    state.attestations = [attestation("Member")];

    const result = await verifyOfflineCredentialAccess({
      walletAddress,
      guildId: "guild-alpha",
      resourceId: "vip-door",
      guildConfig: {
        guildId: "guild-alpha",
        requiredRoles: ["member"],
        accessPolicy: "any",
      },
      guildRoles: [{ id: "member", name: "Member" }],
      now,
    });

    expect(result).toMatchObject({
      valid: true,
      hasAccess: true,
      availability: "verified",
      matchedRoles: ["member"],
      requiredRoles: ["member"],
      policySource: "guild",
      lastSyncedAt: "2026-07-25T10:00:00.000Z",
      revocationSyncedAt: "2026-07-25T10:05:00.000Z",
    });
  });

  it("fails closed when issuer key material was not synchronized", async () => {
    state.issuerKey = null;
    state.attestations = [attestation("member")];

    const result = await verifyOfflineCredentialAccess({
      walletAddress,
      guildId: "guild-alpha",
      resourceId: "vip-door",
      guildConfig: { guildId: "guild-alpha", requiredRoles: ["member"], accessPolicy: "any" },
      now,
    });

    expect(result.valid).toBe(false);
    expect(result.availability).toBe("unavailable");
    expect(result.reason).toContain("cached issuer key");
  });

  it("denies an all-policy gate when only one signed role is available", async () => {
    state.attestations = [attestation("member")];

    const result = await verifyOfflineCredentialAccess({
      walletAddress,
      guildId: "guild-alpha",
      resourceId: "vip-door",
      guildConfig: {
        guildId: "guild-alpha",
        requiredRoles: ["member", "admin"],
        accessPolicy: "all",
      },
      now,
    });

    expect(result.valid).toBe(false);
    expect(result.availability).toBe("unsatisfied");
    expect(result.matchedRoles).toEqual(["member"]);
    expect(result.reason).toContain("admin");
  });

  it("accepts a direct resource credential when no policy cache is available", async () => {
    state.attestations = [attestation("access-vip-door")];

    const result = await verifyOfflineCredentialAccess({
      walletAddress,
      guildId: "guild-alpha",
      resourceId: "vip-door",
      now,
    });

    expect(result).toMatchObject({
      valid: true,
      hasAccess: true,
      availability: "verified",
      matchedRoles: ["access-vip-door"],
      requiredRoles: ["access-vip-door"],
      policySource: "resource-attestation",
    });
  });

  it("rejects a cached credential that now fails revocation or expiry validation", async () => {
    state.attestations = [attestation("member")];
    state.validationByRole.set("member", {
      valid: false,
      reason: "Attestation was signed by a revoked issuer key",
    });

    const result = await verifyOfflineCredentialAccess({
      walletAddress,
      guildId: "guild-alpha",
      resourceId: "vip-door",
      guildConfig: { guildId: "guild-alpha", requiredRoles: ["member"], accessPolicy: "any" },
      now,
    });

    expect(result.valid).toBe(false);
    expect(result.availability).toBe("invalid");
    expect(result.reason).toContain("revoked issuer key");
  });
});
