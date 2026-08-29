import type { GuildListItem } from "../../src/features/guilds/useGuilds";

export const LARGE_MEMBERSHIP_SET_SIZE = 200;

export function generateLargeMembershipSet(count: number = LARGE_MEMBERSHIP_SET_SIZE): GuildListItem[] {
  const statuses: GuildListItem["status"][] = ["active", "inactive", "expired", "revoked", "unknown"];
  return Array.from({ length: count }, (_, i) => {
    const isActive = i % 4 !== 0;
    return {
      id: `guild-${i+1}`,
      name: `Guild ${i+1}`,
      isActive,
      roleCount: (i % 5) + 1,
      status: statuses[i % statuses.length],
      lastSyncedAt: Date.now() - i * 1000,
    };
  });
}
