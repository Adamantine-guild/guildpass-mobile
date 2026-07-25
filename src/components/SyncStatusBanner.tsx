import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatLastSyncedAt } from "../lib/offlineCache";
import { useSyncStatus } from "../features/sync/useSyncStatus";
import { getSyncCoordinator } from "../features/sync/syncManager";

/**
 * Surfaces sync state to the user (Issue #225).
 *
 * `useSyncStatus()` shipped with #108 but had no consumer, so the sync engine
 * was entirely invisible: users saw offline banners, stale-data banners and
 * correction notices, but never "syncing" or "sync failed". The acceptance
 * criteria require that a user can determine sync status, which means this.
 *
 * Deliberately quiet — a successful idle sync renders nothing, because a
 * permanent "last synced" chip is noise on a screen the user is trying to
 * read. Only in-progress and failed states are shown.
 */
export function SyncStatusBanner() {
  const { status, lastSyncCompletedAt, lastSyncError } = useSyncStatus();
  const insets = useSafeAreaInsets();

  if (status === "idle") {
    return null;
  }

  const isSyncing = status === "syncing";

  const containerClass = isSyncing
    ? "bg-secondary/10 border border-secondary/30 rounded-xl px-4 py-2 flex-row items-center"
    : "bg-error/10 border border-error/30 rounded-xl px-4 py-2 flex-row items-center";

  const title = isSyncing ? "Syncing…" : "Sync failed";
  const detail = isSyncing
    ? "Checking your memberships and roles against the server."
    : (lastSyncError ?? "Your data could not be checked against the server.");

  const lastSynced = formatLastSyncedAt(lastSyncCompletedAt ?? undefined);

  return (
    <View
      className="absolute left-0 right-0 px-4"
      style={{ top: insets.top + 8 }}
      pointerEvents="box-none"
    >
      <View
        className={containerClass}
        accessibilityRole="alert"
        accessibilityLabel={`${title}. ${detail}`}
        testID="sync-status-banner"
      >
        {isSyncing ? <ActivityIndicator size="small" className="mr-2" /> : null}
        <View className="flex-1">
          <Text
            className={
              isSyncing ? "text-secondary font-bold text-sm" : "text-error font-bold text-sm"
            }
          >
            {title}
          </Text>
          <Text className="text-text text-xs mt-0.5">{detail}</Text>
          {!isSyncing && lastSynced ? (
            <Text className="text-text-muted text-xs mt-1">Last synced: {lastSynced}</Text>
          ) : null}
        </View>
        {!isSyncing ? (
          <TouchableOpacity
            onPress={() => {
              // "manual" is exempt from the coordinator's rate limit: a user
              // who taps Retry must get a pass, not silence.
              void getSyncCoordinator()?.requestSync("manual");
            }}
            accessibilityRole="button"
            accessibilityLabel="Retry sync"
            testID="sync-status-retry"
            className="px-3 py-1"
          >
            <Text className="text-secondary font-bold text-sm">Retry</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}
