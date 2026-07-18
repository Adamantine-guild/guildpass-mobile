import { View, Text, TouchableOpacity } from "react-native";
import React from "react";
import { formatLastSyncedAt } from "../lib/offlineCache";
import type { SyncCorrection } from "../features/sync/sync.types";

type SyncCorrectionNoticeProps = {
  corrections: SyncCorrection[];
  onDismiss: () => void;
};

/**
 * Banner shown after a reconciliation pass corrected locally-cached state
 * (e.g. a role shown as "granted" offline was revoked server-side). Critical
 * corrections use the error treatment so users notice that access they saw
 * while offline is no longer valid.
 */
export function SyncCorrectionNotice({ corrections, onDismiss }: SyncCorrectionNoticeProps) {
  if (corrections.length === 0) {
    return null;
  }

  const hasCritical = corrections.some((correction) => correction.severity === "critical");
  const ordered = [...corrections].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1,
  );
  const title = hasCritical ? "Your access has changed" : "Your data was updated";
  const containerClass = hasCritical
    ? "bg-error/10 border border-error/30 rounded-xl px-4 py-3 mb-4"
    : "bg-secondary/10 border border-secondary/30 rounded-xl px-4 py-3 mb-4";
  const titleClass = hasCritical
    ? "text-error font-bold text-sm mb-1"
    : "text-secondary font-bold text-sm mb-1";

  return (
    <View
      className={containerClass}
      accessibilityRole="alert"
      accessibilityLabel={`${title}. ${ordered.map((c) => c.message).join(" ")}`}
    >
      <Text className={titleClass}>{title}</Text>
      <Text className="text-text text-sm mb-1">
        While you were offline, your saved data went out of date. It has been updated to
        match the server:
      </Text>
      {ordered.map((correction) => (
        <Text key={correction.id} className="text-text text-sm mt-1">
          • {correction.message}
        </Text>
      ))}
      <Text className="text-text-muted text-xs mt-2">
        Corrected: {formatLastSyncedAt(new Date(ordered[0].detectedAt).getTime())}
      </Text>
      <TouchableOpacity
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss sync corrections"
        className="self-end mt-2 px-3 py-1"
      >
        <Text className="text-secondary font-bold text-sm">Dismiss</Text>
      </TouchableOpacity>
    </View>
  );
}
