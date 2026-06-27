import { View, Text, ScrollView } from "react-native";
import { useWallet } from "../src/features/wallet/useWallet";
import { AppHeader } from "../src/components/AppHeader";
import { Card } from "../src/components/Card";
import { Button } from "../src/components/Button";
import { appConfig } from "../src/config/appConfig";
import { resetAppState } from "../src/lib/resetAppState";
import React, { useState } from "react";
import { useNotifications } from "../src/features/notifications/useNotifications";
import { Toggle } from "../src/components/Toggle";

export default function Settings() {
  const { isConnected, address } = useWallet();
  const { permissionStatus, preferences, requestPermissions, togglePreference, isRegistering } =
    useNotifications();
  const [isResetting, setIsResetting] = useState(false);

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
    <View className="flex-1 bg-background" testID="settings-screen">
      <AppHeader title="Settings" showBack />
      <ScrollView className="flex-1 px-4 py-6">
        <Text className="text-lg font-bold text-text mb-3">Notifications</Text>
        <Card className="mb-6">
          <View className="mb-4">
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-text-muted">Push Notifications</Text>
              <Text
                className={`font-medium ${
                  permissionStatus === "granted" ? "text-success" : "text-error"
                }`}
                testID="notification-permission-status"
              >
                {permissionStatus.charAt(0).toUpperCase() + permissionStatus.slice(1)}
              </Text>
            </View>
            {permissionStatus !== "granted" && (
              <Button
                title="Enable Notifications"
                onPress={requestPermissions}
                variant="outline"
                loading={isRegistering}
                testID="enable-notifications-button"
              />
            )}
          </View>

          <View className="border-t border-border pt-2">
            <Toggle
              label="Role Changes"
              value={preferences.role_changes}
              onValueChange={() => togglePreference("role_changes", address)}
              testID="toggle-role-changes"
            />
            <Toggle
              label="Access Grants"
              value={preferences.access_grants}
              onValueChange={() => togglePreference("access_grants", address)}
              testID="toggle-access-grants"
            />
            <Toggle
              label="Membership Status"
              value={preferences.membership_updates}
              onValueChange={() => togglePreference("membership_updates", address)}
              testID="toggle-membership-updates"
            />
          </View>
        </Card>

        <Text className="text-lg font-bold text-text mb-3">Protocol Configuration</Text>
        <Card className="mb-6">
          <View className="flex-row justify-between py-2 border-b border-border">
            <Text className="text-text-muted">API URL</Text>
            <Text className="text-text font-medium" testID="settings-api-url">
              {apiUrl}
            </Text>
          </View>
          <View className="flex-row justify-between py-2 border-b border-border">
            <Text className="text-text-muted">Default Chain ID</Text>
            <Text className="text-text font-medium" testID="settings-chain-id">
              {chainId}
            </Text>
          </View>
          <View className="flex-row justify-between py-2">
            <Text className="text-text-muted">SDK Version</Text>
            <Text className="text-text font-medium" testID="settings-sdk-version">
              0.1.0-mvp
            </Text>
          </View>
        </Card>

        <Text className="text-lg font-bold text-text mb-3">Account</Text>
        <Card className="mb-8">
          <Text className="text-text-muted mb-4">
            will disconnect your current wallet address and clear any local cache.
          </Text>
          <Button
            title="Reset App State"
            onPress={handleReset}
            variant="danger"
            loading={isResetting}
            disabled={!isConnected || isResetting}
          />
        </Card>

        <View className="items-center mt-12">
          <Text className="text-text-muted text-sm italic">GuildPass Mobile MVP v1.0.0</Text>
          <Text className="text-text-muted text-xs mt-1">Built with Expo & NativeWind</Text>
        </View>
      </ScrollView>
    </View>
  );
}
