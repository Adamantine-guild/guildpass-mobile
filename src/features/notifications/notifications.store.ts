import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NotificationState, NotificationCategory, PermissionStatus } from "./notifications.types";
import { NotificationsAdapter, mockNotificationsAdapter } from "./notifications.adapter";

interface NotificationsStore extends NotificationState {
  adapter: NotificationsAdapter;
  setAdapter: (adapter: NotificationsAdapter) => void;
  setPushToken: (token: string | null) => void;
  setPermissionStatus: (status: PermissionStatus) => void;
  togglePreference: (category: NotificationCategory, walletAddress: string | null) => Promise<void>;
  registerToken: (walletAddress: string) => Promise<void>;
  setError: (error: string | null) => void;
}

export const useNotificationsStore = create<NotificationsStore>()(
  persist(
    (set, get) => ({
      pushToken: null,
      permissionStatus: "undetermined",
      preferences: {
        role_changes: true,
        access_grants: true,
        membership_updates: true,
      },
      isRegistering: false,
      error: null,
      adapter: mockNotificationsAdapter,

      setAdapter: (adapter) => set({ adapter }),

      setPushToken: (token) => set({ pushToken: token }),

      setPermissionStatus: (status) => set({ permissionStatus: status }),

      togglePreference: async (category, walletAddress) => {
        const currentPreferences = get().preferences;
        const newPreferences = {
          ...currentPreferences,
          [category]: !currentPreferences[category],
        };

        set({ preferences: newPreferences });

        if (walletAddress) {
          try {
            await get().adapter.updatePreferences(walletAddress, newPreferences);
          } catch (e) {
            console.error("Failed to sync preferences to backend", e);
            // We keep the local state updated but log the error
          }
        }
      },

      setError: (error) => set({ error }),

      registerToken: async (walletAddress) => {
        const { pushToken, adapter } = get();
        if (!pushToken) return;

        set({ isRegistering: true, error: null });
        try {
          await adapter.registerToken(walletAddress, pushToken);
        } catch (e) {
          set({ error: (e as Error).message || "Failed to register token" });
        } finally {
          set({ isRegistering: false });
        }
      },
    }),
    {
      name: "guildpass-notifications",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        preferences: state.preferences,
        pushToken: state.pushToken,
        permissionStatus: state.permissionStatus,
      }),
    }
  )
);
