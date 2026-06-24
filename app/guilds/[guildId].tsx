// GuildPass Mobile: Pull in react-native, expo, or external state libraries.
import { View, Text, ScrollView } from "react-native";
// GuildPass Mobile: Import package module dependencies.
import { useLocalSearchParams } from "expo-router";
// GuildPass Mobile: Pull in react-native, expo, or external state libraries.
import { useWallet } from "../../src/features/wallet/useWallet";
// GuildPass Mobile: Import package module dependencies.
import { useGuild } from "../../src/features/guilds/useGuild";
// GuildPass Mobile: Pull in react-native, expo, or external state libraries.
import { useGuildRoles } from "../../src/features/guilds/useGuildRoles";
// GuildPass Mobile: Import package module dependencies.
import { useMembership } from "../../src/features/membership/useMembership";
// GuildPass Mobile: Import package module dependencies.
import { AppHeader } from "../../src/components/AppHeader";
// GuildPass Mobile: Pull in react-native, expo, or external state libraries.
import { LoadingState } from "../../src/components/LoadingState";
// GuildPass Mobile: Import package module dependencies.
import { ErrorState } from "../../src/components/ErrorState";
// GuildPass Mobile: Pull in react-native, expo, or external state libraries.
import { Card } from "../../src/components/Card";
// GuildPass Mobile: Import package module dependencies.
import { RoleBadge } from "../../src/components/RoleBadge";
// GuildPass Mobile: Pull in react-native, expo, or external state libraries.
import React from "react";

// GuildPass Mobile: Core mobile screen or hook export definition.
export default function GuildDetail() {
  const { guildId } = useLocalSearchParams<{ guildId: string }>();
  const { walletAddress } = useWallet();

  const {
    data: guild,
    isLoading: guildLoading,
    error: guildError,
  } = useGuild(guildId ?? "");
  const { data: membership, isLoading: memLoading } = useMembership(
    walletAddress,
    guildId ?? "",
  );
  const { data: roles, isLoading: rolesLoading } = useGuildRoles(guildId ?? "");

  if (guildLoading || memLoading || rolesLoading) {
    return <LoadingState message="Fetching guild details..." />;
  }

  if (guildError || !guild) {
    return <ErrorState message="Failed to load guild details" />;
  }

  return (
    <View className="flex-1 bg-background">
      <AppHeader title={guild.name} showBack />
      <ScrollView className="flex-1 px-4 py-6">
        <Card className="mb-6">
          <Text className="text-2xl font-bold text-text mb-2">{guild.name}</Text>
          <Text className="text-text-muted mb-4">
            {guild.description || "No description provided."}
          </Text>

          <View className="border-t border-border pt-4">
            <View className="flex-row justify-between mb-2">
              <Text className="text-text-muted">Owner</Text>
              <Text className="text-text font-medium" numberOfLines={1}>
                {guild.ownerAddress.substring(0, 6)}...{guild.ownerAddress.substring(38)}
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-text-muted">Chain ID</Text>
              <Text className="text-text font-medium">{guild.chainId}</Text>
            </View>
          </View>
        </Card>

        <View className="mb-6">
          <Text className="text-lg font-bold text-text mb-3">Your Membership</Text>
          <Card
            className={membership?.isActive ? "border-success/30" : ""}
            accessibilityLabel={`Membership status: ${membership?.isActive ? "Active Member" : "Not a Member"}`}
          >
            <View className="flex-row justify-between items-center">
              <Text className="text-text font-medium">Status</Text>
              <Text
                className={`font-bold ${membership?.isActive ? "text-success" : "text-text-muted"}`}
              >
                {membership?.isActive ? "Active Member" : "Not a Member"}
              </Text>
            </View>
          </Card>
        </View>

        <View className="mb-6">
          <Text className="text-lg font-bold text-text mb-3">Available Roles</Text>
          <View className="flex-row flex-wrap">
            {roles && roles.length > 0 ? (
              roles.map((role) => <RoleBadge key={role.id} name={role.name} />)
            ) : (
              <Text className="text-text-muted italic">No roles defined for this guild.</Text>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
