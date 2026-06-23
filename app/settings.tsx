import { View, Text, ScrollView } from "react-native";
import { useWallet } from "../src/features/wallet/useWallet";
import { AppHeader } from "../src/components/AppHeader";
import { Card } from "../src/components/Card";
import { Button } from "../src/components/Button";
import Constants from "expo-constants";
import React from "react";

export default function Settings() {
  const { disconnect, isConnected } = useWallet();

  const apiUrl = Constants.expoConfig?.extra?.apiUrl ?? "https://api.guildpass.xyz";
  const chainId = Constants.expoConfig?.extra?.chainId ?? 8453;

  return (
    <View className="flex-1 bg-background">
      <AppHeader title="Settings" showBack />
      <ScrollView className="flex-1 px-4 py-6">
        <Text className="text-lg font-bold text-text mb-3">Protocol Configuration</Text>
        <Card className="mb-6">
          <View className="flex-row justify-between py-2 border-b border-border">
            <Text className="text-text-muted">API URL</Text>
            <Text className="text-text font-medium">{apiUrl}</Text>
          </View>
          <View className="flex-row justify-between py-2 border-b border-border">
            <Text className="text-text-muted">Default Chain ID</Text>
            <Text className="text-text font-medium">{chainId}</Text>
          </View>
          <View className="flex-row justify-between py-2">
            <Text className="text-text-muted">SDK Version</Text>
            <Text className="text-text font-medium">0.1.0-mvp</Text>
          </View>
        </Card>

        <Text className="text-lg font-bold text-text mb-3">Account</Text>
        <Card className="mb-8">
          <Text className="text-text-muted mb-4">
              Resetting the app will disconnect your current wallet address and clear any local cache.
          </Text>
          <Button
            title="Reset App State"
            onPress={disconnect}
            variant="danger"
            disabled={!isConnected}
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
