/**
 * Push Notification Setup Screen
 *
 * Shows rationale for enabling push notifications and handles permission request flow.
 */

import React, { useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { AppHeader } from "../src/components/AppHeader";
import { PushNotificationRationale } from "../src/features/notifications";
import { usePushNotifications } from "../src/features/notifications";

export default function PushNotificationSetup() {
  const router = useRouter();
  const [isEnabling, setIsEnabling] = useState(false);
  const { enablePushNotifications } = usePushNotifications();

  const handleAccept = async () => {
    setIsEnabling(true);

    try {
      const result = await enablePushNotifications();

      if (result.success) {
        Alert.alert(
          "Notifications Enabled",
          "You'll now receive push notifications for role updates and access grants.",
          [{ text: "OK", onPress: () => router.back() }],
        );
      } else {
        Alert.alert(
          "Could Not Enable Notifications",
          result.error || "Failed to enable push notifications. Please try again.",
          [{ text: "OK" }],
        );
      }
    } finally {
      setIsEnabling(false);
    }
  };

  const handleDecline = () => {
    router.back();
  };

  return (
    <>
      <AppHeader title="Push Notifications" showBack />
      <PushNotificationRationale
        onAccept={handleAccept}
        onDecline={handleDecline}
        isLoading={isEnabling}
      />
    </>
  );
}
