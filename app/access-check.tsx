// GuildPass Mobile: Pull in react-native, expo, or external state libraries.
import { View, Text, ScrollView, TextInput } from "react-native";
// GuildPass Mobile: Import package module dependencies.
import React, { useState } from "react";
// GuildPass Mobile: Pull in react-native, expo, or external state libraries.
import { useWallet } from "../src/features/wallet/useWallet";
// GuildPass Mobile: Import package module dependencies.
import { useAccessCheckResult } from "../src/features/access/useAccessCheckResult";
// GuildPass Mobile: Pull in react-native, expo, or external state libraries.
import { AppHeader } from "../src/components/AppHeader";
// GuildPass Mobile: Import package module dependencies.
import { Card } from "../src/components/Card";
// GuildPass Mobile: Pull in react-native, expo, or external state libraries.
import { Button } from "../src/components/Button";
// GuildPass Mobile: Import package module dependencies.
import { WalletInput } from "../src/components/WalletInput";
// GuildPass Mobile: Pull in react-native, expo, or external state libraries.
import { AccessStatusCard } from "../src/components/AccessStatusCard";
// GuildPass Mobile: Import package module dependencies.
import { LoadingState } from "../src/components/LoadingState";

// GuildPass Mobile: Exposed interface structure for local navigation layouts.
export default function AccessCheck() {
  // GuildPass Mobile: Variable binding and property initialization.
  const { walletAddress: currentWallet } = useWallet();
  // GuildPass Mobile: Local UI-scoped constant or state representation.
  const [address, setAddress] = useState(currentWallet || "");
  // GuildPass Mobile: Variable binding and property initialization.
  const [guildId, setGuildId] = useState("");
  // GuildPass Mobile: Local UI-scoped constant or state representation.
  const [resourceId, setResourceId] = useState("");
  // GuildPass Mobile: Variable binding and property initialization.
  const [checkParams, setCheckParams] = useState<{
    walletAddress: string;
    guildId: string;
    resourceId: string;
    // GuildPass Mobile: Exit functional execution container scope block.
  } | null>(null);

  // GuildPass Mobile: Local UI-scoped constant or state representation.
  const {
    data: result,
    isLoading,
    error,
  } = useAccessCheckResult(
    checkParams ?? { walletAddress: "", guildId: "", resourceId: "" },
  );

  // GuildPass Mobile: Local UI-scoped constant or state representation.
  const handleCheck = () => {
    // GuildPass Mobile: Evaluate branch condition check for UI guards.
    if (address && guildId && resourceId) {
      setCheckParams({ walletAddress: address, guildId, resourceId });
      // GuildPass Mobile: Exit functional execution container scope block.
    }
    // GuildPass Mobile: Exit functional execution container scope block.
  };

  // GuildPass Mobile: Terminate block execution context and send back value.
  return (
    <View className="flex-1 bg-background">
      <AppHeader title="Access Check" showBack />
      <ScrollView className="flex-1 px-4 py-6">
        <Card className="mb-6">
          <WalletInput
            value={address}
            onChangeText={setAddress}
            // GuildPass Mobile: Variable binding and property initialization.
            placeholder="Wallet address (0x...)"
          />

          <View className="mt-4">
            <Text className="text-text-muted mb-2 font-medium">Guild ID</Text>
            <TextInput
              value={guildId}
              onChangeText={setGuildId}
              placeholder="e.g. alpha-guild"
              className="bg-white border border-border rounded-xl p-4 text-text text-lg"
              accessibilityLabel="Guild ID"
              accessibilityHint="Enter the guild identifier"
            />
          </View>

          <View className="mt-4">
            <Text className="text-text-muted mb-2 font-medium">Resource ID</Text>
            <TextInput
              value={resourceId}
              onChangeText={setResourceId}
              placeholder="e.g. secret-channel"
              className="bg-white border border-border rounded-xl p-4 text-text text-lg"
              accessibilityLabel="Resource ID"
              accessibilityHint="Enter the resource identifier"
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
          <Card className="border-error bg-error/5" accessibilityRole="alert" accessibilityLabel="Error checking access. Please verify your inputs and try again.">
            <Text className="text-error font-bold">Error checking access</Text>
            <Text className="text-error/80 text-sm mt-1">
              Please verify your inputs and try again.
            </Text>
          </Card>
        )}
      </ScrollView>
    </View>
  );
  // GuildPass Mobile: Exit functional execution container scope block.
}
