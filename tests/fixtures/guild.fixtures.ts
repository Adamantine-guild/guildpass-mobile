/**
 * Guild fixtures
 *
 * Contract shapes for every guild-related response the app consumes from the
 * GuildPass SDK.  Any change to the SDK's response structure that breaks these
 * shapes will cause the hook tests to fail – making the mismatch visible before
 * it reaches production.
 */

// ---------------------------------------------------------------------------
// Base types (mirrors what @guildpass/sdk returns)
// ---------------------------------------------------------------------------

export type GuildFixture = {
  id: string;
  name: string;
  description: string;
  ownerAddress: string;
  chainId: number;
  isActive: boolean;
};

export type GuildConfigFixture = {
  guildId: string;
  requiredRoles: string[];
  accessPolicy: "any" | "all";
  /** Hex-encoded secp256k1 public key the guild uses to sign QR payloads. */
  issuerPublicKey?: string;
  issuerKeys?: Record<string, string> | Array<{ kid: string; publicKey: string; status?: "active" | "revoked" }>;
  /** Optional per-requirement chain metadata from the backend. */
  requirements?: Array<{
    id: string;
    name: string;
    chainId: number;
  }>;
};

// ---------------------------------------------------------------------------
// Test issuer keypair (secp256k1).
// ONLY used by the QR signature verification tests to produce real signatures
// and a matching published public key. Never used outside tests.
// ---------------------------------------------------------------------------

import { ec as EC } from "elliptic";

const ec = new EC("secp256k1");

export const TEST_ISSUER_PRIVATE_KEY =
  "541e96dcbd902e0d8e6e12a9805fcb0a6563c445e4779f81c8aeadae14197ac4";

export const TEST_ISSUER_PUBLIC_KEY =
  "043531a2fb8dd43af42b386c706b45aa03191fb518fc309b62bf5ed976806187b4a05f2157cac94457dfb72cc37cff021a544b03b2f99049097c2f45e7e81527de";

export const TEST_ISSUER_PRIVATE_KEY_V2 =
  "c87509a1c067bbde78beb793e6fa76530b6382a4c0241e5e4a9ec0a0f44dc0d3";

export const TEST_ISSUER_PUBLIC_KEY_V2 = ec
  .keyFromPrivate(TEST_ISSUER_PRIVATE_KEY_V2, "hex")
  .getPublic(false, "hex");

export const TEST_REVOKED_PRIVATE_KEY =
  "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

export const TEST_REVOKED_PUBLIC_KEY = ec
  .keyFromPrivate(TEST_REVOKED_PRIVATE_KEY, "hex")
  .getPublic(false, "hex");

export type RoleFixture = {
  id: string;
  name: string;
  guildId: string;
};

// ---------------------------------------------------------------------------
// Guild detail – happy path
// ---------------------------------------------------------------------------

export const GUILD_DETAIL_FIXTURE: GuildFixture = {
  id: "guild_abc",
  name: "Alpha Guild",
  description: "The flagship GuildPass community.",
  ownerAddress: "0xOwnerAddress1234567890123456789012345678",
  chainId: 1,
  isActive: true,
};

/** Minimal guild – only fields the SDK guarantees, description omitted */
export const GUILD_DETAIL_NO_DESCRIPTION_FIXTURE: GuildFixture = {
  id: "guild_xyz",
  name: "Beta Community",
  description: "",
  ownerAddress: "0xAnotherOwner0000000000000000000000000001",
  chainId: 11155111,
  isActive: true,
};

/** Inactive guild – should render "INACTIVE" badge in GuildCard */
export const GUILD_DETAIL_INACTIVE_FIXTURE: GuildFixture = {
  id: "guild_123",
  name: "Gamma DAO",
  description: "A deprecated test guild.",
  ownerAddress: "0xOldOwner00000000000000000000000000000002",
  chainId: 1,
  isActive: false,
};

// ---------------------------------------------------------------------------
// Guild config
// ---------------------------------------------------------------------------

export const GUILD_CONFIG_FIXTURE: GuildConfigFixture = {
  guildId: "guild_abc",
  requiredRoles: ["member", "admin"],
  accessPolicy: "any",
  issuerPublicKey: TEST_ISSUER_PUBLIC_KEY,
  issuerKeys: { "key-1": TEST_ISSUER_PUBLIC_KEY },
};

export const GUILD_MIXED_CHAIN_CONFIG_FIXTURE: GuildConfigFixture = {
  guildId: "guild_mixed_chain",
  requiredRoles: ["member", "contributor", "admin"],
  accessPolicy: "all",
  requirements: [
    { id: "req_eth", name: "Member", chainId: 1 },
    { id: "req_base", name: "Contributor", chainId: 8453 },
    { id: "req_future", name: "Admin", chainId: 999999 },
  ],
};

// ---------------------------------------------------------------------------
// Roles list – happy path
// ---------------------------------------------------------------------------

export const ROLES_LIST_FIXTURE: RoleFixture[] = [
  { id: "role_1", name: "Member", guildId: "guild_abc" },
  { id: "role_2", name: "Contributor", guildId: "guild_abc" },
  { id: "role_3", name: "Admin", guildId: "guild_abc" },
];

/** Empty roles list – GuildDetail should render the "No roles defined" message */
export const ROLES_EMPTY_FIXTURE: RoleFixture[] = [];

// ---------------------------------------------------------------------------
// Unknown chain ID – for Issue #100 regression tests
// ---------------------------------------------------------------------------

/**
 * A guild whose chainId (999999) is intentionally absent from the app's chain
 * registry.  The guild detail screen must render an "Unsupported network"
 * indicator for chain-dependent elements while leaving the rest of the screen
 * intact (name, description, owner, membership, roles with known chain IDs).
 */
export const GUILD_UNKNOWN_CHAIN_FIXTURE: GuildFixture = {
  id: "guild_unknown_chain",
  name: "Future L2 Guild",
  description: "A guild on a chain the app hasn't been updated to recognise yet.",
  ownerAddress: "0xFutureOwner0000000000000000000000000099",
  chainId: 999999,
  isActive: true,
};

/**
 * A role that carries a per-role chainId override pointing to an unrecognised
 * network (e.g., an L2 added server-side before the next app release).
 */
export type RoleWithChainFixture = RoleFixture & { chainId: number };

export const ROLES_WITH_UNKNOWN_CHAIN_FIXTURE: RoleWithChainFixture[] = [
  { id: "role_known", name: "Member", guildId: "guild_abc", chainId: 1 },
  { id: "role_unknown", name: "Future Role", guildId: "guild_abc", chainId: 999999 },
];
