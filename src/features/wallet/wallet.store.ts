import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { WalletState, WalletActions, WalletConnectionKind } from "./wallet.types";
import { validateAndNormalizeAddress } from "../../lib/walletValidation";
import { migratingSecureStorage } from "../../lib/storage";

export const useWalletStore = create<WalletState & WalletActions & { _hasHydrated: boolean }>()(
  persist(
    (set) => ({
      walletAddress: null,
      isConnected: false,
      connectionKind: null,
      _hasHydrated: false,
      setHasHydrated: (state) => set({ _hasHydrated: state }),
      setWalletAddress: (address, kind?: WalletConnectionKind) => {
        const result = validateAndNormalizeAddress(address);
        if (!result.valid) {
          return;
        }
        set({
          walletAddress: result.address,
          isConnected: true,
          connectionKind: kind ?? "manual",
        });
      },
      disconnect: () =>
        set({
          walletAddress: null,
          isConnected: false,
          connectionKind: null,
        }),
    }),
    {
      name: "wallet-storage",
      storage: createJSONStorage(() => migratingSecureStorage),
      // Only persist the address, not transient WC session state
      partialize: (state) => ({
        walletAddress: state.walletAddress,
        isConnected: state.isConnected,
        connectionKind: state.connectionKind,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
