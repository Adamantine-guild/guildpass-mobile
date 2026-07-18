import { useSessionStore } from "./session.store";
import { SessionAdapter } from "./session.types";

export function useSession() {
  const {
    status,
    walletAddress,
    accessToken,
    expiresAt,
    reAuthRequired,
    startSession,
    refreshSession,
    endSession,
    setAdapter,
    getValidAccessToken,
  } = useSessionStore();

  return {
    status,
    walletAddress,
    accessToken,
    expiresAt,
    /** True when a refresh failed and the user must sign in again. */
    reAuthRequired,
    isAuthenticated: status === "authenticated",
    /** Access token is missing or past its expiry (skew-adjusted). */
    isAccessTokenExpired: accessToken === null || (expiresAt !== null && Date.now() >= expiresAt),
    startSession,
    refreshSession,
    endSession,
    setAdapter: (adapter: SessionAdapter) => setAdapter(adapter),
    /** Transparently refresh-if-expired and return a usable access token. */
    getValidAccessToken,
  };
}
