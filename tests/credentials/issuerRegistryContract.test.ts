/**
 * Conformance suite for the `CredentialIssuerRegistry` contract (Issue #226).
 *
 * The same assertions run against both shipped implementations — the QR access
 * path and the EIP-712 attestation path — because the value of the interface is
 * that a caller can rely on it without knowing which credential kind it holds.
 *
 * The contract that matters here is fail-closed: implementations never throw, and
 * an indeterminate outcome is reported as `unavailable` / `null` so the caller
 * rejects. The two implementations reach that outcome by different routes (the QR
 * path tries a network refresh first, the attestation path never touches the
 * network), and this suite deliberately asserts the shared *outcome* rather than
 * the mechanism.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guildPassClient } from "../../src/lib/guildpassClient";
import {
  clearIssuerKeyCache as clearQrIssuerKeyCache,
  qrAccessIssuerRegistry,
} from "../../src/features/access/guildIssuerKey";
import {
  attestationIssuerRegistry,
  cacheAttestationRevocationRegistry,
  cacheIssuerKey,
  clearAttestationRevocationCache,
} from "../../src/features/attestation/issuerKeyRegistry";
import { registerBuiltInIssuers } from "../../src/lib/credentials/registerBuiltInIssuers";
import {
  getCredentialIssuerRegistry,
  listCredentialIssuerRegistries,
  resetCredentialIssuerRegistries,
} from "../../src/lib/credentials/credentialRegistry";
import type {
  CredentialIssuerRegistry,
  IssuerKeyRef,
} from "../../src/lib/credentials/credentialIssuer.types";

// `vi.mock` is hoisted above the imports above by the vitest transform.
vi.mock("../../src/lib/storage", () => {
  const store = new Map<string, string>();
  return {
    migratingSecureStorage: {
      getItem: vi.fn(async (key: string) => store.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: vi.fn(async (key: string) => {
        store.delete(key);
      }),
    },
  };
});

vi.mock("../../src/lib/guildpassClient", () => ({
  guildPassClient: { guilds: { getGuildConfig: vi.fn() } },
}));

const getGuildConfigMock = vi.mocked(guildPassClient.guilds.getGuildConfig);

const ACTIVE_ADDRESS = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as const;
const REVOKED_ADDRESS = "0x1111111111111111111111111111111111111111" as const;

type ContractCase = {
  name: string;
  registry: CredentialIssuerRegistry;
  /** Guild seeded with one active key and one revoked reference. */
  seedGuildId: string;
  /** Guild that was never seeded, and cannot be resolved. */
  emptyGuildId: string;
  seed(): Promise<void>;
  activeRef: IssuerKeyRef;
  revokedRef: IssuerKeyRef;
  expectedKeyMaterial: string;
};

const cases: ContractCase[] = [
  {
    name: "qr_access",
    registry: qrAccessIssuerRegistry,
    seedGuildId: "contract-qr-seeded",
    emptyGuildId: "contract-qr-empty",
    async seed() {
      getGuildConfigMock.mockResolvedValueOnce({
        guildId: "contract-qr-seeded",
        issuerKeys: { "kid-active": "pub-active" },
        revokedKids: ["kid-revoked"],
      } as never);
      // Prime both the in-memory and persisted tiers.
      await qrAccessIssuerRegistry.lookupIssuerKey(
        "contract-qr-seeded",
        { kind: "kid", kid: "kid-active" },
        new Date(),
      );
    },
    activeRef: { kind: "kid", kid: "kid-active" },
    revokedRef: { kind: "kid", kid: "kid-revoked" },
    expectedKeyMaterial: "pub-active",
  },
  {
    name: "eip712_attestation",
    registry: attestationIssuerRegistry,
    seedGuildId: "contract-attestation-seeded",
    emptyGuildId: "contract-attestation-empty",
    async seed() {
      await cacheIssuerKey({
        guildId: "contract-attestation-seeded",
        issuerAddress: ACTIVE_ADDRESS,
        registeredAt: Math.floor(Date.now() / 1000),
        cachedAt: Date.now(),
      });
      await cacheAttestationRevocationRegistry(
        "contract-attestation-seeded",
        new Set([REVOKED_ADDRESS]),
      );
    },
    activeRef: { kind: "address", address: ACTIVE_ADDRESS },
    revokedRef: { kind: "address", address: REVOKED_ADDRESS },
    expectedKeyMaterial: ACTIVE_ADDRESS,
  },
];

beforeEach(async () => {
  getGuildConfigMock.mockReset();
  clearQrIssuerKeyCache();
  await clearAttestationRevocationCache();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe.each(cases)("CredentialIssuerRegistry contract — $name", (testCase) => {
  it("declares the credential kind it implements", () => {
    expect(testCase.registry.credentialKind).toBe(testCase.name);
  });

  it("resolves active key material for a known reference", async () => {
    await testCase.seed();

    const lookup = await testCase.registry.lookupIssuerKey(
      testCase.seedGuildId,
      testCase.activeRef,
    );

    expect(lookup.status).toBe("active");
    expect(lookup).toMatchObject({ keyMaterial: testCase.expectedKeyMaterial });
  });

  it("reports a revoked reference as revoked rather than resolving it", async () => {
    await testCase.seed();

    const lookup = await testCase.registry.lookupIssuerKey(
      testCase.seedGuildId,
      testCase.revokedRef,
    );

    expect(lookup.status).toBe("revoked");
  });

  it("answers isRevoked definitively for a seeded guild", async () => {
    await testCase.seed();

    await expect(
      testCase.registry.isRevoked(testCase.seedGuildId, testCase.revokedRef),
    ).resolves.toBe(true);
    await expect(
      testCase.registry.isRevoked(testCase.seedGuildId, testCase.activeRef),
    ).resolves.toBe(false);
  });

  it("fails closed with an unavailable status when nothing is resolvable", async () => {
    // QR: the refresh attempt fails (offline). Attestation: nothing was ever cached.
    getGuildConfigMock.mockRejectedValue(new Error("offline"));

    const lookup = await testCase.registry.lookupIssuerKey(
      testCase.emptyGuildId,
      testCase.activeRef,
    );

    expect(lookup.status).toBe("unavailable");
  });

  it("fails closed with null from isRevoked when status is indeterminate", async () => {
    getGuildConfigMock.mockRejectedValue(new Error("offline"));

    await expect(
      testCase.registry.isRevoked(testCase.emptyGuildId, testCase.activeRef),
    ).resolves.toBeNull();
  });

  it("never throws, even when its backing store is unreachable", async () => {
    getGuildConfigMock.mockRejectedValue(new Error("offline"));

    await expect(
      testCase.registry.lookupIssuerKey(testCase.emptyGuildId, testCase.activeRef),
    ).resolves.toBeDefined();
    await expect(
      testCase.registry.isRevoked(testCase.emptyGuildId, testCase.activeRef),
    ).resolves.toBeNull();
  });

  it("returns null from isRevoked for a reference shape it cannot answer", async () => {
    await testCase.seed();

    const foreignRef: IssuerKeyRef =
      testCase.activeRef.kind === "kid"
        ? { kind: "address", address: ACTIVE_ADDRESS }
        : { kind: "kid", kid: "kid-active" };

    await expect(
      testCase.registry.isRevoked(testCase.seedGuildId, foreignRef),
    ).resolves.toBeNull();
  });
});

describe("registerBuiltInIssuers", () => {
  beforeEach(() => {
    resetCredentialIssuerRegistries();
  });

  afterEach(() => {
    resetCredentialIssuerRegistries();
  });

  it("registers both shipped credential kinds, and is idempotent", () => {
    registerBuiltInIssuers();
    registerBuiltInIssuers();

    expect(listCredentialIssuerRegistries()).toHaveLength(2);
    expect(getCredentialIssuerRegistry("qr_access")).toBe(qrAccessIssuerRegistry);
    expect(getCredentialIssuerRegistry("eip712_attestation")).toBe(attestationIssuerRegistry);
  });

  it("leaves the verification paths working before it has run", async () => {
    // The whole point of keeping gating off the global registry: an access check
    // that happens before bootstrap must fail closed, not throw.
    expect(listCredentialIssuerRegistries()).toEqual([]);

    getGuildConfigMock.mockRejectedValue(new Error("offline"));

    await expect(
      qrAccessIssuerRegistry.isRevoked("never-seeded", { kind: "kid", kid: "kid-active" }),
    ).resolves.toBeNull();
    await expect(
      attestationIssuerRegistry.isRevoked("never-seeded", {
        kind: "address",
        address: ACTIVE_ADDRESS,
      }),
    ).resolves.toBeNull();
  });
});
