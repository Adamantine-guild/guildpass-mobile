import { create } from "zustand";
import { WalletState, WalletActions } from "./wallet.types";

export const useWalletStore = create<WalletState & WalletActions>((set) => ({
  walletAddress: null,
  isConnected: false,
  setWalletAddress: (address) =>
    set({
      walletAddress: address,
      isConnected: !!address,
    }),
  disconnect: () =>
    set({
      walletAddress: null,
      isConnected: false,
    }),
}));
