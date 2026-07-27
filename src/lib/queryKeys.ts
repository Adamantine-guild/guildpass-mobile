import { walletScopedQueryRoots } from "./walletScopedCache";

export const QUERY_ROOTS = {
  MEMBERSHIP: "membership",
  MEMBERSHIPS: "memberships",
  WALLET_GUILDS: "wallet-guilds",
  USER_ROLES: "user-roles",
  GUILD: "guild",
  GUILD_CONFIG: "guild-config",
  GUILD_ROLES: "guild-roles",
  ACCESS_CHECK: "access-check",
  PROFILE: "profile",
  USER_PROFILE: "user-profile",
} as const;

export type QueryRoot = (typeof QUERY_ROOTS)[keyof typeof QUERY_ROOTS];

export const queryKeys = {
  guild: {
    all: ["guild"] as const,
    byId: (guildId: string) => ["guild", guildId] as const,
  },
  guildConfig: {
    all: ["guild-config"] as const,
    byId: (guildId: string) => ["guild-config", guildId] as const,
  },
  guildRoles: {
    all: ["guild-roles"] as const,
    byId: (guildId: string) => ["guild-roles", guildId] as const,
  },
  membership: {
    all: ["membership"] as const,
    byWalletAndGuild: (walletAddress: string, guildId: string) =>
      ["membership", walletAddress, guildId] as const,
  },
  memberships: {
    all: ["memberships"] as const,
    byWallet: (walletAddress: string) => ["memberships", walletAddress] as const,
  },
  walletGuilds: {
    all: ["wallet-guilds"] as const,
    byWallet: (walletAddress: string) => ["wallet-guilds", walletAddress] as const,
  },
  userRoles: {
    all: ["user-roles"] as const,
    byWalletAndGuild: (walletAddress: string, guildId: string) =>
      ["user-roles", walletAddress, guildId] as const,
  },
  accessCheck: {
    all: ["access-check"] as const,
  },
  profile: {
    all: ["profile"] as const,
  },
  userProfile: {
    all: ["user-profile"] as const,
  },
};

export const PERSISTABLE_QUERY_ROOTS: readonly QueryRoot[] = [
  QUERY_ROOTS.MEMBERSHIP,
  QUERY_ROOTS.MEMBERSHIPS,
  QUERY_ROOTS.WALLET_GUILDS,
  QUERY_ROOTS.USER_ROLES,
  QUERY_ROOTS.GUILD,
  QUERY_ROOTS.GUILD_CONFIG,
  QUERY_ROOTS.GUILD_ROLES,
  QUERY_ROOTS.ACCESS_CHECK,
];

export function isPersistableQuery(queryKey: readonly unknown[]): boolean {
  const root = queryKey[0];
  return typeof root === "string" && (PERSISTABLE_QUERY_ROOTS as readonly string[]).includes(root);
}

export const DAL_BACKED_QUERY_ROOTS: readonly QueryRoot[] = [
  QUERY_ROOTS.MEMBERSHIP,
  QUERY_ROOTS.USER_ROLES,
  QUERY_ROOTS.GUILD,
  QUERY_ROOTS.GUILD_CONFIG,
  QUERY_ROOTS.GUILD_ROLES,
  QUERY_ROOTS.MEMBERSHIPS,
];

export function isDalBackedQuery(queryKey: readonly unknown[]): boolean {
  const root = queryKey[0];
  return typeof root === "string" && (DAL_BACKED_QUERY_ROOTS as readonly string[]).includes(root);
}

export function isWalletScopedQueryRoot(root: string): boolean {
  return walletScopedQueryRoots.has(root);
}
