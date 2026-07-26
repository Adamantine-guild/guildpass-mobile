import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { secureStorage } from "../../lib/storage";

interface BiometricStore {
  /** Whether biometric authentication is required before access-check actions */
  biometricRequired: boolean;
  _hasHydrated: boolean;
  setBiometricRequired(value: boolean): void;
  setHasHydrated(state: boolean): void;
}

export const useBiometricStore = create<BiometricStore>()(
  persist(
    (set) => ({
      biometricRequired: false,
      _hasHydrated: false,

      setBiometricRequired(value) {
        set({ biometricRequired: value });
      },

      setHasHydrated(state) {
        set({ _hasHydrated: state });
      },
    }),
    {
      name: "biometric-storage",
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        biometricRequired: state.biometricRequired,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
