import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { useWallet } from "../src/features/wallet/useWallet";
import { AppHeader } from "../src/components/AppHeader";
import { Card } from "../src/components/Card";
import { Button } from "../src/components/Button";
import { WalletRequired } from "../src/components/WalletRequired";
import { appConfig } from "../src/config/appConfig";
import { resetAppState } from "../src/lib/resetAppState";
import { useBiometricStore } from "../src/features/security/biometric.store";
import React, { useState } from "react";

export default function Settings() {
  const { isConnected } = useWallet();
  const [isResetting, setIsResetting] = useState(false);
  const biometricRequired = useBiometricStore((s) => s.biometricRequired);
  const setBiometricRequired = useBiometricStore((s) => s.setBiometricRequired);

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
      <View className="flex-1 bg-background" testID="settings-screen">
        <AppHeader title="Settings" showBack />
        <ScrollView className="flex-1 px-4 py-6">
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

          <Text className="text-lg font-bold text-text mb-3">Security</Text>
          <Card className="mb-6">
            <TouchableOpacity
              className="flex-row justify-between items-center py-2"
              onPress={() => setBiometricRequired(!biometricRequired)}
              testID="settings-biometric-toggle"
              accessibilityRole="switch"
              accessibilityState={{ checked: biometricRequired }}
            >
              <View className="flex-1">
                <Text className="text-text font-medium">Require Biometrics for Access Checks</Text>
                <Text className="text-text-muted text-sm mt-1">
                  Use Face ID, Touch ID, or device passcode before scanning access QR codes or
                  viewing check results.
                </Text>
              </View>
              <View
                className={`w-12 h-7 rounded-full ml-3 justify-center ${
                  biometricRequired ? "bg-success" : "bg-border"
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

          <Text className="text-lg font-bold text-text mb-3">Account</Text>
          <Card className="mb-8">
            <WalletRequired redirect={false}>
              <Text className="text-text-muted mb-4">
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
            <Text className="text-text-muted text-sm italic">GuildPass Mobile MVP v1.0.0</Text>
            <Text className="text-text-muted text-xs mt-1">Built with Expo and NativeWind</Text>
          </View>
        </ScrollView>
      </View>
    </WalletRequired>
  );
}
