import { View, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { useWallet } from "../src/features/wallet/useWallet";
import { AppHeader } from "../src/components/AppHeader";
import { GuildCard } from "../src/components/GuildCard";
import { LoadingState } from "../src/components/LoadingState";
import { ErrorState } from "../src/components/ErrorState";
import { EmptyMembershipsState } from "../src/components/EmptyMembershipsState";
import { WalletRequired } from "../src/components/WalletRequired";
import React from "react";
import { useMembership } from "../src/features/membership/useMembership";
import { StaleDataBanner } from "../src/components/StaleDataBanner";
import { useStaleQuery } from "../src/features/offline/useStaleQuery";

export default function Guilds() {
  const router = useRouter();
  const { walletAddress, disconnect } = useWallet();
  const { useMembershipsQuery } = useMembership(walletAddress);
  const membershipsQuery = useMembershipsQuery();
  const { data: memberships, isLoading, error } = membershipsQuery;
  const staleState = useStaleQuery(membershipsQuery);

  const handleConnectDifferentWallet = async () => {
    await disconnect();
    router.replace("/profile");
  };

  if (isLoading) {
    return (
      <WalletRequired>
        <View className="flex-1 bg-background" testID="guilds-screen">
          <AppHeader title="My Guilds" showBack />
          <LoadingState message="Loading memberships..." />
        </View>
      </WalletRequired>
    );
  }

  if (error && !memberships) {
    return (
      <WalletRequired>
        <View className="flex-1 bg-background" testID="guilds-screen">
          <AppHeader title="My Guilds" showBack />
          {staleState.isOffline ? (
            <StaleDataBanner reason="offline" lastSyncedAt={staleState.lastSyncedAt} />
          ) : null}
          <ErrorState message="Failed to load memberships" />
        </View>
      </WalletRequired>
    );
  }

  if (!memberships || memberships.length === 0) {
    return (
      <WalletRequired>
        <View className="flex-1 bg-background" testID="guilds-screen">
          <AppHeader title="My Guilds" showBack />
          {staleState.isOffline ? (
            <StaleDataBanner reason="offline" lastSyncedAt={staleState.lastSyncedAt} />
          ) : null}
          <EmptyMembershipsState onConnectDifferentWallet={handleConnectDifferentWallet} />
        </View>
      </WalletRequired>
    );
  }

  return (
    <WalletRequired>
      <View className="flex-1 bg-background" testID="guilds-screen">
        <AppHeader title="My Guilds" showBack />
        <FlatList
          data={memberships}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          testID="guilds-list"
          ListHeaderComponent={
            staleState.isOffline ? (
              <StaleDataBanner reason="offline" lastSyncedAt={staleState.lastSyncedAt} />
            ) : staleState.isStale && staleState.reason ? (
              <StaleDataBanner reason={staleState.reason} lastSyncedAt={staleState.lastSyncedAt} />
            ) : null
          }
          renderItem={({ item }) => (
            <GuildCard
              name={item.name}
              id={item.id}
              isActive={item.isActive}
              roleCount={item.roleCount}
              onPress={() => router.push(`/guilds/${item.id}`)}
            />
          )}
        />
      </View>
    </WalletRequired>
  );
}
