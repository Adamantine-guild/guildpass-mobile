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
  /** Opaque token issued by a backend or SIWE challenge — null until authenticated */
  token: string | null;
  expiresAt: number | null;
}

/** Adapter interface — implement to add SIWE, WalletConnect auth, or backend sessions */
export interface SessionAdapter {
  getAccessToken?(): Promise<string | null>;
  signIn(walletAddress: string): Promise<{ token: string; expiresAt: number }>;
  refresh(token: string): Promise<{ token: string; expiresAt: number }>;
  signOut(token: string): Promise<void>;
  invalidateSession?(): Promise<void>;
  isAuthenticated?(): boolean;
}
