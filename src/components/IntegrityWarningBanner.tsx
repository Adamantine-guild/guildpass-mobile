import { View, Text, TouchableOpacity } from "react-native";
import React from "react";
import { useIntegrityWarningStore } from "../features/security/integrityWarning.store";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Overlay banner that surfaces a device-integrity compromise warning when
 * the `responsePolicy` is `"warn"` and a secure→compromised transition was
 * detected on app foreground.
 *
 * Positioned at the top of the screen, above whatever content is active.
 * The user can dismiss it, which acknowledges the risk without logging out.
 */
export function IntegrityWarningBanner() {
  const message = useIntegrityWarningStore((state) => state.message);
  const dismissWarning = useIntegrityWarningStore((state) => state.dismissWarning);
  const insets = useSafeAreaInsets();

  if (!message) {
    return null;
  }

  return (
    <View
      className="absolute left-0 right-0 px-4 z-50"
      style={{ top: insets.top + 8 }}
      pointerEvents="box-none"
    >
      <View
        className="bg-amber-50 border border-amber-400 rounded-xl px-4 py-3 shadow-md"
        accessibilityRole="alert"
        accessibilityLabel={`Security warning: ${message}`}
      >
        <View className="flex-row items-start">
          <View className="flex-1">
            <Text className="text-amber-800 font-bold text-sm mb-1">⚠ Device Security Warning</Text>
            <Text className="text-amber-900 text-sm leading-5">{message}</Text>
            <Text className="text-amber-700 text-xs mt-2">
              Your device may be rooted or jailbroken. Some features may be restricted. Contact
              support if you believe this is an error.
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={dismissWarning}
          accessibilityRole="button"
          accessibilityLabel="Dismiss integrity warning"
          className="self-end mt-2 px-4 py-1.5 bg-amber-100 rounded-lg active:bg-amber-200"
        >
          <Text className="text-amber-800 font-semibold text-sm">Dismiss</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
