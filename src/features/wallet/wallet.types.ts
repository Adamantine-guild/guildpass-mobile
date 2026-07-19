export type WalletConnectionKind = "manual" | "walletconnect" | "coinbase" | "metamask" | null;

export type WalletState = {
  walletAddress: string | null;
  isConnected: boolean;
  /** Which provider established the current connection */
  connectionKind: WalletConnectionKind;
  _hasHydrated: boolean;
};

export type WalletActions = {
  setWalletAddress: (address: string | null, kind?: WalletConnectionKind) => void;
  disconnect: () => void;
  setHasHydrated: (state: boolean) => void;
};
