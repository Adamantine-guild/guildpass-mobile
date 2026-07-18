import { View } from "react-native";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSyncCorrections } from "../features/sync/useSyncStatus";
import { SyncCorrectionNotice } from "./SyncCorrectionNotice";

/**
 * App-level wrapper that floats the correction notice above whatever screen
 * is active, so corrections surface no matter where the user reconnects.
 */
export function SyncCorrectionOverlay() {
  const { corrections, acknowledgeAllCorrections } = useSyncCorrections();
  const insets = useSafeAreaInsets();

  if (corrections.length === 0) {
    return null;
  }

  return (
    <View
      className="absolute left-0 right-0 px-4"
      style={{ top: insets.top + 8 }}
      pointerEvents="box-none"
    >
      <SyncCorrectionNotice corrections={corrections} onDismiss={acknowledgeAllCorrections} />
    </View>
  );
}
