import { View, Text, ScrollView, TouchableOpacity, Alert } from "react-native";
import { useWallet } from "../src/features/wallet/useWallet";
import { AppHeader } from "../src/components/AppHeader";
import { Card } from "../src/components/Card";
import { Button } from "../src/components/Button";
import { WalletRequired } from "../src/components/WalletRequired";
import { appConfig } from "../src/config/appConfig";
import { resetAppState } from "../src/lib/resetAppState";
import { useBiometricStore } from "../src/features/security/biometric.store";
import { usePushNotifications } from "../src/features/notifications";
import { useRouter } from "expo-router";
import React, { useState } from "react";

export default function Settings() {
  const router = useRouter();
  const { isConnected } = useWallet();
  const [isResetting, setIsResetting] = useState(false);
  const biometricRequired = useBiometricStore((s) => s.biometricRequired);
  const setBiometricRequired = useBiometricStore((s) => s.setBiometricRequired);

  const {
    enabled: pushEnabled,
    isSupported: isPushSupported,
    disablePushNotifications,
  } = usePushNotifications();

  const handlePushNotificationToggle = async () => {
    if (pushEnabled) {
      // Disable push notifications
      Alert.alert(
        "Disable Notifications",
        "You will no longer receive push notifications about role updates and access grants. You can re-enable them anytime.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Disable",
            style: "destructive",
            onPress: async () => {
              await disablePushNotifications();
            },
          },
        ],
      );
    } else {
      // Navigate to rationale screen
      router.push("/push-notification-setup" as never);
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await resetAppState();
    } finally {
      setIsResetting(false);
    }
  };

  const apiUrl = appConfig.apiUrl;
  const chainId = appConfig.chainId;

  return (
    <WalletRequired>
      <View className="flex-1 bg-background dark:bg-slate-900" testID="settings-screen">
        <AppHeader title="Settings" showBack />
        <ScrollView className="flex-1 px-4 py-6">
          <Text className="text-lg font-bold text-text dark:text-slate-100 mb-3">Protocol Configuration</Text>
          <Card className="mb-6">
            <View className="flex-row justify-between py-2 border-b border-border dark:border-slate-700">
              <Text className="text-text-muted dark:text-slate-400">API URL</Text>
              <Text className="text-text dark:text-slate-100 font-medium" testID="settings-api-url">
                {apiUrl}
              </Text>
            </View>
            <View className="flex-row justify-between py-2 border-b border-border dark:border-slate-700">
              <Text className="text-text-muted dark:text-slate-400">Default Chain ID</Text>
              <Text className="text-text dark:text-slate-100 font-medium" testID="settings-chain-id">
                {chainId}
              </Text>
            </View>
            <View className="flex-row justify-between py-2">
              <Text className="text-text-muted dark:text-slate-400">SDK Version</Text>
              <Text className="text-text dark:text-slate-100 font-medium" testID="settings-sdk-version">
                0.1.0-mvp
              </Text>
            </View>
          </Card>

          <Text className="text-lg font-bold text-text dark:text-slate-100 mb-3">Security</Text>
          <Card className="mb-6">
            <TouchableOpacity
              className="flex-row justify-between items-center py-2"
              onPress={() => setBiometricRequired(!biometricRequired)}
              testID="settings-biometric-toggle"
              accessibilityRole="switch"
              accessibilityState={{ checked: biometricRequired }}
            >
              <View className="flex-1">
                <Text className="text-text dark:text-slate-100 font-medium">Require Biometrics for Access Checks</Text>
                <Text className="text-text-muted dark:text-slate-400 text-sm mt-1">
                  Use Face ID, Touch ID, or device passcode before scanning access QR codes or
                  viewing check results.
                </Text>
              </View>
              <View
                className={`w-12 h-7 rounded-full ml-3 justify-center ${
                  biometricRequired ? "bg-success dark:bg-green-600" : "bg-border dark:bg-slate-700"
                }`}
              >
                <View
                  className={`w-5 h-5 rounded-full bg-white mx-0.5 ${
                    biometricRequired ? "self-end" : "self-start"
                  }`}
                />
              </View>
            </TouchableOpacity>
          </Card>

          <Text className="text-lg font-bold text-text dark:text-slate-100 mb-3">Notifications</Text>
          <Card className="mb-6">
            {isPushSupported ? (
              <TouchableOpacity
                className="flex-row justify-between items-center py-2"
                onPress={handlePushNotificationToggle}
                testID="settings-push-notifications-toggle"
                accessibilityRole="switch"
                accessibilityState={{ checked: pushEnabled }}
              >
                <View className="flex-1">
                  <Text className="text-text dark:text-slate-100 font-medium">Push Notifications</Text>
                  <Text className="text-text-muted dark:text-slate-400 text-sm mt-1">
                    Receive real-time alerts for role updates and access grants.
                  </Text>
                </View>
                <View
                  className={`w-12 h-7 rounded-full ml-3 justify-center ${
                    pushEnabled ? "bg-success dark:bg-green-600" : "bg-border dark:bg-slate-700"
                  }`}
                >
                  <View
                    className={`w-5 h-5 rounded-full bg-white mx-0.5 ${
                      pushEnabled ? "self-end" : "self-start"
                    }`}
                  />
                </View>
              </TouchableOpacity>
            ) : (
              <View className="py-2">
                <Text className="text-text-muted dark:text-slate-400 text-sm">
                  Push notifications are not available on this device or simulator.
                </Text>
              </View>
            )}
          </Card>

          <Text className="text-lg font-bold text-text dark:text-slate-100 mb-3">Account</Text>
          <Card className="mb-8">
            <WalletRequired redirect={false}>
              <Text className="text-text-muted dark:text-slate-400 mb-4">
                will disconnect your current wallet address and clear any local cache.
              </Text>
              <Button
                title="Reset App State"
                onPress={handleReset}
                variant="danger"
                loading={isResetting}
                disabled={isResetting}
              />
            </WalletRequired>
          </Card>

          <View className="items-center mt-12">
            <Text className="text-text-muted dark:text-slate-400 text-sm italic">GuildPass Mobile MVP v1.0.0</Text>
            <Text className="text-text-muted dark:text-slate-400 text-xs mt-1">Built with Expo and NativeWind</Text>
          </View>
        </ScrollView>
      </View>
    </WalletRequired>
  );
}
