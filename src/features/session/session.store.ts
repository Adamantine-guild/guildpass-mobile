import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { Session, SessionAdapter, SessionStatus } from "./session.types";
import { noopSessionAdapter } from "./session.adapter";
import { secureStorage } from "../../lib/storage";

interface SessionStore extends Session {
  adapter: SessionAdapter;
  _hasHydrated: boolean;
  /** Set when a refresh fails and the user must re-authenticate (sign again). */
  reAuthRequired: boolean;
  setAdapter(adapter: SessionAdapter): void;
  setHasHydrated(state: boolean): void;
  /** Called after wallet address is obtained — runs the adapter sign-in flow */
  startSession(walletAddress: string): Promise<void>;
  /** Refresh the access token by rotating the stored refresh token */
  refreshSession(): Promise<void>;
  /** Clear session and call adapter sign-out (revokes the refresh token) */
  endSession(): Promise<void>;
  /** Restore session status from persisted state without re-authenticating */
  restoreSession(partial: Partial<Session>): void;
  /**
   * Return a non-expired access token, transparently refreshing first if the
   * current one is expired. Returns null when no session / refresh fails.
   */
  getValidAccessToken(): Promise<string | null>;
}

/** Skew (ms) subtracted from expiry so we refresh slightly before the token dies. */
const EXPIRY_SKEW_MS = 5000;

function isExpired(expiresAt: number | null): boolean {
  return expiresAt !== null && Date.now() > expiresAt - EXPIRY_SKEW_MS;
}

export const useSessionStore = create<SessionStore>()(
  persist(
    (set, get) => ({
      status: "unauthenticated",
      walletAddress: null,
      accessToken: null,
      expiresAt: null,
      adapter: noopSessionAdapter,
      _hasHydrated: false,
      reAuthRequired: false,

      setAdapter(adapter) {
        set({ adapter });
      },

      setHasHydrated(state) {
        set({ _hasHydrated: state });
      },

      async startSession(walletAddress) {
        set({ status: "authenticating", walletAddress, reAuthRequired: false });
        try {
          const { accessToken, expiresAt } = await get().adapter.signIn(walletAddress);
          set({ status: "authenticated", accessToken, expiresAt });
        } catch {
          set({ status: "failed", accessToken: null, expiresAt: null });
        }
      },

      async refreshSession() {
        const { adapter, walletAddress } = get();
        if (!walletAddress) return;
        try {
          const result = await adapter.refresh();
          set({
            accessToken: result.accessToken,
            expiresAt: result.expiresAt,
            status: "authenticated",
            reAuthRequired: false,
          });
        } catch {
          // Refresh failed — the access token is unusable and there is no valid
          // refresh token to rotate. Surface re-auth so the UI can prompt a
          // fresh sign-in.
          set({ status: "expired", accessToken: null, expiresAt: null, reAuthRequired: true });
        }
      },

      async endSession() {
        const { adapter } = get();
        // Local clear is best-effort and runs first/independently of server
        // revocation: a failing `signOut` must not leave the refresh token on
        // device. Both are wrapped so neither can break logout.
        await adapter.clearRefreshToken().catch(() => {});
        await adapter.signOut().catch(() => {});
        set({
          status: "unauthenticated",
          walletAddress: null,
          accessToken: null,
          expiresAt: null,
          reAuthRequired: false,
        });
      },

      restoreSession(partial) {
        const status: SessionStatus =
          partial.accessToken && !isExpired(partial.expiresAt ?? null)
            ? "authenticated"
            : "unauthenticated";
        set({ ...partial, status });
      },

      async getValidAccessToken() {
        const state = get();
        if (!state.accessToken) return null;
        if (!isExpired(state.expiresAt)) return state.accessToken;

        // Access token expired — refresh transparently, then return the fresh one.
        await state.refreshSession();
        const next = get();
        return next.status === "authenticated" ? next.accessToken : null;
      },
    }),
    {
      name: "session-storage",
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        status: state.status,
        walletAddress: state.walletAddress,
        // Only the access token is persisted here. The refresh token lives in its
        // own secure key (refreshTokenStorage) and is never serialized alongside.
        accessToken: state.accessToken,
        expiresAt: state.expiresAt,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

/** Convenience selector — current session status */
export function getSessionStatus(): SessionStatus {
  return useSessionStore.getState().status;
}

/**
 * Synchronous access-token read for the SDK fetch wrapper. Returns whatever
 * token exists (even if slightly stale) — the fetch wrapper handles 401 →
 * refresh, so it must not itself block on a refresh here.
 */
export function getCurrentAccessToken(): string | null {
  return useSessionStore.getState().accessToken;
}
