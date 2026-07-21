import { View, Text } from "react-native";
import React from "react";
import { formatLastSyncedAt } from "../lib/offlineCache";
import type { StaleReason } from "../lib/staleQueryState";

type StaleDataBannerProps = {
  reason: StaleReason;
  lastSyncedAt?: Date | null;
  cautionary?: boolean;
};

export function StaleDataBanner({
  reason,
  lastSyncedAt,
  cautionary = false,
}: StaleDataBannerProps) {
  const lastSyncedLabel = lastSyncedAt ? formatLastSyncedAt(lastSyncedAt.getTime()) : null;
  const message =
    reason === "offline"
      ? cautionary
        ? "You are offline. This access result may be outdated and cannot be refreshed right now."
        : "offline — showing cached data"
      : cautionary
        ? "This access result may be outdated. Connect to refresh before relying on it."
        : "This data may be out of date. Connect to the network to refresh.";

  return (
    <View
      className="bg-secondary/10 border border-secondary/30 rounded-xl px-4 py-3 mb-4"
      accessibilityRole="alert"
      accessibilityLabel={message}
      testID="stale-data-banner"
    >
      <Text className="text-secondary font-bold text-sm mb-1">Stale data</Text>
      <Text className="text-text text-sm" testID="stale-banner-message">
        {message}
      </Text>
      {lastSyncedLabel ? (
        <Text className="text-text-muted text-xs mt-2" testID="stale-banner-last-synced">
          Last synced at {lastSyncedLabel}
        </Text>
      ) : null}
    </View>
  );
}
