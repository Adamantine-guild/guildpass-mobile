import { useSessionStore } from "./session.store";

/**
 * UI-facing session hook focused on the authenticated-call lifecycle.
 *
 * Exposes `reAuthRequired` so screens can show a "session expired, sign in again"
 * prompt when a refresh rotation fails, and `getValidAccessToken` for callers
 * that need a guaranteed-fresh token before making an authenticated request.
 */
export function useAuthenticatedSession() {
  const status = useSessionStore((s) => s.status);
  const reAuthRequired = useSessionStore((s) => s.reAuthRequired);
  const getValidAccessToken = useSessionStore((s) => s.getValidAccessToken);
  const startSession = useSessionStore((s) => s.startSession);

  return {
    status,
    isAuthenticated: status === "authenticated",
    reAuthRequired,
    /** Transparently refresh-if-expired; returns null if no usable session. */
    getValidAccessToken,
    /** Re-run sign-in for the current wallet (used by the re-auth prompt). */
    reauthenticate: (walletAddress: string) => startSession(walletAddress),
  };
}
