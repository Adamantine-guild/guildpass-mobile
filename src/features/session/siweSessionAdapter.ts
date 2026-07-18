import { AuthClient } from "../auth/authClient";
import { buildSiweMessage } from "../auth/siwe";
import { SessionAdapter, SessionError, SessionTokens } from "./session.types";
import { RefreshTokenStorage } from "./refreshTokenStorage";

/** Signs a SIWE message with the connected wallet's key. Injected from the connector. */
export type MessageSigner = (message: string) => Promise<string>;

export interface SiweConfig {
  /** dnsauthority in the SIWE preamble, e.g. "app.guildpass.xyz". */
  domain: string;
  /** URI subject of the sign-in, e.g. "guildpass://login". */
  uri: string;
  /** EIP-155 chain the sign-in is scoped to. */
  chainId: number;
  /** Human-readable statement the user signs. */
  statement: string;
  /** Optional lifetime (ms) added to `issuedAt` to produce `expirationTime`. */
  expirationMs?: number;
}

export interface SiweSessionAdapterDeps {
  authClient: AuthClient;
  signer: MessageSigner;
  refreshTokenStorage: RefreshTokenStorage;
  siweConfig: SiweConfig;
  /** Injected clock for deterministic tests. Defaults to `Date.now`. */
  now?: () => number;
}

/**
 * SessionAdapter backed by Sign-In With Ethereum + rotating refresh tokens.
 *
 * signIn:  nonce → build SIWE message → sign → exchange → persist refresh token.
 * refresh: read stored refresh token → rotate at the server → persist the new one.
 * signOut: revoke the stored refresh token → clear it locally.
 *
 * The refresh token never enters the zustand store; it is read from and written
 * to `refreshTokenStorage` (a dedicated secure key) here.
 */
export function createSiweSessionAdapter(deps: SiweSessionAdapterDeps): SessionAdapter {
  const { authClient, signer, refreshTokenStorage, siweConfig } = deps;
  const now = deps.now ?? Date.now;

  return {
    async signIn(walletAddress: string): Promise<SessionTokens> {
      try {
        const { nonce } = await authClient.getNonce();

        const issuedAtMs = now();
        const issuedAt = new Date(issuedAtMs).toISOString();
        const expirationTime = siweConfig.expirationMs
          ? new Date(issuedAtMs + siweConfig.expirationMs).toISOString()
          : undefined;

        const message = buildSiweMessage({
          domain: siweConfig.domain,
          address: walletAddress,
          statement: siweConfig.statement,
          uri: siweConfig.uri,
          version: "1",
          chainId: siweConfig.chainId,
          nonce,
          issuedAt,
          expirationTime,
        });

        const signature = await signer(message);
        const pair = await authClient.exchangeSiwe({ message, signature });

        await refreshTokenStorage.set(pair.refreshToken);
        return { accessToken: pair.accessToken, expiresAt: pair.accessExpiresAt };
      } catch (err) {
        if (err instanceof SessionError) throw err;
        throw new SessionError(
          "SIGN_IN_FAILED",
          `SIWE sign-in failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },

    async refresh(): Promise<SessionTokens> {
      const refreshToken = await refreshTokenStorage.get();
      if (!refreshToken) {
        // No refresh token to rotate — the caller must re-authenticate.
        throw new SessionError("NO_REFRESH_TOKEN", "No refresh token available; re-authentication required");
      }

      try {
        const pair = await authClient.refresh({ refreshToken });
        // Rotation: persist the new refresh token, invalidating the old one.
        await refreshTokenStorage.set(pair.refreshToken);
        return { accessToken: pair.accessToken, expiresAt: pair.accessExpiresAt };
      } catch (err) {
        throw new SessionError(
          "REFRESH_FAILED",
          `Token refresh failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },

    async signOut(): Promise<void> {
      const refreshToken = await refreshTokenStorage.get();
      if (refreshToken) {
        // Best-effort server revocation, then always clear locally.
        await authClient.revoke({ refreshToken });
      }
      await refreshTokenStorage.clear();
    },

    async clearRefreshToken(): Promise<void> {
      // Local-only wipe; intentionally does NOT contact the server. `endSession`
      // calls this so a failed `signOut` (server revocation) still removes the
      // credential from device storage.
      await refreshTokenStorage.clear();
    },
  };
}
