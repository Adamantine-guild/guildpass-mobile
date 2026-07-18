export type SessionStatus =
  | "unauthenticated"
  | "wallet_connected"
  | "authenticating"
  | "authenticated"
  | "expired"
  | "failed";

export interface Session {
  status: SessionStatus;
  walletAddress: string | null;
  /**
   * Short-lived bearer token attached to authenticated API/SDK calls. Null until
   * authenticated. The long-lived, rotating refresh token is NOT stored here — it
   * lives in its own secure key (see `refreshTokenStorage.ts`).
   */
  accessToken: string | null;
  /** Epoch millis when `accessToken` expires. Null when unauthenticated. */
  expiresAt: number | null;
}

/** Access-token result returned by an adapter's sign-in / refresh. */
export interface SessionTokens {
  accessToken: string;
  /** Epoch millis when `accessToken` expires. */
  expiresAt: number;
}

export type SessionErrorCode =
  | "NO_REFRESH_TOKEN"
  | "SIGN_IN_FAILED"
  | "REFRESH_FAILED"
  | "SIGNER_UNAVAILABLE";

/** Typed error so the store can distinguish "must re-auth" from transient failures. */
export class SessionError extends Error {
  readonly code: SessionErrorCode;

  constructor(code: SessionErrorCode, message: string) {
    super(message);
    this.name = "SessionError";
    this.code = code;
  }
}

/**
 * Adapter interface — implement to back a session with SIWE, a backend, or a
 * dev no-op.
 *
 * Refresh-token lifecycle is OWNED by the adapter: `signIn` persists the initial
 * refresh token, `refresh` reads + rotates it, and `signOut` revokes + clears it.
 * The store only ever holds the access token, so the sensitive credential never
 * leaks into the persisted session JSON.
 */
export interface SessionAdapter {
  /** Prove ownership of `walletAddress` and mint the first token pair. */
  signIn(walletAddress: string): Promise<SessionTokens>;
  /** Rotate the stored refresh token for a fresh access token. */
  refresh(): Promise<SessionTokens>;
  /** Revoke the stored refresh token and clear it locally. */
  signOut(): Promise<void>;
  /**
   * Clear the locally-stored refresh token WITHOUT contacting the server.
   *
   * `endSession` calls this as a best-effort guarantee: even if `signOut`
   * (which also attempts server revocation) throws, the sensitive credential is
   * still wiped from device storage so a failed logout cannot leave an orphaned
   * token behind.
   */
  clearRefreshToken(): Promise<void>;
}
