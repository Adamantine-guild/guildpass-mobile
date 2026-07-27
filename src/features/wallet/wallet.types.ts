/**
 * `embedded` is an EVM address provisioned by the configured embedded-wallet
 * provider. It deliberately uses the same address/session path as external
 * wallets so membership and access checks remain provider-agnostic.
 */
export type WalletConnectionKind =
  "manual" | "walletconnect" | "embedded" | "coinbase" | "metamask" | null;

export type WalletState = {
  walletAddress: string | null;
  isConnected: boolean;
  /** Which provider established the current connection */
  connectionKind: WalletConnectionKind;
  /** Whether ownership of the wallet has been verified via a signature */
  isVerified: boolean;
  _hasHydrated: boolean;
};

export type WalletActions = {
  setWalletAddress: (address: string | null, kind?: WalletConnectionKind, isVerified?: boolean) => void;
  setVerified: (status: boolean) => void;
  disconnect: () => void;
  setHasHydrated: (state: boolean) => void;
};
