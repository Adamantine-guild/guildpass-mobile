/**
 * Push Notifications Store — Zustand + SecureStore persistence
 *
 * Tracks user's push notification preferences and push token.
 * The store persists to SecureStore to maintain preferences across app launches.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { migratingSecureStorage } from "../../lib/storage";
import type { PushNotificationPreferences } from "./pushNotifications.types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "guildpass:push-notifications:v1";

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface PushNotificationsStore extends PushNotificationPreferences {
  _hasHydrated: boolean;

  /** Mark hydration complete so consumers can guard against startup races. */
  setHasHydrated: (state: boolean) => void;

  /** Enable or disable push notifications */
  setEnabled: (enabled: boolean) => void;

  /** Store the Expo push token */
  setPushToken: (token: string | undefined) => void;

  /** Clear all push notification preferences */
  clearPreferences: () => void;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const usePushNotificationsStore = create<PushNotificationsStore>()(
  persist(
    (set) => ({
      enabled: false,
      pushToken: undefined,
      lastUpdated: Date.now(),
      _hasHydrated: false,

      setHasHydrated: (state) => set({ _hasHydrated: state }),

      setEnabled: (enabled) =>
        set({
          enabled,
          lastUpdated: Date.now(),
        }),

      setPushToken: (token) =>
        set({
          pushToken: token,
          lastUpdated: Date.now(),
        }),

      clearPreferences: () =>
        set({
          enabled: false,
          pushToken: undefined,
          lastUpdated: Date.now(),
        }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => migratingSecureStorage),
      partialize: (state) => ({
        enabled: state.enabled,
        pushToken: state.pushToken,
        lastUpdated: state.lastUpdated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
