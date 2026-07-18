/**
 * Auth token-exchange contract.
 *
 * This mirrors the `client.auth` namespace declared in
 * `src/types/guildpass-sdk.d.ts` — the shape the GuildPass SDK is expected to
 * own once it ships SIWE support. Until then the mobile app implements the same
 * contract directly against `/auth/*` (see `authClient.ts`), so swapping to the
 * SDK later is a drop-in.
 */

/** A `fetch`-compatible transport. Injectable so tests never touch the network. */
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface AuthClientConfig {
  /** Base API URL, e.g. "https://api.guildpass.xyz". No trailing slash required. */
  apiUrl: string;
  /** Transport. Defaults to `globalThis.fetch`. */
  fetch?: FetchLike;
}

/** Server response to a nonce request. */
export interface NonceResponse {
  /** Single-use nonce the client embeds in the SIWE message. */
  nonce: string;
}

/** Parameters for exchanging a signed SIWE message for a token pair. */
export interface SiweExchangeParams {
  /** The exact EIP-4361 message string that was signed. */
  message: string;
  /** The wallet's signature over `message` (hex). */
  signature: string;
}

/** Parameters for rotating a refresh token. */
export interface RefreshParams {
  refreshToken: string;
}

/** Parameters for revoking a refresh token (logout). */
export interface RevokeParams {
  refreshToken: string;
}

/**
 * A short-lived access token plus a rotating refresh token.
 *
 * `refreshToken` is rotated on every {@link RefreshParams} exchange — the value
 * returned here replaces the previous one, which the server invalidates.
 */
export interface TokenPair {
  /** Bearer token attached to authenticated API calls. Short-lived. */
  accessToken: string;
  /** Rotating token used to obtain the next access token. Store securely. */
  refreshToken: string;
  /** Epoch millis when `accessToken` expires. */
  accessExpiresAt: number;
  /** Optional epoch millis when `refreshToken` expires (forces re-auth). */
  refreshExpiresAt?: number;
}

/** Error thrown for a non-2xx auth response. Carries the HTTP status. */
export class AuthClientError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AuthClientError";
    this.status = status;
  }
}
