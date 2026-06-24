export type AccessCheckParams = {
  walletAddress: string;
  guildId: string;
  resourceId: string;
};

export const guildKeys = {
  detail: (guildId: string) => ["guild", guildId] as const,
  config: (guildId: string) => ["guild-config", guildId] as const,
  roles: (guildId: string) => ["guild-roles", guildId] as const,
};

export const membershipKeys = {
  detail: (walletAddress: string | null, guildId: string) =>
    ["membership", walletAddress, guildId] as const,
  userRoles: (walletAddress: string | null, guildId: string) =>
    ["user-roles", walletAddress, guildId] as const,
};

export const accessCheckKeys = {
  detail: (params: AccessCheckParams) => ["access-check", params] as const,
};
