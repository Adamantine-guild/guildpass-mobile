/**
 * Default entity fetchers for the sync engine, backed by the GuildPass SDK.
 * Kept separate from the engine so tests can inject fakes without touching
 * the SDK singleton.
 */

import { guildPassClient } from "../../lib/guildpassClient";
import type { SyncEntityFetchers } from "./syncEngine";

export const defaultSyncFetchers: SyncEntityFetchers = {
  membership: ({ walletAddress, guildId }) =>
    guildPassClient.membership.getMembership({ walletAddress: walletAddress!, guildId }),
  "user-roles": ({ walletAddress, guildId }) =>
    guildPassClient.roles.getUserRoles({ walletAddress: walletAddress!, guildId }),
  guild: ({ guildId }) => guildPassClient.guilds.getGuild({ guildId }),
  "guild-config": ({ guildId }) => guildPassClient.guilds.getGuildConfig({ guildId }),
  "guild-roles": ({ guildId }) => guildPassClient.roles.getRoles({ guildId }),
};
