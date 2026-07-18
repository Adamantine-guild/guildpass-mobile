import { GuildPassClient } from "@guildpass/sdk";
import { appConfig } from "../config/appConfig";
import { createAuthenticatedFetch } from "../features/auth/authFetch";
import { useSessionStore, getCurrentAccessToken } from "../features/session/session.store";

/**
 * The SDK client is the single transport for all GuildPass API calls. We inject
 * an authenticated fetch so that:
 *   - every request carries `Authorization: Bearer <accessToken>` from the
 *     proven session (not a client-asserted address), and
 *   - a 401 transparently triggers one session refresh + retry (silent in the
 *     common case), then surfaces the 401 only if refresh fails.
 *
 * The token and refresh are read lazily (inside the fetch wrapper) so constructing
 * this singleton before a session exists is safe, and there is no module-init
 * cycle: the wrapper references the store only when a request actually runs.
 */
export const guildPassClient = new GuildPassClient({
  apiUrl: appConfig.apiUrl,
  chainId: appConfig.chainId,
  fetch: createAuthenticatedFetch({
    getAccessToken: () => getCurrentAccessToken(),
    refresh: async () => {
      await useSessionStore.getState().refreshSession();
      return useSessionStore.getState().accessToken;
    },
  }),
});
