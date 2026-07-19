import { View, FlatList, TextInput, TouchableOpacity, Text } from "react-native";
import { useRouter } from "expo-router";
import { useWallet } from "../src/features/wallet/useWallet";
import { useMembership } from "../src/features/membership/useMembership";
import { AppHeader } from "../src/components/AppHeader";
import { GuildCard } from "../src/components/GuildCard";
import { LoadingState } from "../src/components/LoadingState";
import { ErrorState } from "../src/components/ErrorState";
import { EmptyMembershipsState } from "../src/components/EmptyMembershipsState";
import { EmptyState } from "../src/components/EmptyState";
import { WalletRequired } from "../src/components/WalletRequired";
import { useDebouncedValue } from "../src/lib/useDebouncedValue";
import React, { useState, useMemo } from "react";

type Membership = {
  id: string;
  name: string;
  isActive: boolean;
  roleCount: number;
};

export default function Guilds() {
  const router = useRouter();
  const { walletAddress, disconnect } = useWallet();
  const { useMembershipsQuery } = useMembership(walletAddress);
  const { data: memberships, isLoading, error } = useMembershipsQuery();

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebouncedValue(searchQuery, 300);

  const filteredMemberships = useMemo<Membership[]>(() => {
    if (!memberships) return [];
    const query = debouncedQuery.trim().toLowerCase();
    if (!query) return memberships;
    return memberships.filter((m) => m.name.toLowerCase().includes(query));
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

  if (error) {
    return (
      <WalletRequired>
        <View className="flex-1 bg-background" testID="guilds-screen">
          <AppHeader title="My Guilds" showBack />
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
        {filteredMemberships.length === 0 ? (
          <EmptyState
            title="No Guilds Found"
            message={`No guilds match "${debouncedQuery}". Try a different search term.`}
          />
        ) : (
          <FlatList
            data={filteredMemberships}
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
          />
        )}
      </View>
    </WalletRequired>
  );
}
