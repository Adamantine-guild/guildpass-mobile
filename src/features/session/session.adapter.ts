import { SessionAdapter } from "./session.types";

/**
 * Lightweight adapter that keeps the app's current behavior while exposing the
 * contract required by the centralized API client.
 */
export const noopSessionAdapter: SessionAdapter = {
  async getAccessToken() {
    return null;
  },
  async signIn(walletAddress) {
    return { token: `noop:${walletAddress}`, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 };
  },
  async refresh(token) {
    return { token, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 };
  },
  async signOut(_token) {
    // nothing to do
  },
  async invalidateSession() {
    // nothing to do
  },
  isAuthenticated() {
    return false;
  },
};
