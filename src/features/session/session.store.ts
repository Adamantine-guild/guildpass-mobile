import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { Session, SessionAdapter, SessionStatus } from "./session.types";
import { noopSessionAdapter } from "./session.adapter";
import { migratingSecureStorage } from "../../lib/storage";

interface SessionStore extends Session {
  adapter: SessionAdapter;
  _hasHydrated: boolean;
  setAdapter(adapter: SessionAdapter): void;
  setHasHydrated(state: boolean): void;
  /** Called after wallet address is obtained — runs the adapter sign-in flow */
  startSession(walletAddress: string): Promise<void>;
  /** Refresh an existing session token */
  refreshSession(): Promise<void>;
  /** Clear session and call adapter sign-out */
  endSession(): Promise<void>;
  /** Restore session status from persisted state without re-authenticating */
  restoreSession(partial: Partial<Session>): void;
}

function isExpired(expiresAt: number | null): boolean {
  return expiresAt !== null && Date.now() > expiresAt;
}

export const useSessionStore = create<SessionStore>()(
  persist(
    (set, get) => ({
      status: "unauthenticated",
      walletAddress: null,
      token: null,
      expiresAt: null,
      adapter: noopSessionAdapter,
      _hasHydrated: false,

      setAdapter(adapter) {
        set({ adapter });
      },

      setHasHydrated(state) {
        set({ _hasHydrated: state });
      },

      async startSession(walletAddress) {
        set({ status: "authenticating", walletAddress });
        try {
          const { token, expiresAt } = await get().adapter.signIn(walletAddress);
          set({ status: "authenticated", token, expiresAt });
        } catch {
          set({ status: "failed" });
        }
      },

      async refreshSession() {
        const { token, adapter } = get();
        if (!token) return;
        try {
          const result = await adapter.refresh(token);
          set({ token: result.token, expiresAt: result.expiresAt, status: "authenticated" });
        } catch {
          set({ status: "expired" });
        }
      },

      async endSession() {
        const { token, adapter } = get();
        if (token) {
          await adapter.signOut(token).catch(() => {});
        }
        set({ status: "unauthenticated", walletAddress: null, token: null, expiresAt: null });
      },

      restoreSession(partial) {
        const status: SessionStatus =
          partial.token && !isExpired(partial.expiresAt ?? null) ? "authenticated" : "unauthenticated";
        set({ ...partial, status });
      },
    }),
    {
      name: "session-storage",
      storage: createJSONStorage(() => migratingSecureStorage),
      partialize: (state) => ({
        status: state.status,
        walletAddress: state.walletAddress,
        token: state.token,
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
