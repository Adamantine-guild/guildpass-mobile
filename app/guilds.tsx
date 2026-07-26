import { View, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { useWallet } from "../src/features/wallet/useWallet";
import { useGuilds } from "../src/features/guilds/useGuilds";
import { AppHeader } from "../src/components/AppHeader";
import { GuildCard } from "../src/components/GuildCard";
import { LoadingState } from "../src/components/LoadingState";
import { ErrorState } from "../src/components/ErrorState";
import { EmptyState } from "../src/components/EmptyState";
import React from "react";

export default function Guilds() {
  const router = useRouter();
  const { walletAddress } = useWallet();
  const { useWalletGuilds } = useGuilds();
  const guildsQuery = useWalletGuilds(walletAddress);

  if (!walletAddress) {
    return (
      <View className="flex-1 bg-background" testID="guilds-screen">
        <AppHeader title="My Guilds" showBack />
        <EmptyState
          title="Connect Wallet"
          message="Connect a wallet to load your GuildPass guilds."
        />
      </View>
    );
  }

  if (guildsQuery.isLoading) {
    return (
      <View className="flex-1 bg-background" testID="guilds-screen">
        <AppHeader title="My Guilds" showBack />
        <LoadingState message="Loading your guilds..." />
      </View>
    );
  }

  if (guildsQuery.isError) {
    return (
      <View className="flex-1 bg-background" testID="guilds-screen">
        <AppHeader title="My Guilds" showBack />
        <ErrorState
          message={
            guildsQuery.error instanceof Error
              ? guildsQuery.error.message
              : "Unable to load your guilds."
          }
          onRetry={() => void guildsQuery.refetch()}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" testID="guilds-screen">
      <AppHeader title="My Guilds" showBack />
      <FlatList
        data={guildsQuery.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        testID="guilds-list"
        renderItem={({ item }) => (
          <GuildCard
            name={item.name}
            id={item.id}
            isActive={item.isActive}
            roleCount={item.roleCount ?? 0}
            onPress={() => router.push(`/guilds/${item.id}`)}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            title="No Guilds Found"
            message="This wallet is not a member of any guilds yet."
          />
        }
      />
    </View>
  );
}
