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
};

// ---------------------------------------------------------------------------
// Test issuer keypair (secp256k1).
// ONLY used by the QR signature verification tests to produce real signatures
// and a matching published public key. Never used outside tests.
// ---------------------------------------------------------------------------

export const TEST_ISSUER_PRIVATE_KEY =
  "541e96dcbd902e0d8e6e12a9805fcb0a6563c445e4779f81c8aeadae14197ac4";

export const TEST_ISSUER_PUBLIC_KEY =
  "043531a2fb8dd43af42b386c706b45aa03191fb518fc309b62bf5ed976806187b4a05f2157cac94457dfb72cc37cff021a544b03b2f99049097c2f45e7e81527de";

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
