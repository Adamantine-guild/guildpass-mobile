import {
  AuthClientConfig,
  AuthClientError,
  FetchLike,
  NonceResponse,
  RefreshParams,
  RevokeParams,
  SiweExchangeParams,
  TokenPair,
} from "./authClient.types";

/**
 * Client for the SIWE token-exchange endpoints.
 *
 * Deliberately thin and transport-injected: every method is a single fetch with
 * a typed request/response. Because the transport is configurable, all flows are
 * exercised against a mock `fetch` in tests with no live backend.
 *
 * Endpoints (relative to `apiUrl`):
 *   GET  /auth/nonce           → { nonce }
 *   POST /auth/siwe            { message, signature }   → TokenPair
 *   POST /auth/refresh         { refreshToken }          → TokenPair (rotated)
 *   POST /auth/revoke          { refreshToken }          → 204 (best-effort)
 */
export class AuthClient {
  private readonly apiUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(config: AuthClientConfig) {
    if (!config.apiUrl) {
      throw new Error("AuthClient requires an apiUrl");
    }
    // Strip a single trailing slash so `${apiUrl}/auth/...` never double-slashes.
    this.apiUrl = config.apiUrl.replace(/\/$/, "");
    const transport = config.fetch ?? (globalThis.fetch as FetchLike | undefined);
    if (typeof transport !== "function") {
      throw new Error("AuthClient requires a fetch implementation (config.fetch or globalThis.fetch)");
    }
    this.fetchImpl = transport;
  }

  /** Request a fresh single-use nonce for the SIWE message. */
  async getNonce(): Promise<NonceResponse> {
    const res = await this.fetchImpl(`${this.apiUrl}/auth/nonce`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const body = await this.readJson(res, "nonce request");
    if (typeof body?.nonce !== "string" || body.nonce.length === 0) {
      throw new AuthClientError(res.status, "Nonce response missing a nonce");
    }
    return { nonce: body.nonce };
  }

  /** Exchange a signed SIWE message for an access + refresh token pair. */
  async exchangeSiwe(params: SiweExchangeParams): Promise<TokenPair> {
    const res = await this.fetchImpl(`${this.apiUrl}/auth/siwe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ message: params.message, signature: params.signature }),
    });
    return this.readTokenPair(res, "SIWE exchange");
  }

  /**
   * Rotate the refresh token: exchange the current refresh token for a new
   * access token AND a new refresh token. The server invalidates the old one.
   */
  async refresh(params: RefreshParams): Promise<TokenPair> {
    const res = await this.fetchImpl(`${this.apiUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refreshToken: params.refreshToken }),
    });
    return this.readTokenPair(res, "token refresh");
  }

  /**
   * Revoke a refresh token (logout). Best-effort: a non-2xx response is
   * swallowed because the client clears local tokens regardless — the goal is
   * to invalidate server-side, and a failed revoke must not block logout.
   */
  async revoke(params: RevokeParams): Promise<void> {
    try {
      await this.fetchImpl(`${this.apiUrl}/auth/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: params.refreshToken }),
      });
    } catch {
      // Network failure on revoke is non-fatal — local tokens are cleared anyway.
    }
  }

  private async readJson(res: Response, context: string): Promise<any> {
    if (!res.ok) {
      throw new AuthClientError(res.status, `${context} failed with status ${res.status}`);
    }
    try {
      return await res.json();
    } catch {
      throw new AuthClientError(res.status, `${context} returned invalid JSON`);
    }
  }

  private async readTokenPair(res: Response, context: string): Promise<TokenPair> {
    const body = await this.readJson(res, context);
    const { accessToken, refreshToken, accessExpiresAt, refreshExpiresAt } = body ?? {};
    if (
      typeof accessToken !== "string" ||
      typeof refreshToken !== "string" ||
      typeof accessExpiresAt !== "number"
    ) {
      throw new AuthClientError(res.status, `${context} response is missing token fields`);
    }
    const pair: TokenPair = { accessToken, refreshToken, accessExpiresAt };
    if (typeof refreshExpiresAt === "number") {
      pair.refreshExpiresAt = refreshExpiresAt;
    }
    return pair;
  }
}
