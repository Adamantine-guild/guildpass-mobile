import { View, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { useQueries } from "@tanstack/react-query";
import { useWallet } from "../src/features/wallet/useWallet";
import { AppHeader } from "../src/components/AppHeader";
import { GuildCard } from "../src/components/GuildCard";
import { LoadingState } from "../src/components/LoadingState";
import { ErrorState } from "../src/components/ErrorState";
import { EmptyState } from "../src/components/EmptyState";
import { WalletRequired } from "../src/components/WalletRequired";
import { guildPassClient } from "../src/lib/guildpassClient";
import React from "react";

export default function Guilds() {
  const router = useRouter();
  const { walletAddress } = useWallet();

  const exampleGuilds = [
    { id: "guild_abc", name: "Alpha Guild", isActive: true, roleCount: 3 },
    { id: "guild_xyz", name: "Beta Community", isActive: true, roleCount: 5 },
    { id: "guild_123", name: "Gamma DAO", isActive: false, roleCount: 2 },
  ];

  const membershipQueries = useQueries({
    queries: exampleGuilds.map((guild) => ({
      queryKey: ["membership-dashboard", walletAddress, guild.id],
      queryFn: () =>
        guildPassClient.membership.getMembership({
          walletAddress: walletAddress!,
          guildId: guild.id,
        }),
      enabled: !!walletAddress,
      networkMode: "offlineFirst" as const,
    })),
  });

  const hasMembershipError = membershipQueries.some((query) => query.isError);
  const isMembershipLoading = membershipQueries.some((query) => query.isLoading || query.isPending);

  const retryMemberships = () => {
    void Promise.all(membershipQueries.map((query) => query.refetch()));
  };

  return (
    <WalletRequired>
      <View className="flex-1 bg-background" testID="guilds-screen">
        <AppHeader title="My Guilds" showBack />
        {isMembershipLoading ? (
          <LoadingState message="Loading your guilds..." />
        ) : hasMembershipError ? (
          <ErrorState
            message="We couldn’t refresh your guild memberships. Please try again."
            onRetry={retryMemberships}
            isRetrying={membershipQueries.some((query) => query.isFetching)}
          />
        ) : (
          <FlatList
            data={exampleGuilds}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16 }}
            testID="guilds-list"
            renderItem={({ item }) => (
              <GuildCard
                name={item.name}
                id={item.id}
                isActive={item.isActive}
                roleCount={item.roleCount}
                onPress={() => router.push(`/guilds/${item.id}`)}
              />
            )}
            ListEmptyComponent={
              <EmptyState
                title="No Guilds Found"
                message="You are not a member of any guilds yet."
                actionTitle="Explore Guilds"
                onAction={() => {}}
              />
            }
          />
        )}
      </View>
    </WalletRequired>
  );
}
