import { View, Text, ScrollView, TextInput } from "react-native";
import React, { useState } from "react";
import { useWallet } from "../src/features/wallet/useWallet";
import { useAccessCheck } from "../src/features/access/useAccessCheck";
import { AppHeader } from "../src/components/AppHeader";
import { Card } from "../src/components/Card";
import { Button } from "../src/components/Button";
import { WalletInput } from "../src/components/WalletInput";
import { AccessStatusCard } from "../src/components/AccessStatusCard";
import { LoadingState } from "../src/components/LoadingState";

export default function AccessCheck() {
  const { walletAddress: currentWallet } = useWallet();
  const [address, setAddress] = useState(currentWallet || "");
  const [guildId, setGuildId] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [checkParams, setCheckParams] = useState<{
    walletAddress: string;
    guildId: string;
    resourceId: string;
  } | null>(null);

  const { checkAccess } = useAccessCheck();
  const {
    data: result,
    isLoading,
    error,
  } = checkAccess(checkParams || { walletAddress: "", guildId: "", resourceId: "" });

  const handleCheck = () => {
    if (address && guildId && resourceId) {
      setCheckParams({ walletAddress: address, guildId, resourceId });
    }
  };

  return (
    <View className="flex-1 bg-background">
      <AppHeader title="Access Check" showBack />
      <ScrollView className="flex-1 px-4 py-6">
        <Card className="mb-6">
          <WalletInput
            value={address}
            onChangeText={setAddress}
            placeholder="Wallet address (0x...)"
          />

          <View className="mt-4">
            <Text className="text-text-muted mb-2 font-medium">Guild ID</Text>
            <TextInput
              value={guildId}
              onChangeText={setGuildId}
              placeholder="e.g. alpha-guild"
              className="bg-white border border-border rounded-xl p-4 text-text text-lg"
            />
          </View>

          <View className="mt-4">
            <Text className="text-text-muted mb-2 font-medium">Resource ID</Text>
            <TextInput
              value={resourceId}
              onChangeText={setResourceId}
              placeholder="e.g. secret-channel"
              className="bg-white border border-border rounded-xl p-4 text-text text-lg"
            />
          </View>

          <Button
            title="Check Access"
            onPress={handleCheck}
            className="mt-6"
            loading={isLoading}
            disabled={!address || !guildId || !resourceId}
          />
        </Card>

        {isLoading && <LoadingState message="Checking protocol permissions..." />}

        {result && (
          <View className="mb-12">
            <AccessStatusCard
              hasAccess={result.hasAccess}
              reason={result.reason}
              matchedRoles={result.matchedRoles}
              requiredRoles={result.requiredRoles}
            />
          </View>
        )}

        {error && (
          <Card className="border-error bg-error/5">
            <Text className="text-error font-bold">Error checking access</Text>
            <Text className="text-error/80 text-sm mt-1">
              Please verify your inputs and try again.
            </Text>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}
