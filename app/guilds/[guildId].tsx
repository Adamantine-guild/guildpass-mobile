import { View, Text, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useWallet } from "../../src/features/wallet/useWallet";
import { useGuilds } from "../../src/features/guilds/useGuilds";
import { useMembership } from "../../src/features/membership/useMembership";
import { AppHeader } from "../../src/components/AppHeader";
import { LoadingState } from "../../src/components/LoadingState";
import { ErrorState } from "../../src/components/ErrorState";
import { Card } from "../../src/components/Card";
import { RoleBadge } from "../../src/components/RoleBadge";
import React from "react";

export default function GuildDetail() {
  const { guildId } = useLocalSearchParams<{ guildId: string }>();
  const { walletAddress } = useWallet();
  const { getGuild, getRoles } = useGuilds();
  const { getMembership } = useMembership(walletAddress);

  const { data: guild, isLoading: guildLoading, error: guildError } = getGuild(guildId);
  const { data: membership, isLoading: memLoading } = getMembership(guildId);
  const { data: roles, isLoading: rolesLoading } = getRoles(guildId);

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
          <Card className={membership?.isActive ? "border-success/30" : ""}>
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
