import { appConfig } from "../../config/appConfig";
import { authClient } from "../auth/authClientInstance";
import { createSiweSessionAdapter, MessageSigner, SiweConfig } from "./siweSessionAdapter";
import { createRefreshTokenStorage } from "./refreshTokenStorage";
import { SessionAdapter } from "./session.types";

/**
 * Resolve the SIWE message parameters from app config, defaulting the domain to
 * the API host and the URI to the app's deep-link scheme when not set.
 */
export function resolveSiweConfig(): SiweConfig {
  let domain = appConfig.siweDomain;
  if (!domain) {
    try {
      domain = new URL(appConfig.apiUrl).host;
    } catch {
      domain = "guildpass";
    }
  }
  return {
    domain,
    uri: appConfig.siweUri ?? "guildpass://login",
    chainId: appConfig.chainId,
    statement: "Sign in to GuildPass to prove wallet ownership.",
    expirationMs: 10 * 60 * 1000, // SIWE message valid for 10 minutes
  };
}

/**
 * Build the production session adapter: SIWE + rotating refresh tokens, backed by
 * the shared AuthClient and the dedicated secure refresh-token key.
 *
 * `signer` comes from the active wallet connector (`connector.signMessage`). A
 * connector that cannot sign (e.g. a manually-entered address) has no signer and
 * must not use this adapter — see `useWallet` for that fallback.
 */
export function createSessionAdapter(signer: MessageSigner): SessionAdapter {
  return createSiweSessionAdapter({
    authClient,
    signer,
    refreshTokenStorage: createRefreshTokenStorage(),
    siweConfig: resolveSiweConfig(),
  });
}
