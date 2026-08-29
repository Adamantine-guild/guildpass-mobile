import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  RefreshControl,
  useColorScheme,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { useWallet } from "../src/features/wallet/useWallet";
import { useGuilds, type GuildListItem } from "../src/features/guilds/useGuilds";
import { AppHeader } from "../src/components/AppHeader";
import { GuildCard } from "../src/components/GuildCard";
import { GuildListSkeleton } from "../src/components/GuildCardSkeleton";
import { ErrorState } from "../src/components/ErrorState";
import { EmptyMembershipsState } from "../src/components/EmptyMembershipsState";
import { EmptyState } from "../src/components/EmptyState";
import { WalletRequired } from "../src/components/WalletRequired";
import { useDebouncedValue } from "../src/lib/useDebouncedValue";
import React, { useState, useMemo, useCallback } from "react";
import { useMembership, type EnrichedMembership } from "../src/features/membership/useMembership";
import { StaleDataBanner } from "../src/components/StaleDataBanner";
import { useCombinedStaleState } from "../src/features/offline/useStaleQuery";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../src/lib/queryKeys";

type GuildListRow = {
  guildId: string;
  guildName: string;
  isActive: boolean;
  roleCount: number;
  status?: EnrichedMembership["status"];
};

const GuildCardListItem = React.memo(function GuildCardListItem({
  item,
  offlineCached,
  onPress,
}: {
  item: GuildListRow;
  offlineCached: boolean;
  onPress: (guildId: string) => void;
}) {
  const handlePress = useCallback(() => {
    onPress(item.guildId);
  }, [item.guildId, onPress]);

  return (
    <GuildCard
      name={item.guildName}
      id={item.guildId}
      isActive={item.isActive}
      roleCount={item.roleCount}
      status={item.status}
      offlineCached={offlineCached}
      onPress={handlePress}
    />
  );
});

function rowsFromWalletGuilds(
  guilds: GuildListItem[],
  memberships: EnrichedMembership[],
): GuildListRow[] {
  const membershipsByGuildId = new Map(
    memberships.map((membership) => [membership.guildId, membership]),
  );

  return guilds.map((guild) => {
    const membership = membershipsByGuildId.get(guild.id);
    return {
      guildId: guild.id,
      guildName: guild.name,
      isActive: guild.isActive,
      roleCount: guild.roleCount ?? membership?.roleCount ?? 0,
      status: guild.status ?? membership?.status ?? (guild.isActive ? "active" : "inactive"),
    };
  });
}

function rowsFromMemberships(memberships: EnrichedMembership[]): GuildListRow[] {
  return memberships.map((membership) => ({
    guildId: membership.guildId,
    guildName: membership.guildName,
    isActive: membership.isActive,
    roleCount: membership.roleCount,
    status: membership.status,
  }));
}

export default function Guilds() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const { walletAddress, disconnect } = useWallet();
  const { useWalletGuilds } = useGuilds();
  const { useEnrichedMemberships } = useMembership(walletAddress);
  const queryClient = useQueryClient();

  const guildsQuery = useWalletGuilds(walletAddress);
  const membershipsQuery = useEnrichedMemberships();
  const memberships = membershipsQuery.data ?? [];
  const staleState = useCombinedStaleState([guildsQuery, membershipsQuery]);

  const [searchQuery, setSearchQuery] = useState("");
  const [isRefetching, setIsRefetching] = useState(false);
  const debouncedQuery = useDebouncedValue(searchQuery, 300);

  const listRows = useMemo(() => {
    const guilds = guildsQuery.data ?? [];
    return guilds.length > 0
      ? rowsFromWalletGuilds(guilds, memberships)
      : rowsFromMemberships(memberships);
  }, [guildsQuery.data, memberships]);

  const filteredGuilds = useMemo(() => {
    const query = debouncedQuery.trim().toLowerCase();
    if (!query) return listRows;
    return listRows.filter((guild) => guild.guildName.toLowerCase().includes(query));
  }, [listRows, debouncedQuery]);

  const handleConnectDifferentWallet = async () => {
    await disconnect();
    router.replace("/profile");
  };

  const handleRefresh = useCallback(async () => {
    if (!walletAddress) return;

    setIsRefetching(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.walletGuilds.byWallet(walletAddress) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.memberships.byWallet(walletAddress) }),
        guildsQuery.refetch(),
        membershipsQuery.refetch(),
      ]);
    } finally {
      setIsRefetching(false);
    }
  }, [guildsQuery, membershipsQuery, queryClient, walletAddress]);

  const handleGuildPress = useCallback(
    (guildId: string) => {
      router.push(`/guilds/${guildId}`);
    },
    [router],
  );

  const keyExtractor = useCallback((item: GuildListRow) => item.guildId, []);

  const isShowingOfflineCache = staleState.isOffline && filteredGuilds.length > 0;

  const renderItem = useCallback(
    ({ item }: { item: GuildListRow }) => (
      <GuildCardListItem
        item={item}
        offlineCached={isShowingOfflineCache}
        onPress={handleGuildPress}
      />
    ),
    [handleGuildPress, isShowingOfflineCache],
  );

  if (!walletAddress) {
    return (
      <WalletRequired>
        <View className="flex-1 bg-background dark:bg-slate-900" testID="guilds-screen">
          <AppHeader title="My Guilds" showBack />
          <EmptyState
            title="Connect Wallet"
            message="Connect a wallet to load your GuildPass guilds."
          />
        </View>
      </WalletRequired>
    );
  }

  if (guildsQuery.isLoading && membershipsQuery.isLoading && listRows.length === 0) {
    return (
      <WalletRequired>
        <View className="flex-1 bg-background dark:bg-slate-900" testID="guilds-screen">
          <AppHeader title="My Guilds" showBack />
          <GuildListSkeleton />
        </View>
      </WalletRequired>
    );
  }

  if (guildsQuery.isError && membershipsQuery.error && listRows.length === 0) {
    return (
      <WalletRequired>
        <View className="flex-1 bg-background dark:bg-slate-900" testID="guilds-screen">
          <AppHeader title="My Guilds" showBack />
          {staleState.isOffline ? (
            <StaleDataBanner reason="offline" lastSyncedAt={staleState.lastSyncedAt} />
          ) : null}
          <ErrorState
            message={
              guildsQuery.error instanceof Error
                ? guildsQuery.error.message
                : "Unable to load your guilds."
            }
            onRetry={handleRefresh}
            isRetrying={isRefetching || guildsQuery.isFetching || membershipsQuery.isFetching}
          />
        </View>
      </WalletRequired>
    );
  }

  if (listRows.length === 0) {
    return (
      <WalletRequired>
        <View className="flex-1 bg-background dark:bg-slate-900" testID="guilds-screen">
          <AppHeader title="My Guilds" showBack />
          {staleState.isOffline ? (
            <StaleDataBanner reason="offline" lastSyncedAt={staleState.lastSyncedAt} />
          ) : null}
          <EmptyMembershipsState onConnectDifferentWallet={handleConnectDifferentWallet} />
        </View>
      </WalletRequired>
    );
  }

  const staleBanner = staleState.isOffline ? (
    <StaleDataBanner reason="offline" lastSyncedAt={staleState.lastSyncedAt} />
  ) : staleState.isStale && staleState.reason ? (
    <StaleDataBanner reason={staleState.reason} lastSyncedAt={staleState.lastSyncedAt} />
  ) : null;

  const searchHeader = (
    <View>
      {staleBanner}
      <View className="px-4 pt-2 pb-1">
        <View className="flex-row items-center bg-white dark:bg-slate-800 rounded-xl px-4 py-3 border border-border dark:border-slate-700">
          <Text className="text-text-muted dark:text-slate-400 mr-2">🔍</Text>
          <TextInput
            className="flex-1 text-text dark:text-slate-100 text-base"
            placeholder="Search guilds..."
            placeholderTextColor={colorScheme === "dark" ? "#94a3b8" : "#9ca3af"}
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
              <Text className="text-text-muted dark:text-slate-400 text-lg ml-2">✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );

  const isRefreshing = isRefetching || guildsQuery.isRefetching || membershipsQuery.isRefetching;

  return (
    <WalletRequired>
      <View className="flex-1 bg-background dark:bg-slate-900" testID="guilds-screen">
        <AppHeader title="My Guilds" showBack />
        <FlashList
          data={filteredGuilds}
          keyExtractor={keyExtractor}
          contentContainerStyle={{ padding: 16 }}
          estimatedItemSize={96}
          testID="guilds-list"
          ListHeaderComponent={searchHeader}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
          renderItem={renderItem}
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
