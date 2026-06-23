import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import React, { useState } from "react";
import { useRouter } from "expo-router";
import { useWallet } from "../src/features/wallet/useWallet";
import { AppHeader } from "../src/components/AppHeader";
import { Card } from "../src/components/Card";
import { WalletInput } from "../src/components/WalletInput";
import { Button } from "../src/components/Button";

export default function Profile() {
  const router = useRouter();
  const { walletAddress, isConnected, connectManually, disconnect } = useWallet();
  const [inputValue, setInputValue] = useState(walletAddress || "");
  const [error, setError] = useState<string | null>(null);

  const handleConnect = () => {
    if (!inputValue.startsWith("0x") || inputValue.length !== 42) {
      setError("Please enter a valid Ethereum address");
      return;
    }
    setError(null);
    connectManually(inputValue);
  };

  return (
    <View className="flex-1 bg-background">
      <AppHeader title="Profile" />
      <ScrollView className="flex-1 px-4 py-6">
        {!isConnected ? (
          <View>
            <Text className="text-2xl font-bold text-text mb-2">Connect Wallet</Text>
            <Text className="text-text-muted mb-8">
              Enter a wallet address to view your memberships and roles.
            </Text>
            <Card className="mb-8">
              <WalletInput
                value={inputValue}
                onChangeText={(text) => {
                  setInputValue(text);
                  setError(null);
                }}
                error={error}
              />
              <Button title="Continue" onPress={handleConnect} className="mt-6" />
            </Card>
          </View>
        ) : (
          <View>
            <Card className="mb-6">
              <Text className="text-text-muted text-sm mb-1">CONNECTED WALLET</Text>
              <Text className="text-lg font-bold text-text mb-4" numberOfLines={1}>
                {walletAddress}
              </Text>
              <Button title="Disconnect" onPress={disconnect} variant="outline" />
            </Card>

            <View>
              <TouchableOpacity
                onPress={() => router.push("/guilds")}
                activeOpacity={0.7}
                className="mb-4"
              >
                <Card className="flex-row justify-between items-center">
                  <View>
                    <Text className="text-xl font-bold text-text">My Guilds</Text>
                    <Text className="text-text-muted">View your memberships and roles</Text>
                  </View>
                  <Text className="text-primary text-2xl">→</Text>
                </Card>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.push("/access-check")}
                activeOpacity={0.7}
                className="mb-4"
              >
                <Card className="flex-row justify-between items-center">
                  <View>
                    <Text className="text-xl font-bold text-text">Access Check</Text>
                    <Text className="text-text-muted">Verify resource access status</Text>
                  </View>
                  <Text className="text-primary text-2xl">→</Text>
                </Card>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.push("/settings")}
                activeOpacity={0.7}
                className="mb-4"
              >
                <Card className="flex-row justify-between items-center">
                  <View>
                    <Text className="text-xl font-bold text-text">App Settings</Text>
                    <Text className="text-text-muted">Configuration and info</Text>
                  </View>
                  <Text className="text-primary text-2xl">→</Text>
                </Card>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
