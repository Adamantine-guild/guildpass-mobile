import { View, FlatList, TextInput, TouchableOpacity, Text } from "react-native";
import { useRouter } from "expo-router";
import { useWallet } from "../src/features/wallet/useWallet";
import { AppHeader } from "../src/components/AppHeader";
import { GuildCard } from "../src/components/GuildCard";
import { LoadingState } from "../src/components/LoadingState";
import { ErrorState } from "../src/components/ErrorState";
import { EmptyMembershipsState } from "../src/components/EmptyMembershipsState";
import { EmptyState } from "../src/components/EmptyState";
import { WalletRequired } from "../src/components/WalletRequired";
import { useDebouncedValue } from "../src/lib/useDebouncedValue";
import React, { useState, useMemo } from "react";
import { useMembership } from "../src/features/membership/useMembership";
import { StaleDataBanner } from "../src/components/StaleDataBanner";
import { useStaleQuery } from "../src/features/offline/useStaleQuery";

export default function Guilds() {
  const router = useRouter();
  const { walletAddress, disconnect } = useWallet();
  const { useEnrichedMemberships } = useMembership(walletAddress);
  const membershipsQuery = useEnrichedMemberships();
  const { data: memberships, isLoading, error } = membershipsQuery;
  const staleState = useStaleQuery(membershipsQuery);

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebouncedValue(searchQuery, 300);

  const filteredMemberships = useMemo(() => {
    if (!memberships) return [];
    const query = debouncedQuery.trim().toLowerCase();
    if (!query) return memberships;
    return memberships.filter((m) => m.guildName.toLowerCase().includes(query));
  }, [memberships, debouncedQuery]);

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
        {/* Search Input */}
        <View className="px-4 pt-2 pb-1">
          <View className="flex-row items-center bg-white rounded-xl px-4 py-3 border border-border">
            <Text className="text-text-muted mr-2">🔍</Text>
            <TextInput
              className="flex-1 text-text text-base"
              placeholder="Search guilds..."
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
              testID="guild-search-input"
              accessibilityLabel="Search guilds by name"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery("")}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                testID="guild-search-clear"
                accessibilityLabel="Clear search"
              >
                <Text className="text-text-muted text-lg ml-2">✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        {/* Guild List */}
        <FlatList
          ListHeaderComponent={
            staleState.isOffline ? (
              <StaleDataBanner reason="offline" lastSyncedAt={staleState.lastSyncedAt} />
            ) : staleState.isStale && staleState.reason ? (
              <StaleDataBanner reason={staleState.reason} lastSyncedAt={staleState.lastSyncedAt} />
            ) : null
          }
          data={filteredMemberships}
          keyExtractor={(item) => item.guildId}
          contentContainerStyle={{ padding: 16 }}
          testID="guilds-list"
          renderItem={({ item }) => (
            <GuildCard
              name={item.guildName}
              id={item.guildId}
              isActive={item.isActive}
              roleCount={item.roleCount}
              onPress={() => router.push(`/guilds/${item.guildId}`)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              title="No Guilds Found"
              message={`No guilds match "${debouncedQuery}". Try a different search term.`}
            />
          }
        />
      </View>
    </WalletRequired>
  );
}
