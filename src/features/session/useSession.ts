import { useSessionStore } from "./session.store";
import { SessionAdapter } from "./session.types";

export function useSession() {
  const {
    status,
    walletAddress,
    token,
    expiresAt,
    startSession,
    refreshSession,
    endSession,
    setAdapter,
  } = useSessionStore();

  return {
    status,
    walletAddress,
    token,
    expiresAt,
    isAuthenticated: status === "authenticated",
    startSession,
    refreshSession,
    endSession,
    setAdapter: (adapter: SessionAdapter) => setAdapter(adapter),
  };
}
