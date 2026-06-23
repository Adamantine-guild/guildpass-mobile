export type WalletState = {
  walletAddress: string | null;
  isConnected: boolean;
};

export type WalletActions = {
  setWalletAddress: (address: string | null) => void;
  disconnect: () => void;
};
