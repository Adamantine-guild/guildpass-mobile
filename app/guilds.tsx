import { View, FlatList, TextInput, TouchableOpacity, Text, RefreshControl, useColorScheme } from "react-native";
import { useRouter } from "expo-router";
import { useWallet } from "../src/features/wallet/useWallet";
import { useGuilds } from "../src/features/guilds/useGuilds";
import { AppHeader } from "../src/components/AppHeader";
import { GuildCard } from "../src/components/GuildCard";
import { GuildListSkeleton } from "../src/components/GuildCardSkeleton";
import { ErrorState } from "../src/components/ErrorState";
import { EmptyMembershipsState } from "../src/components/EmptyMembershipsState";
import { EmptyState } from "../src/components/EmptyState";
import { WalletRequired } from "../src/components/WalletRequired";
import { useDebouncedValue } from "../src/lib/useDebouncedValue";
import React, { useState, useMemo, useCallback } from "react";
import { useMembership } from "../src/features/membership/useMembership";
import { StaleDataBanner } from "../src/components/StaleDataBanner";
import { useStaleQuery } from "../src/features/offline/useStaleQuery";
import { useQueryClient } from "@tanstack/react-query";

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
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery("")}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              testID="guild-search-clear"
              accessibilityLabel="Clear search"
            >
              <Text className="text-text-muted dark:text-slate-400 text-lg ml-2">✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );

  const isRefreshing = isRefetching || membershipsQuery.isRefetching;

  return (
    <WalletRequired>
      <View className="flex-1 bg-background dark:bg-slate-900" testID="guilds-screen">
        <AppHeader title="My Guilds" showBack />
        <FlatList
          data={filteredMemberships}
          keyExtractor={(item) => item.guildId}
          contentContainerStyle={{ padding: 16 }}
          testID="guilds-list"
          ListHeaderComponent={searchHeader}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
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