import { View, Text } from "react-native";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNetworkStatus } from "../features/offline/useNetworkStatus";
import { useSyncStatus } from "../features/sync/useSyncStatus";
import { formatLastSyncedAt } from "../lib/offlineCache";

/**
 * A global banner that appears when the device loses network connectivity,
 * informing the user that they are viewing cached data.
 */
export function OfflineBanner() {
  const { isOffline } = useNetworkStatus();
  const { lastSyncCompletedAt } = useSyncStatus();
  const insets = useSafeAreaInsets();

  if (!isOffline) {
    return null;
  }

  const lastSynced = formatLastSyncedAt(lastSyncCompletedAt ?? undefined);

  return (
    <View
      className="absolute left-0 right-0 px-4"
      // Position just below the top safe area. If a sync banner is also showing,
      // this might overlap, but sync shouldn't run while offline anyway.
      style={{ top: insets.top + 8 }}
      pointerEvents="box-none"
    >
      <View
        className="bg-secondary/10 border border-secondary/30 rounded-xl px-4 py-2 flex-row items-center justify-between"
        accessibilityRole="alert"
        accessibilityLabel="Device is offline. Showing cached data."
        testID="offline-banner"
      >
        <View className="flex-1">
          <Text className="text-secondary font-bold text-sm">
            Offline — showing cached data
          </Text>
          {lastSynced ? (
            <Text className="text-text-muted text-xs mt-0.5" testID="offline-banner-last-synced">
              as of {lastSynced}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}
