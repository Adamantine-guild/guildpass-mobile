import { SessionAdapter } from "./session.types";

/**
 * No-op adapter — treats a connected wallet as authenticated WITHOUT proving
 * ownership. Kept for local development and for connectors that cannot sign
 * (e.g. a manually-entered address). It mints a fake access token and does not
 * manage a refresh token.
 *
 * DO NOT ship this as the default in production: it provides no cryptographic
 * proof of wallet ownership, which is exactly the gap the SIWE adapter closes.
 * The real default is `createSiweSessionAdapter` (see `createSessionAdapter.ts`).
 */
export const noopSessionAdapter: SessionAdapter = {
  async signIn(walletAddress) {
    return { accessToken: `noop:${walletAddress}`, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 };
  },
  async refresh() {
    return { accessToken: `noop:refreshed`, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 };
  },
  async signOut() {
    // nothing to revoke
  },
  async clearRefreshToken() {
    // no refresh token is managed by the no-op adapter
  },
};

export { createSiweSessionAdapter } from "./siweSessionAdapter";
