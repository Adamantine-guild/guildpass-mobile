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
      isVerified: false,
      _hasHydrated: false,
      setHasHydrated: (state) => set({ _hasHydrated: state }),
      setWalletAddress: (address, kind?: WalletConnectionKind, isVerified?: boolean) => {
        const result = validateAndNormalizeAddress(address);
        if (!result.valid) {
          return;
        }
        set({
          walletAddress: result.address,
          isConnected: true,
          connectionKind: kind ?? "manual",
          isVerified: isVerified ?? false,
        });
      },
      setVerified: (status: boolean) => set({ isVerified: status }),
      disconnect: () =>
        set({
          walletAddress: null,
          isConnected: false,
          connectionKind: null,
          isVerified: false,
        }),
    }),
    {
      name: "wallet-storage",
      storage: createJSONStorage(() => migratingSecureStorage),
      // Only persist the address, connection state, and verification status
      partialize: (state) => ({
        walletAddress: state.walletAddress,
        isConnected: state.isConnected,
        connectionKind: state.connectionKind,
        isVerified: state.isVerified,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
